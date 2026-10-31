import { createHash, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import postgres from "postgres";
import { financingCalculator } from "./load-financing-calculator.mjs";

const { calculateFinancingQuote } = financingCalculator;
const env = Object.fromEntries(readFileSync(new URL("../.env.local", import.meta.url), "utf8").split(/\r?\n/).filter(row => /^[A-Z0-9_]+=/.test(row)).map(row => {
  const i = row.indexOf("="); return [row.slice(0, i), row.slice(i + 1).trim().replace(/^['"]|['"]$/g, "")];
}));
for (const key of ["DATABASE_URL", "NEXT_PUBLIC_SUPABASE_URL"]) {
  if (!["localhost", "127.0.0.1"].includes(new URL(env[key]).hostname)) throw new Error("La demo de vendedores solo admite servicios locales.");
}
const sql = postgres(env.DATABASE_URL, { max: 1, prepare: false });
const auth = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const dataset = "kredimax-demo-cajas-v1";
const folder = new URL("../.local-demo/", import.meta.url), credentialsFile = new URL("sellers.json", folder);
mkdirSync(folder, { recursive: true });
const hasSavedCredentials = existsSync(credentialsFile);
const credentials = hasSavedCredentials ? JSON.parse(readFileSync(credentialsFile, "utf8")) : {
  dataset, password: `Demo!${randomBytes(18).toString("base64url")}`,
  sellers: [1, 2, 3].map(index => ({ name: `DEMO · Vendedor ${index}`, email: `vendedor${index}@demo.kredimax.test` })),
};
if (credentials.dataset !== dataset || credentials.sellers.length !== 3) throw new Error("El archivo local de vendedores no corresponde a esta demo.");
function id(key) {
  const hex = createHash("sha256").update(`${dataset}:${key}`).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}
function imei(index) {
  const digits = `99000000003${String(index).padStart(3, "0")}`;
  let sum = 0;
  for (let i = 0; i < 14; i++) { let value = Number(digits[i]) * (i % 2 ? 2 : 1); if (value > 9) value -= 9; sum += value; }
  return digits + (10 - sum % 10) % 10;
}
const evidence = Buffer.from("524946463600000057454250565038202a0000003003009d012a280028003e6d369848a42322a1238800800d896900001b81bd3e0e0000fefb2180000000", "hex");
try {
  const contexts = await sql`SELECT m.tenant_id,m.user_id,m.branch_id FROM public.tenant_memberships m
    JOIN public.tenants t ON t.id=m.tenant_id JOIN auth.users u ON u.id=m.user_id
    WHERE t.name='YacellTech' AND t.status='active' AND m.role='tenant_admin' AND m.status='active' AND lower(u.email)=lower(${env.KREDIMAX_LOCAL_ADMIN_EMAIL})`;
  if (contexts.length !== 1 || !contexts[0].branch_id) throw new Error("Se requiere una única membresía administradora local de YacellTech con sucursal.");
  const context = contexts[0];
  const existingAccounts = await sql`SELECT id,email,raw_app_meta_data FROM auth.users WHERE lower(email)=ANY(${credentials.sellers.map(seller => seller.email.toLowerCase())})`;
  if (!hasSavedCredentials && existingAccounts.length) throw new Error("Las cuentas demo ya existen, pero falta su archivo de contraseñas. Recupera el archivo original o restablece esas cuentas desde Usuarios; no se cambiaron contraseñas.");
  writeFileSync(credentialsFile, JSON.stringify(credentials, null, 2));
  const sellers = [];
  for (const entry of credentials.sellers) {
    const existing = existingAccounts.find(account => account.email.toLowerCase() === entry.email.toLowerCase());
    if (existing && (existing.raw_app_meta_data?.demo_dataset !== dataset || existing.raw_app_meta_data?.kredimax_created_for_tenant !== context.tenant_id)) {
      throw new Error("Ya existe un correo de demo que no pertenece a este conjunto. No se modificó esa cuenta.");
    }
    let userId = existing?.id;
    if (!userId) {
      const created = await auth.auth.admin.createUser({ email: entry.email, password: credentials.password, email_confirm: true,
        user_metadata: { full_name: entry.name }, app_metadata: { demo_dataset: dataset, kredimax_created_for_tenant: context.tenant_id, kredimax_created_by: context.user_id } });
      if (created.error) throw created.error;
      userId = created.data.user.id;
    }
    sellers.push({ ...entry, id: userId });
  }
  const summary = await sql.begin(async tx => {
    await tx`SELECT pg_advisory_xact_lock(hashtext(${dataset}))`;
    for (const seller of sellers) {
      const [membership] = await tx`SELECT tenant_id,branch_id,role,status FROM public.tenant_memberships WHERE user_id=${seller.id}`;
      if (!membership) await tx`SELECT public.provision_tenant_user(${context.tenant_id},${context.user_id},${seller.id},'sales',${context.branch_id})`;
      else if (membership.tenant_id !== context.tenant_id || membership.branch_id !== context.branch_id || membership.role !== "sales" || membership.status !== "active") throw new Error("La membresía de demo fue modificada. Revisar sin sobrescribir.");
    }
    const asUser = async userId => {
      await tx.unsafe("RESET ROLE");
      await tx`SELECT set_config('request.jwt.claim.sub',${userId},true),set_config('request.jwt.claims',${JSON.stringify({ sub: userId, role: "authenticated", aal: "aal1" })},true)`;
      await tx.unsafe("SET LOCAL ROLE authenticated");
    };
    const [settings] = await tx`SELECT * FROM public.financing_settings WHERE tenant_id=${context.tenant_id}`;
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santo_Domingo" }).format(new Date());
    const report = [];
    for (const [offset, seller] of sellers.entries()) {
      for (const [methodOffset, method] of ["cash", "bank_transfer"].entries()) {
        const index = offset * 2 + methodOffset + 1, customerId = id(`${context.tenant_id}:customer:${index}`);
        await tx.unsafe("RESET ROLE");
        const [existing] = await tx`SELECT id FROM public.customers WHERE id=${customerId}`;
        if (existing) {
          const links = await tx`SELECT l.id AS loan_id,c.contract_number,p.id AS payment_id,p.payment_type,p.payment_method
            FROM public.loans l JOIN public.credit_contracts c ON c.tenant_id=l.tenant_id AND c.id=l.contract_id
            LEFT JOIN public.payments p ON p.tenant_id=l.tenant_id AND p.loan_id=l.id
            WHERE l.tenant_id=${context.tenant_id} AND l.customer_id=${customerId} ORDER BY p.received_at,p.id`;
          report.push({ seller: seller.name, customerId, preserved: true, records: links }); continue;
        }
        const quote = calculateFinancingQuote({ salePrice: String(10000 + index * 1000), deviceCost: String(10000 + index * 1000),
          downPaymentPercent: settings.down_payment_percent, annualRatePercent: settings.annual_rate_percent, legalExpenses: settings.legal_expenses,
          recoveryTargetPercent: settings.recovery_target_percent, recoveryEnabled: settings.recovery_enabled,
          allowedTerms: settings.allowed_terms, termMonths: settings.allowed_terms.includes(5) ? 5 : settings.allowed_terms[0], frequency: "fortnightly", firstInstallmentDate: today, today });
        quote.recoveryTargetPercent = settings.recovery_target_percent;
        const customerName = `DEMO · Caja ${offset + 1} · Cliente ${methodOffset + 1}`;
        quote.applicant = { customerName, identityNumber: `DEMO-CAJA-${index}`, phone: `809-555-03${String(index).padStart(2, "0")}`,
          address: `Dirección ficticia ${index} · La Romana`, employer: "Empresa ficticia", monthlyIncome: "40000.00", reference: null };
        quote.device = { brand: "Samsung", model: `Galaxy A16 · DEMO CAJA ${index}`, imei: imei(index), condition: "new", inventoryBranch: "YacellTech La Romana" };
        quote.demonstration = { dataset, fictional: true, seller: seller.email };
        await asUser(seller.id);
        await tx`INSERT INTO public.customers(id,tenant_id,branch_id,full_name,identity_number,phone,address,home_location,reference_name,reference_phone)
          VALUES(${customerId},${context.tenant_id},${context.branch_id},${customerName},${quote.applicant.identityNumber},${quote.applicant.phone},${quote.applicant.address},'Ubicación ficticia de demostración','Referencia ficticia','809-555-0399')`;
        const [application] = await tx`SELECT public.create_credit_application(${context.tenant_id},${customerId},NULL,${context.branch_id},${quote.principal},${tx.json(quote)},${id(`submission:${index}`)}) AS id`;
        await asUser(context.user_id);
        const [loan] = await tx`SELECT public.review_credit_application(${application.id},'approved','DEMO: aprobación ficticia para probar caja.',${quote.adjustmentRequiresApproval ? "Demostración" : null},${quote.adjustmentRequiresApproval ? "Soporte ficticio" : null},${quote.adjustmentRequiresApproval}) AS id`;
        await asUser(seller.id);
        const [initial] = await tx`SELECT public.activate_approved_loan_with_evidence(${loan.id},${method},${`DEMO-CAJA-INICIAL-${index}`},${id(`initial:${index}`)},'DEMO/contrato-ficticio',true,${today}::date,${evidence},true) AS id`;
        const [payment] = await tx`SELECT public.record_loan_payment_with_evidence(${loan.id},${String(500 + index * 50)},${id(`payment:${index}`)},${method},${`DEMO-CAJA-CUOTA-${index}`},${evidence},true) AS id`;
        report.push({ seller: seller.name, customerId, applicationId: application.id, loanId: loan.id, initialId: initial.id, paymentId: payment.id, method });
      }
    }
    await asUser(context.user_id);
    const [{ rows }] = await tx`SELECT public.cash_day_report(${context.tenant_id},${today}::date) AS rows`;
    for (const seller of sellers) {
      if (rows.filter(row => row.sellerId === seller.id).length !== 2) throw new Error("La caja demo no aparece en ambos tipos de cuadre.");
    }
    return { date: today, sellers: sellers.map(({ name, email, id }) => ({ name, email, id })), entries: report,
      cashRows: rows.filter(row => sellers.some(seller => seller.id === row.sellerId)) };
  });
  writeFileSync(new URL("seller-manifest.json", folder), JSON.stringify(summary, null, 2));
  console.log(JSON.stringify({ date: summary.date, sellers: summary.sellers.map(({ name, email }) => ({ name, email })), examples: summary.entries.length,
    drawerRows: summary.cashRows.length, credentials: ".local-demo/sellers.json", manifest: ".local-demo/seller-manifest.json" }, null, 2));
} finally { await sql.end({ timeout: 5 }); }
