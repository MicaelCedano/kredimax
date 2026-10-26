import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import postgres from "postgres";

const line = readFileSync(new URL("../.env.local", import.meta.url), "utf8").split(/\r?\n/).find((entry) => entry.startsWith("DATABASE_URL="));
const url = new URL(line.slice(13).trim().replace(/^['"]|['"]$/g, ""));
if (!["localhost", "127.0.0.1"].includes(url.hostname)) throw new Error("Local database required.");
const sql = postgres(url.toString(), { max: 1, prepare: false });
const tenant = randomUUID(), otherTenant = randomUUID(), admin = randomUUID(), cashier = randomUUID(), outsider = randomUUID();
const home = randomUUID(), otherBranch = randomUUID(), customer = randomUUID(), secondCustomer = randomUUID();
const rollback = new Error("ROLLBACK_RECEIPT_DIRECTORY");
try {
  try {
    await sql.begin(async (tx) => {
      for (const user of [admin, cashier, outsider]) await tx`INSERT INTO auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at,raw_app_meta_data,raw_user_meta_data) VALUES(${user},'authenticated','authenticated',${`${user}@example.test`},'',now(),now(),now(),'{}','{}')`;
      await tx`INSERT INTO public.tenants(id,name) VALUES(${tenant},'Disposable voucher directory'),(${otherTenant},'Disposable outside vouchers')`;
      await tx`INSERT INTO public.branches(id,tenant_id,name,code,active) VALUES(${home},${tenant},'Home','VC-HOME',true),(${otherBranch},${tenant},'Other','VC-OTHER',true)`;
      await tx`INSERT INTO public.tenant_memberships(tenant_id,user_id,role,branch_id) VALUES(${tenant},${admin},'tenant_admin',${home}),(${tenant},${cashier},'cashier',${home}),(${otherTenant},${outsider},'tenant_admin',NULL)`;
      for (const [id, branch, name, identity, phone] of [[customer, home, "Voucher Home", "990-0000000-1", "809-555-0001"], [secondCustomer, otherBranch, "Voucher Other", "990-0000000-2", "809-555-0002"]]) await tx`INSERT INTO public.customers(id,tenant_id,branch_id,full_name,identity_number,phone) VALUES(${id},${tenant},${branch},${name},${identity},${phone})`;
      const loans = [];
      for (const [index, id, branch] of [[0, customer, home], [1, secondCustomer, otherBranch]]) {
        const device = randomUUID(), contract = randomUUID(), loan = randomUUID(); loans.push(loan);
        await tx`INSERT INTO public.devices(id,tenant_id,branch_id,imei,brand,model) VALUES(${device},${tenant},${branch},${`990321${String(index).padStart(9, "0")}`},'Test','Voucher')`;
        await tx`INSERT INTO public.credit_contracts(id,tenant_id,branch_id,customer_id,contract_number,terms) VALUES(${contract},${tenant},${branch},${id},${`VC-${index === 0 ? "Home" : "Other"}`},'{}')`;
        await tx`INSERT INTO public.loans(id,tenant_id,branch_id,customer_id,contract_id,device_id,status,sale_price,down_payment,principal,interest_rate,installment_count,calculation_strategy) VALUES(${loan},${tenant},${branch},${id},${contract},${device},'active',1000,300,700,0,1,'voucher-fixture')`;
      }
      const receiptIds = [];
      const addPayment = async (index, amount, method, type, timestamp, reversed = false, loan = loans[0]) => {
        const id = randomUUID(); receiptIds.push(id);
        await tx`INSERT INTO public.payments(id,tenant_id,loan_id,idempotency_key,amount,received_by,payment_method,payment_type,reference,received_at,reversed_at,reversal_reason) VALUES(${id},${tenant},${loan},${randomUUID()},${amount},${admin},${method},${type},${`VC-REF-${index}`},${timestamp},${reversed ? "2026-10-02T12:00:00Z" : null},${reversed ? "Fixture reversal" : null})`;
      };
      await addPayment(0, "30.00", "cash", "down_payment", "2026-10-01T03:59:59Z");
      await addPayment(1, "10.01", "bank_transfer", "installment", "2026-10-01T04:00:00Z");
      await addPayment(2, "20.02", "card", "installment", "2026-10-02T03:59:59Z", true);
      await addPayment(3, "40.03", "other", "installment", "2026-10-02T04:00:00Z");
      for (let index = 0; index < 26; index++) await addPayment(index + 4, "1.00", "cash", "installment", "2026-10-01T16:00:00Z");
      await addPayment(30, "50.00", "cash", "installment", "2026-10-01T16:00:00Z", false, loans[1]);
      const asUser = async (user) => {
        await tx.unsafe("SET LOCAL ROLE authenticated");
        await tx`SELECT set_config('request.jwt.claim.sub',${user},true),set_config('request.jwt.claims',${JSON.stringify({ sub: user, aal: "aal1" })},true)`;
      };
      const list = async (filters = {}) => {
        const [{ result }] = await tx`SELECT public.tenant_receipt_page(${tenant},${filters.search ?? ""},${filters.status ?? ""},${filters.type ?? ""},${filters.method ?? ""},${filters.branch ?? null},${filters.customer ?? null},${filters.from ?? null},${filters.to ?? null},${filters.page ?? 1},25) AS result`;
        return result;
      };
      await asUser(admin);
      const all = await list(); assert.equal(all.count, 31); assert.equal(all.rows.length, 25);
      assert.equal(all.summary.registered, 30); assert.equal(all.summary.reversed, 1);
      assert.equal(all.summary.registeredAmount, "156.04"); assert.equal(all.summary.reversedAmount, "20.02");
      assert.equal((await list({ page: 2 })).rows.length, 6);
      assert.equal((await list({ page: 2 })).summary.registeredAmount, "156.04");
      assert.equal((await list({ status: "reversed" })).count, 1);
      assert.equal((await list({ status: "reversed" })).rows[0].id, receiptIds[2]);
      assert.equal((await list({ type: "down_payment" })).count, 1);
      assert.equal((await list({ method: "cash" })).count, 28);
      assert.equal((await list({ search: "VC-REF-2", status: "reversed" })).count, 1);
      assert.equal((await list({ search: receiptIds[1] })).count, 1);
      assert.equal((await list({ search: "8095550001" })).count, 30);
      assert.equal((await list({ search: "99000000001" })).count, 30);
      assert.equal((await list({ customer })).count, 30);
      assert.equal((await list({ branch: otherBranch })).count, 1);
      const day = await list({ from: "2026-10-01", to: "2026-10-01", customer });
      assert.equal(day.count, 28); assert.equal(day.summary.registeredAmount, "36.01");
      await asUser(cashier); assert.equal((await list()).count, 30); assert.equal((await list({ customer: secondCustomer })).count, 0);
      await asUser(outsider);
      let forbidden = false; try { await tx.savepoint((sp) => sp`SELECT public.tenant_receipt_page(${tenant})`); } catch (error) { assert.equal(error.code, "42501"); forbidden = true; }
      assert.equal(forbidden, true);
      throw rollback;
    });
  } catch (error) { if (error !== rollback) throw error; }
  assert.equal((await sql`SELECT id FROM public.tenants WHERE id=${tenant}`).length, 0);
  console.log("Voucher directory passed: existing folios, initial/installment/reversed receipts, precise totals on all pages, every filter, inclusive Dominican business dates and tenant/branch isolation; fixtures rolled back.");
} finally { await sql.end({ timeout: 5 }); }
