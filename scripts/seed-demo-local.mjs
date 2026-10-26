import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import postgres from "postgres";
import { financingCalculator } from "./load-financing-calculator.mjs";
const { calculateFinancingQuote, DEFAULT_FINANCING_SETTINGS } = financingCalculator;

// Persistent, fictional demonstration data. Rerunning preserves the operator's progress.
const env = Object.fromEntries(readFileSync(new URL("../.env.local", import.meta.url), "utf8").split(/\r?\n/)
  .filter((line) => /^[A-Z0-9_]+=/.test(line)).map((line) => {
    const separator = line.indexOf("=");
    return [line.slice(0, separator), line.slice(separator + 1).trim().replace(/^['"]|['"]$/g, "")];
  }));
const databaseUrl = new URL(env.DATABASE_URL);
if (!new Set(["127.0.0.1", "localhost"]).has(databaseUrl.hostname)
    || !["postgres", "kredimax_local_test"].includes(databaseUrl.pathname.slice(1))) {
  throw new Error("La demostración solo puede cargarse en la base local de KrediMax.");
}
if (!env.KREDIMAX_LOCAL_ADMIN_EMAIL) throw new Error("Falta la cuenta administradora local configurada.");
const mode = process.argv[2] ?? "seed";
if (!["seed", "verify"].includes(mode)) throw new Error("Uso: node scripts/seed-demo-local.mjs [seed|verify]");
const sql = postgres(env.DATABASE_URL, { max: 1, prepare: false });
const dataset = "kredimax-demo-v1";
const definitions = [
  ["Ana Rodríguez", "Samsung", "Galaxy A16", "8500", "pending", 0],
  ["Carlos Méndez", "Motorola", "Moto G15", "12500", "documents_requested", 0],
  ["Laura Pérez", "Xiaomi", "Redmi 14C", "9000", "rejected", 0],
  ["José Martínez", "Samsung", "Galaxy A26", "15900", "approved", 0],
  ["María Castillo", "Honor", "X6b", "10000", "active", 0],
  ["Pedro García", "Samsung", "Galaxy A36", "18000", "partial", 0],
  ["Sofía Hernández", "Motorola", "Moto G54", "14500", "overdue", -20],
  ["Luis Santana", "Samsung", "Galaxy A56", "22000", "advance", 4],
  ["Carmen Díaz", "Tecno", "Spark 30C", "7500", "paid_off", 0],
  ["Andrés Núñez", "Xiaomi", "Redmi Note 14", "16500", "reversed", 6],
];
function stableId(key) {
  const bytes = createHash("sha256").update(`${dataset}:${key}`).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 15) | 64; bytes[8] = (bytes[8] & 63) | 128;
  const hex = bytes.toString("hex");
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}
function testImei(index) {
  const digits = `99000000001${String(index).padStart(3, "0")}`;
  let sum = 0;
  for (let i = 0; i < 14; i++) { let digit = Number(digits[i]) * (i % 2 ? 2 : 1); if (digit > 9) digit -= 9; sum += digit; }
  return digits + ((10 - sum % 10) % 10);
}
function addDays(date, days) {
  const result = new Date(`${date}T00:00:00Z`); result.setUTCDate(result.getUTCDate() + days); return result.toISOString().slice(0, 10);
}
async function context(tx) {
  const rows = await tx`SELECT t.id AS tenant_id,m.user_id,m.branch_id
    FROM public.tenants t JOIN public.tenant_memberships m ON m.tenant_id=t.id
    JOIN auth.users u ON u.id=m.user_id
    WHERE t.name='YacellTech' AND t.status='active' AND m.status='active'
      AND m.role='tenant_admin' AND lower(u.email)=lower(${env.KREDIMAX_LOCAL_ADMIN_EMAIL})`;
  if (rows.length !== 1 || !rows[0].branch_id) throw new Error("Se requiere la única membresía administradora local de YacellTech con sucursal.");
  const ctx = rows[0];
  await tx`SELECT set_config('request.jwt.claim.sub',${ctx.user_id},true)`;
  await tx`SELECT set_config('request.jwt.claims',${JSON.stringify({ sub: ctx.user_id, role: "authenticated", aal: "aal1" })},true)`;
  return ctx;
}
async function verify(tx, tenantId) {
  const [report] = await tx`WITH demo AS (
    SELECT id FROM public.customers WHERE tenant_id=${tenantId} AND identity_number ~ '^DEMO-KM-[0-9]{3}$'
  ), demo_loans AS (SELECT id FROM public.loans WHERE tenant_id=${tenantId} AND customer_id IN (SELECT id FROM demo)),
  demo_payments AS (SELECT * FROM public.payments WHERE tenant_id=${tenantId} AND loan_id IN (SELECT id FROM demo_loans))
  SELECT (SELECT count(*)::int FROM demo) AS customers,
    (SELECT count(*)::int FROM public.credit_applications WHERE tenant_id=${tenantId} AND customer_id IN (SELECT id FROM demo)) AS applications,
    (SELECT count(DISTINCT device_id)::int FROM public.credit_applications WHERE tenant_id=${tenantId} AND customer_id IN (SELECT id FROM demo)) AS devices,
    (SELECT count(*)::int FROM demo_loans) AS loans,
    (SELECT count(*)::int FROM public.installments WHERE tenant_id=${tenantId} AND loan_id IN (SELECT id FROM demo_loans)) AS installments,
    (SELECT count(*)::int FROM demo_payments) AS payments,
    (SELECT count(*)::int FROM demo_payments WHERE reversed_at IS NOT NULL) AS reversed_payments,
    (SELECT coalesce(sum(amount),0)::text FROM demo_payments WHERE reversed_at IS NULL) AS net_payments,
    (SELECT coalesce(sum(amount),0)::text FROM public.ledger_entries WHERE tenant_id=${tenantId} AND payment_id IN (SELECT id FROM demo_payments)) AS ledger_net,
    (SELECT count(*)::int FROM public.installments i WHERE i.tenant_id=${tenantId} AND i.loan_id IN (SELECT id FROM demo_loans)
      AND (i.amount_paid<0 OR i.amount_paid>i.amount_due OR i.amount_paid<>coalesce((SELECT sum(a.amount) FROM public.payment_allocations a JOIN public.payments p ON p.id=a.payment_id AND p.tenant_id=a.tenant_id WHERE a.installment_id=i.id AND a.tenant_id=i.tenant_id AND p.reversed_at IS NULL),0))) AS allocation_conflicts`;
  if (report.customers !== 10 || report.applications < 10 || report.devices < 10 || report.loans < 7
      || report.allocation_conflicts || Number(report.net_payments) !== Number(report.ledger_net)) {
    throw new Error(`La demostración no concilia: ${JSON.stringify(report)}`);
  }
  return report;
}
try {
  const result = await sql.begin(async (tx) => {
    const ctx = await context(tx);
    await tx`SELECT pg_advisory_xact_lock(hashtext(${dataset}))`;
    const [existing] = await tx`SELECT count(*)::int AS total FROM public.customers WHERE tenant_id=${ctx.tenant_id} AND identity_number ~ '^DEMO-KM-[0-9]{3}$'`;
    if (mode === "verify" || existing.total === 10) {
      return { existing: true, tenantId: ctx.tenant_id, report: await verify(tx, ctx.tenant_id) };
    }
    if (existing.total) throw new Error("Hay una carga DEMO parcial; revisar antes de continuar. No se modificó ningún registro.");
    const original = [];
    for (const table of ["customers", "devices", "credit_applications", "credit_contracts", "loans", "installments", "payments", "payment_allocations", "ledger_entries"]) {
      const rows = await tx.unsafe(`SELECT id::text,md5(to_jsonb(t)::text) AS digest FROM public.${table} t WHERE tenant_id=$1`, [ctx.tenant_id]);
      original.push({ table, rows });
    }
    const [settingsRow] = await tx`SELECT * FROM public.financing_settings WHERE tenant_id=${ctx.tenant_id}`;
    const settings = settingsRow ? {
      downPaymentPercent: settingsRow.down_payment_percent, annualRatePercent: settingsRow.annual_rate_percent,
      legalExpenses: settingsRow.legal_expenses, recoveryTargetPercent: settingsRow.recovery_target_percent,
      recoveryEnabled: settingsRow.recovery_enabled, allowedTerms: settingsRow.allowed_terms,
    } : DEFAULT_FINANCING_SETTINGS;
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santo_Domingo" }).format(new Date());
    const entries = [];
    for (const [offset, definition] of definitions.entries()) {
      const index = offset + 1;
      const [name, brand, model, price, scenario, days] = definition;
      const customerId = stableId(`${ctx.tenant_id}:customer:${index}`);
      const firstDate = addDays(today, days);
      const term = settings.allowedTerms.includes(5) ? 5 : settings.allowedTerms[0];
      const quote = calculateFinancingQuote({ ...settings, salePrice: price, deviceCost: price,
        termMonths: term, frequency: "fortnightly", firstInstallmentDate: firstDate, today: firstDate });
      quote.recoveryTargetPercent = settings.recoveryTargetPercent;
      quote.applicant = { customerName: `DEMO · ${name}`, identityNumber: `DEMO-KM-${String(index).padStart(3,"0")}`,
        phone: `809-555-01${String(index).padStart(2,"0")}`, address: `Dirección ficticia ${index} · La Romana`, employer: "Empresa de demostración", monthlyIncome: "30000.00", reference: null };
      quote.device = { brand, model: `${model} · DEMO`, imei: testImei(index), condition: "new", inventoryBranch: "YacellTech La Romana" };
      quote.demonstration = { dataset, scenario, fictional: true };
      await tx`INSERT INTO public.customers(id,tenant_id,branch_id,full_name,identity_number,phone,address,employer,monthly_income)
        VALUES(${customerId},${ctx.tenant_id},${ctx.branch_id},${quote.applicant.customerName},${quote.applicant.identityNumber},${quote.applicant.phone},${quote.applicant.address},${quote.applicant.employer},${quote.applicant.monthlyIncome})`;
      let applicationId;
      if (days < 0) {
        // Only this newly inserted fictional historical case is backdated; existing rows are never rewritten.
        const [row] = await tx`INSERT INTO public.credit_applications(tenant_id,customer_id,branch_id,requested_amount,quote_snapshot,submission_key,created_by,created_at)
          VALUES(${ctx.tenant_id},${customerId},${ctx.branch_id},${quote.principal},${tx.json(quote)},${stableId(`submission:${index}`)},${ctx.user_id},${firstDate}::date)
          RETURNING id`;
        applicationId = row.id;
        await tx`INSERT INTO public.credit_application_events(tenant_id,application_id,actor_id,event_type,to_status,notes,created_at)
          VALUES(${ctx.tenant_id},${applicationId},${ctx.user_id},'application_created','pending','DEMO: expediente histórico ficticio para mostrar cuotas vencidas.',${firstDate}::date)`;
      } else {
        await tx.unsafe("SET LOCAL ROLE authenticated");
        const [row] = await tx`SELECT public.create_credit_application(${ctx.tenant_id},${customerId},NULL,${ctx.branch_id},${quote.principal},${tx.json(quote)},${stableId(`submission:${index}`)}) AS id`;
        await tx.unsafe("RESET ROLE"); applicationId = row.id;
      }
      let loanId = null;
      const paymentIds = [];
      await tx.unsafe("SET LOCAL ROLE authenticated");
      if (scenario === "documents_requested" || scenario === "rejected") {
        await tx`SELECT public.review_credit_application(${applicationId},${scenario},'DEMO: decisión ficticia para recorrer la evaluación.',NULL,NULL,false)`;
      } else if (scenario !== "pending") {
        const [loan] = await tx`SELECT public.review_credit_application(${applicationId},'approved','DEMO: expediente ficticio aprobado.',${quote.adjustmentRequiresApproval ? "Demostración" : null},${quote.adjustmentRequiresApproval ? "DEMO: soporte ficticio de la cotización" : null},${quote.adjustmentRequiresApproval}) AS id`;
        loanId = loan.id;
        if (scenario !== "approved") {
          const [initial] = await tx`SELECT public.activate_approved_loan_with_evidence(${loanId},'cash',${`DEMO-INICIAL-${index}`},${stableId(`initial:${index}`)},${`DEMO/contrato-ficticio-${index}.pdf`},true,${days < 0 ? firstDate : today}::date,decode('524946463600000057454250565038202a0000003003009d012a280028003e6d369848a42322a1238800800d896900001b81bd3e0e0000fefb2180000000','hex'),true) AS id`;
          paymentIds.push(initial.id);
          let amount = null;
          if (scenario === "partial") amount = "500.00";
          if (scenario === "advance") amount = (Number(quote.fixedInstallment) * 2).toFixed(2);
          if (scenario === "paid_off") amount = quote.schedule.reduce((sum, row) => sum + Math.round(Number(row.amount)*100), 0) / 100 + "";
          if (scenario === "reversed") amount = "750.00";
          if (amount) {
            const [payment] = await tx`SELECT public.record_loan_payment_with_evidence(${loanId},${amount},${stableId(`payment:${index}`)},${scenario === "advance" ? "bank_transfer" : "cash"},${`DEMO-PAGO-${index}`},decode('524946463600000057454250565038202a0000003003009d012a280028003e6d369848a42322a1238800800d896900001b81bd3e0e0000fefb2180000000','hex'),true) AS id`;
            paymentIds.push(payment.id);
            if (scenario === "reversed") await tx`SELECT public.reverse_loan_payment(${payment.id},'DEMO: reverso ficticio para consultar el historial y el comprobante.')`;
          }
        }
      }
      await tx.unsafe("RESET ROLE");
      entries.push({ name: quote.applicant.customerName, scenario, customerId, applicationId, loanId, paymentIds });
    }
    for (const [index, title, body] of [
      [1,"DEMO · Demostración lista","Hay diez clientes ficticios con solicitudes, equipos, cuotas, pagos y comprobantes. Puedes operar sobre los casos marcados DEMO."],
      [2,"DEMO · Solicitud pendiente de evaluación","Ana Rodríguez espera revisión. Abre Solicitudes para solicitar documentos o aprobar su expediente ficticio."],
      [3,"DEMO · Financiamiento pendiente de activación","José Martínez tiene aprobación y cronograma. Registra el inicial, el contrato ficticio y la entrega desde su solicitud."],
    ]) await tx`INSERT INTO public.notifications(id,tenant_id,user_id,category,title,body) VALUES(${stableId(`notice:${index}`)},${ctx.tenant_id},${ctx.user_id},'demo',${title},${body})`;
    await tx`INSERT INTO public.audit_logs(tenant_id,actor_id,action,entity_type,entity_id,metadata)
      VALUES(${ctx.tenant_id},${ctx.user_id},'demo.dataset_created','demonstration',${stableId(dataset)},${tx.json({ dataset, fictional: true, customerCount: 10 })})`;
    for (const {table, rows} of original) {
      if (!rows.length) continue;
      const after = await tx.unsafe(`SELECT id::text,md5(to_jsonb(t)::text) AS digest FROM public.${table} t WHERE tenant_id=$1 AND id=ANY($2::uuid[])`, [ctx.tenant_id, rows.map(r=>r.id)]);
      const hashes = new Map(after.map(row=>[row.id,row.digest]));
      if (rows.some(row=>hashes.get(row.id)!==row.digest)) throw new Error(`Se detectó un cambio ajeno a DEMO en ${table}; toda la carga se revierte.`);
    }
    return { existing: false, tenantId: ctx.tenant_id, entries, report: await verify(tx, ctx.tenant_id) };
  });
  const directory = new URL("../.local-demo/", import.meta.url); mkdirSync(directory, { recursive: true });
  if (!result.existing) writeFileSync(new URL("manifest.json", directory), JSON.stringify({ dataset, createdAt: new Date().toISOString(), ...result }, null, 2));
  console.log(result.existing ? "La demostración ya existe. Se conservó el progreso y no se duplicaron datos." : "Demostración local creada. Los registros originales se conservaron sin cambios.");
  console.log(JSON.stringify(result.report, null, 2));
} finally {
  await sql.end({ timeout: 5 });
}
