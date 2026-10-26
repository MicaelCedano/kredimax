import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { expect, it } from "vitest";
import { calculateFinancingQuote, parseMoneyToCents } from "../src/modules/financing/calculator";
import { firstPaymentDate, quoteDatesFromApproval } from "../src/modules/financing/schedule-dates";
import { addIsoCalendarDays } from "../src/lib/business-date";

// Opt-in only: exercises the local RPCs and rolls back every fixture.
it.runIf(process.env.KREDIMAX_TEST_LOCAL_DB === "1")("anchors contractual dates at approval and preserves the quoted amounts and history", async () => {
  const env = readFileSync(".env.local", "utf8");
  const line = env.split(/\r?\n/).find((entry) => entry.startsWith("DATABASE_URL="));
  if (!line) throw new Error("DATABASE_URL is required");
  const connection = new URL(line.slice("DATABASE_URL=".length).trim().replace(/^['"]|['"]$/g, ""));
  if (!["localhost", "127.0.0.1"].includes(connection.hostname)) throw new Error("Local database required");
  const sql = postgres(connection.toString(), { max: 1, prepare: false });
  const tenant = randomUUID(), user = randomUUID(), branch = randomUUID(), customer = randomUUID();
  const rollback = new Error("ROLLBACK_APPROVAL_SCHEDULE_FIXTURE");
  try {
    try {
      await sql.begin(async (tx) => {
        await tx`INSERT INTO auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at,raw_app_meta_data,raw_user_meta_data)
          VALUES(${user},'authenticated','authenticated',${`${user}@example.test`},'',now(),now(),now(),'{}','{}')`;
        await tx`INSERT INTO public.tenants(id,name) VALUES(${tenant},'Disposable approval schedule test')`;
        await tx`INSERT INTO public.branches(id,tenant_id,name,code,active) VALUES(${branch},${tenant},'Test','DATE',true)`;
        await tx`INSERT INTO public.tenant_memberships(tenant_id,user_id,role,branch_id) VALUES(${tenant},${user},'tenant_admin',${branch})`;
        await tx`INSERT INTO public.customers(id,tenant_id,branch_id,full_name,identity_number) VALUES(${customer},${tenant},${branch},'Approval schedule test',${`DATE-${user}`})`;
        await tx`INSERT INTO public.financing_settings(tenant_id,recovery_enabled) VALUES(${tenant},false)`;
        const [{ today }] = await tx`SELECT to_char((clock_timestamp() AT TIME ZONE 'America/Santo_Domingo')::date,'YYYY-MM-DD') AS today`;
        // Deterministic month-end/year/leap-year parity with the UI's date-only calculation.
        for (const approval of ["2026-10-24", "2027-01-01", "2028-02-01", "2026-12-24"]) {
          for (const frequency of ["monthly", "fortnightly"] as const) {
            const quote = calculateFinancingQuote({ salePrice: "35000.13", deviceCost: "35000.13", downPaymentPercent: "35.00", annualRatePercent: "48.00", legalExpenses: "1000.00", termMonths: 6, frequency, recoveryEnabled: false, firstInstallmentDate: "2026-10-24", today: "2026-10-24" });
            const [{ rebased }] = await tx`SELECT app_private.quote_dates_from_approval(${tx.json(quote)},${approval}::date) AS rebased`;
            expect(rebased).toEqual({ ...quoteDatesFromApproval(quote, approval), scheduleBasis: "approval", scheduleAnchorDate: approval });
          }
        }
        await tx.unsafe("SET LOCAL ROLE authenticated");
        await tx`SELECT set_config('request.jwt.claim.sub',${user},true),set_config('request.jwt.claims',${JSON.stringify({ sub: user, aal: "aal1" })},true)`;
        const approvedLoans: { id: string; rows: unknown; terms: unknown }[] = [];
        for (const frequency of ["monthly", "fortnightly"] as const) {
          for (const termMonths of [3,5,6,8,12]) {
            const quote = calculateFinancingQuote({ salePrice: "35000.13", deviceCost: "35000.13", downPaymentPercent: "35.00", annualRatePercent: "48.00", legalExpenses: "1000.00", termMonths, frequency, recoveryEnabled: false, firstInstallmentDate: addIsoCalendarDays(today, 2), today });
            const snapshot = { ...quote, recoveryTargetPercent: "100.00", device: { brand: "Test", model: "Approval", imei: `990002${String(approvedLoans.length).padStart(9,"0")}` } };
            const [{ id }] = await tx`SELECT public.create_credit_application(${tenant},${customer},NULL,${branch},${quote.principal},${tx.json(snapshot)},${randomUUID()}) AS id`;
            if (approvedLoans.length === 0) {
              const legacy = calculateFinancingQuote({ ...quote, today, installmentRounding: "cent" });
              await expect(tx.savepoint((sp) => sp`SELECT public.create_credit_application(${tenant},${customer},NULL,${branch},${quote.principal},${sp.json({ ...snapshot, ...legacy })},${randomUUID()})`)).rejects.toMatchObject({ code: "22023" });
              const tampered = structuredClone(snapshot);
              tampered.schedule[0].amount = (Number(tampered.schedule[0].amount) + 50).toFixed(2);
              tampered.schedule[0].proposedAdjustment = (Number(tampered.schedule[0].proposedAdjustment) + 50).toFixed(2);
              tampered.totalCustomerPays = (Number(tampered.totalCustomerPays) + 50).toFixed(2);
              tampered.proposedAdjustment = (Number(tampered.proposedAdjustment) + 50).toFixed(2);
              await expect(tx.savepoint((sp) => sp`SELECT public.create_credit_application(${tenant},${customer},NULL,${branch},${quote.principal},${sp.json(tampered)},${randomUUID()})`)).rejects.toMatchObject({ code: "22023" });
              await expect(tx.savepoint((sp) => sp`SELECT public.create_credit_application(${tenant},${customer},NULL,${branch},${quote.principal},${sp.json({ ...snapshot, roundingAdjustment: "0.00" })},${randomUUID()})`)).rejects.toMatchObject({ code: "22023" });
            }
            const [{ quote_snapshot: submitted }] = await tx`SELECT quote_snapshot FROM public.credit_applications WHERE id=${id}`;
            const [{ loan }] = await tx`SELECT public.review_credit_application(${id},'approved',NULL,'Redondeo','Centavos de prueba',true) AS loan`;
            const [{ terms }] = await tx`SELECT c.terms FROM public.loans l JOIN public.credit_contracts c ON c.id=l.contract_id WHERE l.id=${loan}`;
            const expected = quoteDatesFromApproval(snapshot, today);
            expect(terms.firstInstallmentDate).toBe(firstPaymentDate(today, frequency));
            expect(terms.scheduleAnchorDate).toBe(today);
            expect(terms.installmentRounding).toBe("up_50");
            expect(terms.paymentDistribution).toBe("balanced_20_v1");
            expect(terms.recoveryMaximumDifferencePercent).toBe("20.00");
            expect(terms.roundingAdjustment).toBe(quote.roundingAdjustment);
            expect(terms.schedule).toEqual(expected.schedule);
            expect(terms.finalDueDate).toBe(expected.finalDueDate);
            for (const key of ["principal", "downPayment", "baseInterest", "legalExpenses", "proposedAdjustment", "totalCustomerPays"] as const) expect(terms[key]).toBe(quote[key]);
            const rows = await tx`SELECT sequence,due_date::text,amount_due::text FROM public.installments WHERE loan_id=${loan} ORDER BY sequence`;
            expect(rows.map((row) => ({ sequence: row.sequence, dueDate: row.due_date, amount: row.amount_due }))).toEqual(expected.schedule.map(({ sequence, dueDate, amount }) => ({ sequence, dueDate, amount })));
            expect(rows.every((row) => parseMoneyToCents(row.amount_due) % 5000n === 0n)).toBe(true);
            await tx`SELECT public.activate_approved_loan_with_evidence(${loan},'cash','ROUNDING-INITIAL',${randomUUID()},'test/rounding-contract.pdf',true,(now() AT TIME ZONE 'America/Santo_Domingo')::date,decode('524946463600000057454250565038202a0000003003009d012a280028003e6d369848a42322a1238800800d896900001b81bd3e0e0000fefb2180000000','hex'),true)`;
            const [{ payment }] = await tx`SELECT public.record_loan_payment_with_evidence(${loan},${rows[0].amount_due},${randomUUID()},'cash','ROUNDING-PAYMENT',decode('524946463600000057454250565038202a0000003003009d012a280028003e6d369848a42322a1238800800d896900001b81bd3e0e0000fefb2180000000','hex'),true) AS payment`;
            const [{ applied }] = await tx`SELECT sum(amount)::text AS applied FROM public.payment_allocations WHERE payment_id=${payment}`;
            expect(parseMoneyToCents(applied)).toBe(parseMoneyToCents(rows[0].amount_due));
            const [{ quote_snapshot: original }] = await tx`SELECT quote_snapshot FROM public.credit_applications WHERE id=${id}`;
            expect(original).toEqual(submitted);
            await expect(tx.savepoint((sp) => sp`SELECT public.review_credit_application(${id},'approved',NULL,NULL,NULL,false)`)).rejects.toMatchObject({ code: "55000" });
            approvedLoans.push({ id: loan, rows, terms });
          }
        }
        // Approving later requests must never modify an earlier loan's schedule/contract.
        for (const previous of approvedLoans) {
          expect(await tx`SELECT sequence,due_date::text,amount_due::text FROM public.installments WHERE loan_id=${previous.id} ORDER BY sequence`).toEqual(previous.rows);
          const [{ terms }] = await tx`SELECT c.terms FROM public.loans l JOIN public.credit_contracts c ON c.id=l.contract_id WHERE l.id=${previous.id}`;
          expect(terms).toEqual(previous.terms);
        }
        throw rollback;
      });
    } catch (error) { if (error !== rollback) throw error; }
    const [{ count }] = await sql`SELECT count(*)::integer AS count FROM public.tenants WHERE id=${tenant}`;
    expect(count).toBe(0);
  } finally { await sql.end({ timeout: 5 }); }
}, 30000);
