import { randomUUID } from "node:crypto";
import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import postgres from "postgres";

const mode = process.argv[2];
if (!["prepare", "verify", "cleanup"].includes(mode)) {
  throw new Error("Usage: node scripts/local-ui-due-alert-fixture.mjs <prepare|verify|cleanup>");
}
const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const line = env.split(/\r?\n/).find((entry) => /^DATABASE_URL=/.test(entry));
if (!line) throw new Error("DATABASE_URL is required for the local UI alert fixture.");
const connectionString = line.slice("DATABASE_URL=".length).trim().replace(/^['"]|['"]$/g, "");
const databaseUrl = new URL(connectionString);
if (!new Set(["127.0.0.1", "localhost"]).has(databaseUrl.hostname)) {
  throw new Error("Refusing to mutate a non-local database.");
}

const fixturePath = resolve(process.cwd(), ".tmp-ui-due-alert-fixture.json");
const sql = postgres(connectionString, { max: 1, prepare: false });

function validImei() {
  const digits = randomUUID().replaceAll("-", "").replace(/\D/g, "").padEnd(14, "0").slice(0, 14);
  for (let check = 0; check <= 9; check += 1) {
    const candidate = digits + check;
    let sum = 0;
    for (let index = 0; index < candidate.length; index += 1) {
      let digit = Number(candidate[index]);
      if (index % 2 === candidate.length % 2) {
        digit *= 2;
        if (digit > 9) digit -= 9;
      }
      sum += digit;
    }
    if (sum % 10 === 0) return candidate;
  }
  throw new Error("Could not create a test IMEI.");
}

async function prepare() {
  if (existsSync(fixturePath)) throw new Error(`A previous fixture exists at ${fixturePath}; inspect it and clean it first.`);
  const candidates = await sql`
    SELECT m.tenant_id,m.branch_id,m.role,b.id AS fixture_branch_id
    FROM public.tenant_memberships m
    JOIN public.tenants t ON t.id=m.tenant_id AND t.status='active'
    JOIN public.roles r ON r.key=m.role
    JOIN public.role_permissions rp ON rp.role_id=r.id
    JOIN public.permissions p ON p.id=rp.permission_id AND p.key='payments.read'
    LEFT JOIN LATERAL (
      SELECT br.id FROM public.branches br WHERE br.tenant_id=m.tenant_id AND br.active
        AND (m.branch_id IS NULL OR br.id=m.branch_id) ORDER BY br.created_at,br.id LIMIT 1
    ) b ON true
    WHERE m.status='active' AND b.id IS NOT NULL
    ORDER BY m.created_at DESC LIMIT 2`;
  if (candidates.length !== 1) throw new Error(`Expected one active local payments.read membership; found ${candidates.length}. No data was created.`);
  const membership = candidates[0];
  const fixture = {
    tenantId: membership.tenant_id,
    branchId: membership.fixture_branch_id,
    role: membership.role,
    customerId: randomUUID(),
    deviceId: randomUUID(),
    contractId: randomUUID(),
    loanId: randomUUID(),
    installmentId: randomUUID(),
    customerName: `KrediMax alerta ${randomUUID().slice(0, 8)}`,
    contractNumber: `ALERT-${randomUUID().slice(0, 8)}`,
    imei: validImei(),
  };
  writeFileSync(fixturePath, JSON.stringify(fixture), { flag: "wx" });
  try {
    await sql.begin(async (tx) => {
      await tx`INSERT INTO public.customers(id,tenant_id,branch_id,full_name)
        VALUES(${fixture.customerId},${fixture.tenantId},${fixture.branchId},${fixture.customerName})`;
      await tx`INSERT INTO public.devices(id,tenant_id,branch_id,imei,brand,model)
        VALUES(${fixture.deviceId},${fixture.tenantId},${fixture.branchId},${fixture.imei},'Prueba','Alerta')`;
      await tx`INSERT INTO public.credit_contracts(id,tenant_id,branch_id,customer_id,contract_number,terms)
        VALUES(${fixture.contractId},${fixture.tenantId},${fixture.branchId},${fixture.customerId},${fixture.contractNumber},'{}')`;
      await tx`INSERT INTO public.loans(id,tenant_id,branch_id,customer_id,contract_id,device_id,status,sale_price,down_payment,principal,interest_rate,installment_count,calculation_strategy)
        VALUES(${fixture.loanId},${fixture.tenantId},${fixture.branchId},${fixture.customerId},${fixture.contractId},${fixture.deviceId},'active',20,0,20,0,1,'ui-due-alert-test')`;
      await tx`INSERT INTO public.installments(id,tenant_id,loan_id,sequence,due_date,amount_due,status)
        VALUES(${fixture.installmentId},${fixture.tenantId},${fixture.loanId},1,(now() AT TIME ZONE 'America/Santo_Domingo')::date+2,20,'pending')`;
    });
    process.stdout.write(`Fixture de alerta lista para ${fixture.role}; cliente ficticio: ${fixture.customerName}; vence en 2 días; saldo RD$20.00.\n`);
  } catch (error) {
    unlinkSync(fixturePath);
    throw error;
  }
}

async function verify() {
  if (!existsSync(fixturePath)) throw new Error(`Fixture no encontrada en ${fixturePath}.`);
  const fixture = JSON.parse(readFileSync(fixturePath, "utf8"));
  const [state] = await sql`
    SELECT to_char(i.due_date,'YYYY-MM-DD') AS due_date, i.amount_due::numeric, i.amount_paid::numeric, i.status::text AS installment_status,
      l.status::text AS loan_status, c.full_name
    FROM public.installments i JOIN public.loans l ON l.tenant_id=i.tenant_id AND l.id=i.loan_id
      JOIN public.customers c ON c.tenant_id=l.tenant_id AND c.id=l.customer_id
    WHERE i.tenant_id=${fixture.tenantId} AND i.id=${fixture.installmentId}`;
  if (!state || state.loan_status !== "active" || Number(state.amount_due)-Number(state.amount_paid)!==20
      || state.installment_status !== "pending" || state.full_name !== fixture.customerName) {
    throw new Error(`Local due-alert fixture read-back failed: ${JSON.stringify(state ?? null)}`);
  }
  process.stdout.write(`Fixture verificada: cuota pendiente por RD$20.00 para ${state.full_name}, con vencimiento ${state.due_date}.\n`);
}

async function cleanup() {
  if (!existsSync(fixturePath)) throw new Error(`Fixture no encontrada en ${fixturePath}.`);
  const fixture = JSON.parse(readFileSync(fixturePath, "utf8"));
  await sql.begin(async (tx) => {
    await tx`DELETE FROM public.audit_logs WHERE tenant_id=${fixture.tenantId}
      AND entity_id IN (${fixture.customerId}::uuid,${fixture.deviceId}::uuid,${fixture.contractId}::uuid,${fixture.loanId}::uuid)`;
    await tx`DELETE FROM public.installments WHERE tenant_id=${fixture.tenantId} AND id=${fixture.installmentId}`;
    await tx`DELETE FROM public.loans WHERE tenant_id=${fixture.tenantId} AND id=${fixture.loanId}`;
    await tx`DELETE FROM public.credit_contracts WHERE tenant_id=${fixture.tenantId} AND id=${fixture.contractId}`;
    await tx`DELETE FROM public.devices WHERE tenant_id=${fixture.tenantId} AND id=${fixture.deviceId}`;
    await tx`DELETE FROM public.customers WHERE tenant_id=${fixture.tenantId} AND id=${fixture.customerId}`;
  });
  const [leftovers] = await sql`
    SELECT EXISTS(SELECT 1 FROM public.customers WHERE id=${fixture.customerId}) AS customer,
      EXISTS(SELECT 1 FROM public.devices WHERE id=${fixture.deviceId}) AS device,
      EXISTS(SELECT 1 FROM public.credit_contracts WHERE id=${fixture.contractId}) AS contract,
      EXISTS(SELECT 1 FROM public.loans WHERE id=${fixture.loanId}) AS loan,
      EXISTS(SELECT 1 FROM public.installments WHERE id=${fixture.installmentId}) AS installment,
      EXISTS(SELECT 1 FROM public.audit_logs WHERE entity_id IN (${fixture.customerId}::uuid,${fixture.deviceId}::uuid,${fixture.contractId}::uuid,${fixture.loanId}::uuid)) AS audit`;
  if (Object.values(leftovers).some(Boolean)) throw new Error(`Cleanup incompleto: ${JSON.stringify(leftovers)}`);
  unlinkSync(fixturePath);
  process.stdout.write("Fixture ficticia y sus eventos de auditoría eliminados y verificados.\n");
}

try {
  if (mode === "prepare") await prepare();
  else if (mode === "verify") await verify();
  else await cleanup();
} finally {
  await sql.end({ timeout: 5 });
}
