import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import postgres from "postgres";
import { financingCalculator } from "./load-financing-calculator.mjs";
const { calculateFinancingQuote, parseMoneyToCents, DEFAULT_FINANCING_SETTINGS } = financingCalculator;
const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const line = env.split(/\r?\n/).find((entry) => /^DATABASE_URL=/.test(entry));
if (!line) throw new Error("DATABASE_URL is required.");
const connection = new URL(line.slice("DATABASE_URL=".length).trim().replace(/^['"]|['"]$/g, ""));
if (!["localhost", "127.0.0.1"].includes(connection.hostname)) throw new Error("Local database required.");
const sql = postgres(connection.toString(), { max: 1, prepare: false });
const tenant = randomUUID(), user = randomUUID(), branch = randomUUID(), customer = randomUUID();
const rollback = new Error("ROLLBACK_RECOVERY_FIXTURE");
let verified = 0;
try {
  try {
    await sql.begin(async (tx) => {
      await tx`INSERT INTO auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at,raw_app_meta_data,raw_user_meta_data)
        VALUES(${user},'authenticated','authenticated',${`${user}@example.test`},'',now(),now(),now(),'{}','{}')`;
      await tx`INSERT INTO public.tenants(id,name) VALUES(${tenant},'Disposable recovery installment test')`;
      await tx`INSERT INTO public.branches(id,tenant_id,name,code,active) VALUES(${branch},${tenant},'Test','REC',true)`;
      await tx`INSERT INTO public.tenant_memberships(tenant_id,user_id,role,branch_id) VALUES(${tenant},${user},'tenant_admin',${branch})`;
      await tx`INSERT INTO public.customers(id,tenant_id,branch_id,full_name,identity_number) VALUES(${customer},${tenant},${branch},'Recovery test',${`REC-${user}`})`;
      await tx`INSERT INTO public.financing_settings(tenant_id) VALUES(${tenant})`;
      await tx.unsafe("SET LOCAL ROLE authenticated");
      await tx`SELECT set_config('request.jwt.claim.sub',${user},true),set_config('request.jwt.claims',${JSON.stringify({ sub: user, aal: "aal1" })},true)`;
      const first = new Date(); first.setUTCDate(first.getUTCDate() + 2);
      for (const termMonths of DEFAULT_FINANCING_SETTINGS.allowedTerms) {
        for (const frequency of ["monthly", "fortnightly"]) {
          let priorSnapshot;
          for (const downPaymentPercent of ["30.00", "35.00", "40.00", "45.00", "50.00", "55.00", "60.00", "65.00", "70.00", "75.00", "80.00"]) {
          for (const recoveryEnabled of [false, true]) {
            await tx.unsafe("RESET ROLE");
            await tx`UPDATE public.financing_settings SET recovery_enabled=${recoveryEnabled} WHERE tenant_id=${tenant}`;
            await tx.unsafe("SET LOCAL ROLE authenticated");
            const quote = calculateFinancingQuote({ salePrice: "35000.13", deviceCost: "35000.13", downPaymentPercent, annualRatePercent: "48.000", legalExpenses: "1000.00", termMonths, frequency, recoveryEnabled, firstInstallmentDate: first.toISOString().slice(0, 10) });
            const snapshot = { ...quote, recoveryTargetPercent: "100.00", device: { brand: "Test", model: "Recovery", imei: `990001${String(verified).padStart(9, "0")}` } };
            const key = randomUUID();
            const create = (payload, submissionKey) => tx`SELECT public.create_credit_application(${tenant},${customer},NULL,${branch},${quote.principal},${tx.json(payload)},${submissionKey}) AS id`;
            const [{ id }] = await create(snapshot, key);
            const [{ id: retry }] = await create(snapshot, key);
            assert.equal(retry, id);
            const [{ quote_snapshot: saved }] = await tx`SELECT quote_snapshot FROM public.credit_applications WHERE id=${id}`;
            assert.deepEqual(saved.schedule, quote.schedule);
            assert.equal(saved.downPaymentPercent, downPaymentPercent);
            assert.equal(saved.downPayment, quote.downPayment);
            assert.equal(saved.paymentDistribution, "balanced_20_v1");
            assert.equal(saved.recoveryMaximumDifferencePercent, "20.00");
            assert.equal(saved.recoveryAtSixMonths, quote.recoveryAtSixMonths);
            if (!recoveryEnabled) assert.equal(new Set(saved.schedule.map((row) => row.amount)).size, 1);
            assert.ok(parseMoneyToCents(saved.schedule[0].amount) * 5n <= parseMoneyToCents(saved.schedule.at(-1).amount) * 6n);
            if (priorSnapshot) {
              const [{ quote_snapshot: old }] = await tx`SELECT quote_snapshot FROM public.credit_applications WHERE id=${priorSnapshot.id}`;
              assert.deepEqual(old, priorSnapshot.saved, "Toggling recovery changed an existing snapshot");
              if (recoveryEnabled) assert.equal(saved.totalCustomerPays, priorSnapshot.saved.totalCustomerPays, "Balanced recovery must preserve the level plan total");
            }
            priorSnapshot = { id, saved };
            const bad = structuredClone(snapshot);
            // Keep row sums and global totals consistent, but move a cent to the wrong installment.
            bad.schedule[0].amount = (Number(bad.schedule[0].amount) + 0.01).toFixed(2);
            bad.schedule[0].principal = (Number(bad.schedule[0].principal) + 0.01).toFixed(2);
            bad.schedule.at(-1).amount = (Number(bad.schedule.at(-1).amount) - 0.01).toFixed(2);
            bad.schedule.at(-1).principal = (Number(bad.schedule.at(-1).principal) - 0.01).toFixed(2);
            let rejected = false;
            try { await tx.savepoint((sp) => sp`SELECT public.create_credit_application(${tenant},${customer},NULL,${branch},${quote.principal},${sp.json(bad)},${randomUUID()})`); }
            catch (error) { assert.equal(error.code, "22023"); rejected = true; }
            assert.equal(rejected, true, "Manipulated timing must be rejected");
            let invalidPercentRejected = false;
            try { await tx.savepoint((sp) => sp`SELECT public.create_credit_application(${tenant},${customer},NULL,${branch},${quote.principal},${sp.json({ ...snapshot, downPaymentPercent: "25.00" })},${randomUUID()})`); }
            catch (error) { assert.equal(error.code, "22023"); invalidPercentRejected = true; }
            assert.equal(invalidPercentRejected, true, "Unlisted initial percentage must be rejected");
            const [{ loan }] = await tx`SELECT public.review_credit_application(${id},'approved',NULL,'Redondeo','Ajuste de centavos de prueba',true) AS loan`;
            const [{ down_payment, terms }] = await tx`SELECT l.down_payment::text, c.terms FROM public.loans l JOIN public.credit_contracts c ON c.id=l.contract_id WHERE l.id=${loan}`;
            assert.equal(parseMoneyToCents(down_payment), parseMoneyToCents(quote.downPayment));
            assert.equal(terms.downPaymentPercent, downPaymentPercent);
            const rows = await tx`SELECT sequence,amount_due::text AS amount FROM public.installments WHERE loan_id=${loan} ORDER BY sequence`;
            assert.deepEqual(rows.map((row) => parseMoneyToCents(row.amount)), quote.schedule.map((row) => parseMoneyToCents(row.amount)));
            assert.equal(terms.installmentRounding, "up_50");
            assert.equal(terms.roundingAdjustment, quote.roundingAdjustment);
            assert.ok(rows.every((row) => parseMoneyToCents(row.amount) % 5000n === 0n));
            await tx`SELECT public.activate_approved_loan_with_evidence(${loan},'cash','TEST-INITIAL',${randomUUID()},'test/recovery-contract.pdf',true,(now() AT TIME ZONE 'America/Santo_Domingo')::date,decode('524946463600000057454250565038202a0000003003009d012a280028003e6d369848a42322a1238800800d896900001b81bd3e0e0000fefb2180000000','hex'),true)`;
            const paymentTotal = rows.reduce((sum, row) => sum + parseMoneyToCents(row.amount), 0n);
            await tx`SELECT public.record_loan_payment_with_evidence(${loan},${`${paymentTotal / 100n}.${String(paymentTotal % 100n).padStart(2, "0")}`},${randomUUID()},'cash','TEST-RECOVERY',decode('524946463600000057454250565038202a0000003003009d012a280028003e6d369848a42322a1238800800d896900001b81bd3e0e0000fefb2180000000','hex'),true)`;
            const [{ status }] = await tx`SELECT status FROM public.loans WHERE id=${loan}`;
            assert.equal(status, "paid_off");
            verified += 1;
          }
          }
        }
      }
      throw rollback;
    });
  } catch (error) { if (error !== rollback) throw error; }
  const [{ remaining }] = await sql`SELECT count(*)::int AS remaining FROM public.tenants WHERE id=${tenant}`;
  assert.equal(remaining, 0);
  console.log(`${verified} scenarios passed: eleven down payments through 80%, both recovery flags, all terms/frequencies, RPC save/read-back, idempotency, tamper rejection, contract installments, activation and payoff; fixtures rolled back.`);
} finally { await sql.end({ timeout: 5 }); }
