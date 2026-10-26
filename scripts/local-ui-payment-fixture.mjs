import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync, unlinkSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import postgres from "postgres";

const mode = process.argv[2];
if (!["prepare", "verify-paid", "verify-reversed", "cleanup"].includes(mode)) {
  throw new Error("Usage: node scripts/local-ui-payment-fixture.mjs <prepare|verify-paid|verify-reversed|cleanup>");
}
const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const line = env.split(/\r?\n/).find((entry) => /^DATABASE_URL=/.test(entry));
if (!line) throw new Error("DATABASE_URL is required for the local UI fixture.");
const connectionString = line.slice("DATABASE_URL=".length).trim().replace(/^['"]|['"]$/g, "");
const databaseUrl = new URL(connectionString);
if (!new Set(["127.0.0.1", "localhost"]).has(databaseUrl.hostname)) {
  throw new Error("Refusing to mutate a non-local database.");
}

const fixturePath = resolve(process.cwd(), ".tmp-ui-payment-fixture.json");
const sql = postgres(connectionString, { max: 1, prepare: false });

function imeiFromRandomUuid() {
  const digits = randomUUID().replaceAll("-", "").replace(/\D/g, "").padEnd(14, "0").slice(0, 14);
  for (let check = 0; check <= 9; check += 1) {
    const candidate = digits + check;
    let sum = 0;
    for (let i = 0; i < candidate.length; i += 1) {
      let digit = Number(candidate[i]);
      if (i % 2 === candidate.length % 2) {
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
  if (existsSync(fixturePath)) throw new Error(`A previous UI fixture exists at ${fixturePath}; inspect it and clean it first.`);
  const candidates = await sql`
    SELECT m.tenant_id,m.branch_id,m.role,
      bool_or(p.key='payments.record') AND bool_or(p.key='payments.reverse') AS can_pay_and_reverse
    FROM public.tenant_memberships m
    JOIN public.tenants t ON t.id=m.tenant_id AND t.status='active'
    JOIN public.roles r ON r.key=m.role
    JOIN public.role_permissions rp ON rp.role_id=r.id
    JOIN public.permissions p ON p.id=rp.permission_id
    WHERE m.status='active' AND p.key IN ('payments.record','payments.reverse')
    GROUP BY m.tenant_id,m.branch_id,m.role,m.created_at
    HAVING bool_or(p.key='payments.record') AND bool_or(p.key='payments.reverse')
    ORDER BY m.created_at DESC LIMIT 2`;
  if (candidates.length !== 1 || !candidates[0].can_pay_and_reverse) {
    throw new Error(`Expected exactly one active local membership allowed to pay and reverse; found ${candidates.length}. No data was created.`);
  }
  const membership = candidates[0];
  const fixture = {
    tenantId: membership.tenant_id,
    branchId: membership.branch_id,
    role: membership.role,
    customerId: randomUUID(),
    deviceId: randomUUID(),
    contractId: randomUUID(),
    loanId: randomUUID(),
    installmentId: randomUUID(),
    customerName: `KrediMax E2E ${randomUUID().slice(0, 8)}`,
    contractNumber: `E2E-${randomUUID().slice(0, 8)}`,
    imei: imeiFromRandomUuid(),
    paymentReference: `UI-E2E-${randomUUID().slice(0, 8)}`,
    cashAccountExisted: false,
  };
  const [account] = await sql`SELECT id FROM public.ledger_accounts WHERE tenant_id=${fixture.tenantId} AND code='CASH_RECEIPTS' LIMIT 1`;
  fixture.cashAccountExisted = Boolean(account);
  writeFileSync(fixturePath, JSON.stringify(fixture), { flag: "wx" });
  await sql.begin(async (tx) => {
    await tx`INSERT INTO public.customers(id,tenant_id,branch_id,full_name)
      VALUES(${fixture.customerId},${fixture.tenantId},${fixture.branchId},${fixture.customerName})`;
    await tx`INSERT INTO public.devices(id,tenant_id,branch_id,imei,brand,model)
      VALUES(${fixture.deviceId},${fixture.tenantId},${fixture.branchId},${fixture.imei},'Prueba','Flujo UI')`;
    await tx`INSERT INTO public.credit_contracts(id,tenant_id,branch_id,customer_id,contract_number,terms)
      VALUES(${fixture.contractId},${fixture.tenantId},${fixture.branchId},${fixture.customerId},${fixture.contractNumber},'{}')`;
    await tx`INSERT INTO public.loans(id,tenant_id,branch_id,customer_id,contract_id,device_id,status,sale_price,down_payment,principal,interest_rate,installment_count,calculation_strategy)
      VALUES(${fixture.loanId},${fixture.tenantId},${fixture.branchId},${fixture.customerId},${fixture.contractId},${fixture.deviceId},'active',20,0,20,0,1,'ui-e2e-test')`;
    await tx`INSERT INTO public.installments(id,tenant_id,loan_id,sequence,due_date,amount_due)
      VALUES(${fixture.installmentId},${fixture.tenantId},${fixture.loanId},1,current_date,20)`;
  });
  process.stdout.write(`UI fixture ready for role ${fixture.role}; customer label: ${fixture.customerName}; reference: ${fixture.paymentReference}.\n`);
}

async function verifyPayment(reversed) {
  if (!existsSync(fixturePath)) throw new Error(`UI fixture not found at ${fixturePath}.`);
  const fixture = JSON.parse(readFileSync(fixturePath, "utf8"));
  const [state] = await sql`
    SELECT p.id AS payment_id,p.amount::numeric,p.payment_method,p.reference,p.reversed_at,
      i.amount_paid::numeric,i.status::text AS installment_status,l.status::text AS loan_status,
      (SELECT coalesce(sum(a.amount),0)::numeric FROM public.payment_allocations a WHERE a.payment_id=p.id) AS allocated,
      (SELECT coalesce(sum(e.amount),0)::numeric FROM public.ledger_entries e WHERE e.payment_id=p.id) AS ledger_net,
      EXISTS(SELECT 1 FROM public.ledger_entries e WHERE e.payment_id=p.id AND e.entry_type='payment_received' AND e.amount=5) AS has_receipt_entry,
      EXISTS(SELECT 1 FROM public.audit_logs a WHERE a.entity_id=p.id AND a.action='payment.recorded') AS has_record_audit,
      EXISTS(SELECT 1 FROM public.audit_logs a WHERE a.entity_id=p.id AND a.action='payment.reversed') AS has_reversal_audit
    FROM public.payments p JOIN public.installments i ON i.loan_id=p.loan_id
      JOIN public.loans l ON l.id=p.loan_id WHERE p.tenant_id=${fixture.tenantId} AND p.loan_id=${fixture.loanId}`;
  const valid = state && Number(state.amount) === 5 && state.payment_method === "cash"
    && state.reference === fixture.paymentReference && Number(state.allocated) === 5
    && state.has_receipt_entry && state.has_record_audit;
  if (!valid) throw new Error(`UI payment did not create the expected RPC, allocation, ledger and audit evidence: ${JSON.stringify(state ?? null)}`);
  if (reversed) {
    if (!state.reversed_at || Number(state.amount_paid) !== 0 || Number(state.ledger_net) !== 0
        || !state.has_reversal_audit || state.installment_status === "paid" || state.loan_status !== "active") {
      throw new Error(`UI reversal did not restore the fake installment and net ledger: ${JSON.stringify(state)}`);
    }
    process.stdout.write("UI reversal verified: payment compensated, installment restored, and reversal audited.\n");
  } else {
    if (state.reversed_at || Number(state.amount_paid) !== 5 || Number(state.ledger_net) !== 5
        || !state.has_record_audit || state.installment_status !== "partial" || state.loan_status !== "active") {
      throw new Error(`UI payment read-back failed: ${JSON.stringify(state)}`);
    }
    process.stdout.write("UI payment verified: RPC result, RD$5 allocation, receipt ledger entry, audit, and partial installment read-back match.\n");
  }
}

async function cleanup() {
  if (!existsSync(fixturePath)) throw new Error(`UI fixture not found at ${fixturePath}.`);
  const fixture = JSON.parse(readFileSync(fixturePath, "utf8"));
  await sql.begin(async (tx) => {
    await tx`DELETE FROM public.audit_logs WHERE tenant_id=${fixture.tenantId} AND (
      entity_id IN (${fixture.customerId}::uuid,${fixture.deviceId}::uuid,${fixture.contractId}::uuid,${fixture.loanId}::uuid)
      OR entity_id IN (SELECT id FROM public.payments WHERE tenant_id=${fixture.tenantId} AND loan_id=${fixture.loanId})
      OR entity_id IN (SELECT id FROM public.customer_credit_evaluations WHERE tenant_id=${fixture.tenantId} AND customer_id=${fixture.customerId}))`;
    await tx`DELETE FROM public.ledger_entries WHERE tenant_id=${fixture.tenantId}
      AND payment_id IN (SELECT id FROM public.payments WHERE tenant_id=${fixture.tenantId} AND loan_id=${fixture.loanId})`;
    await tx`DELETE FROM public.payment_allocations WHERE tenant_id=${fixture.tenantId}
      AND payment_id IN (SELECT id FROM public.payments WHERE tenant_id=${fixture.tenantId} AND loan_id=${fixture.loanId})`;
    await tx`DELETE FROM public.payments WHERE tenant_id=${fixture.tenantId} AND loan_id=${fixture.loanId}`;
    await tx`DELETE FROM public.installments WHERE tenant_id=${fixture.tenantId} AND id=${fixture.installmentId}`;
    await tx`DELETE FROM public.loans WHERE tenant_id=${fixture.tenantId} AND id=${fixture.loanId}`;
    await tx`DELETE FROM public.credit_contracts WHERE tenant_id=${fixture.tenantId} AND id=${fixture.contractId}`;
    await tx`DELETE FROM public.devices WHERE tenant_id=${fixture.tenantId} AND id=${fixture.deviceId}`;
    await tx`DELETE FROM public.customer_credit_evaluations WHERE tenant_id=${fixture.tenantId} AND customer_id=${fixture.customerId}`;
    await tx`DELETE FROM public.customers WHERE tenant_id=${fixture.tenantId} AND id=${fixture.customerId}`;
    if (!fixture.cashAccountExisted) {
      await tx`DELETE FROM public.ledger_accounts a WHERE a.tenant_id=${fixture.tenantId} AND a.code='CASH_RECEIPTS'
        AND NOT EXISTS(SELECT 1 FROM public.ledger_entries e WHERE e.account_id=a.id)`;
    }
  });
  const [leftovers] = await sql`
    SELECT EXISTS(SELECT 1 FROM public.customers WHERE id=${fixture.customerId}) AS customer,
      EXISTS(SELECT 1 FROM public.customer_credit_evaluations WHERE tenant_id=${fixture.tenantId} AND customer_id=${fixture.customerId}) AS evaluation,
      EXISTS(SELECT 1 FROM public.devices WHERE id=${fixture.deviceId}) AS device,
      EXISTS(SELECT 1 FROM public.credit_contracts WHERE id=${fixture.contractId}) AS contract,
      EXISTS(SELECT 1 FROM public.loans WHERE id=${fixture.loanId}) AS loan,
      EXISTS(SELECT 1 FROM public.payments WHERE loan_id=${fixture.loanId}) AS payment,
      EXISTS(SELECT 1 FROM public.audit_logs WHERE entity_id=${fixture.loanId}) AS audit`;
  if (Object.values(leftovers).some(Boolean)) throw new Error(`UI fixture cleanup incomplete: ${JSON.stringify(leftovers)}`);
  unlinkSync(fixturePath);
  process.stdout.write("UI fixture rows and audit evidence removed after verification.\n");
}

try {
  if (mode === "prepare") await prepare();
  else if (mode === "verify-paid") await verifyPayment(false);
  else if (mode === "verify-reversed") await verifyPayment(true);
  else await cleanup();
} finally {
  await sql.end({ timeout: 5 });
}
