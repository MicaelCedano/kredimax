import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import sharp from "sharp";

const line = readFileSync(new URL("../.env.local", import.meta.url), "utf8").split(/\r?\n/).find((row) => row.startsWith("DATABASE_URL="));
const url = new URL(line.slice(13).trim().replace(/^['"]|['"]$/g, ""));
if (!["127.0.0.1", "localhost"].includes(url.hostname)) throw new Error("Local database required.");
const sql = postgres(url.toString(), { max: 1, prepare: false });
const tenant = randomUUID(), otherTenant = randomUUID(), admin = randomUUID(), cashier = randomUUID(), reader = randomUUID(), outsider = randomUUID();
const branch = randomUUID(), otherBranch = randomUUID();
const portrait = await sharp({ create: { width: 40, height: 40, channels: 3, background: "#1264dc" } }).webp().toBuffer();
const rollback = new Error("ROLLBACK_COLLECTION_FIXTURE");
try {
  try {
    await sql.begin(async (tx) => {
      for (const user of [admin, cashier, reader, outsider]) await tx`INSERT INTO auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at,raw_app_meta_data,raw_user_meta_data) VALUES(${user},'authenticated','authenticated',${`${user}@example.test`},'',now(),now(),now(),'{}','{}')`;
      await tx`INSERT INTO public.tenants(id,name) VALUES(${tenant},'Disposable collection accounts'),(${otherTenant},'Disposable outside tenant')`;
      await tx`INSERT INTO public.branches(id,tenant_id,name,code,active) VALUES(${branch},${tenant},'Home','HOME',true),(${otherBranch},${tenant},'Other','OTHER',true)`;
      for (const [user, role, scope] of [[admin, "tenant_admin", branch], [cashier, "cashier", branch], [reader, "auditor", branch]]) await tx`INSERT INTO public.tenant_memberships(tenant_id,user_id,role,branch_id) VALUES(${tenant},${user},${role},${scope})`;
      await tx`INSERT INTO public.tenant_memberships(tenant_id,user_id,role) VALUES(${otherTenant},${outsider},'tenant_admin')`;
      const customers = [];
      for (const [index, name] of ["Overdue", "Today", "Current", "Settled", "None", "Other branch", "Approved only"].entries()) {
        const id = randomUUID(); customers.push(id);
        await tx`INSERT INTO public.customers(id,tenant_id,branch_id,full_name,identity_number,phone) VALUES(${id},${tenant},${index === 5 ? otherBranch : branch},${name},${`990-000000${index}-1`},${`809-555-000${index}`})`;
      }
      let index = 0;
      const addLoan = async (customerIndex, status, installments) => {
        const device = randomUUID(), contract = randomUUID(), loan = randomUUID();
        const scope = customerIndex === 5 ? otherBranch : branch;
        await tx`INSERT INTO public.devices(id,tenant_id,branch_id,imei,brand,model) VALUES(${device},${tenant},${scope},${`990123${String(index++).padStart(9, "0")}`},'Test','Fixture')`;
        await tx`INSERT INTO public.credit_contracts(id,tenant_id,branch_id,customer_id,contract_number,terms) VALUES(${contract},${tenant},${scope},${customers[customerIndex]},${`COL-${contract}`},'{}')`;
        await tx`INSERT INTO public.loans(id,tenant_id,branch_id,customer_id,contract_id,device_id,status,sale_price,down_payment,principal,interest_rate,installment_count,calculation_strategy) VALUES(${loan},${tenant},${scope},${customers[customerIndex]},${contract},${device},${status},100,30,70,0,${installments.length},'collection-fixture')`;
        const ids = [];
        for (const [sequence, item] of installments.entries()) {
          const id = randomUUID(); ids.push(id);
          const [days, due, paid, installmentStatus = "pending"] = item;
          await tx`INSERT INTO public.installments(id,tenant_id,loan_id,sequence,due_date,amount_due,amount_paid,status) VALUES(${id},${tenant},${loan},${sequence + 1},(now() AT TIME ZONE 'America/Santo_Domingo')::date+${days}::integer,${due},${paid},${installmentStatus})`;
        }
        return ids;
      };
      const overdueNotes = await addLoan(0, "active", [[-5, 100, 25, "partial"], [0, 50, 10, "partial"], [10, 200, 0]]);
      await addLoan(0, "active", [[20, 30, 0]]);
      await addLoan(1, "active", [[0, 100, 20, "partial"]]);
      await addLoan(2, "active", [[10, 100, 50, "partial"], [-20, 40, 0, "waived"]]);
      await addLoan(3, "paid_off", [[-20, 100, 100, "paid"]]);
      await addLoan(5, "active", [[-2, 100, 0]]);
      await addLoan(6, "approved", [[-10, 100, 0]]);
      const asUser = async (user) => {
        await tx.unsafe("SET LOCAL ROLE authenticated");
        await tx`SELECT set_config('request.jwt.claim.sub',${user},true),set_config('request.jwt.claims',${JSON.stringify({ sub: user, aal: "aal1" })},true)`;
      };
      const page = async (status = "", search = "", branchId = null, pageSize = 25, from = null, to = null) => {
        const [{ result }] = await tx`SELECT public.customer_collection_page(${tenant},${search},${status},${branchId},${from},${to},1,${pageSize}) AS result`;
        return result;
      };
      await asUser(admin);
      const all = await page();
      assert.deepEqual(all.counts, { all: 7, balance: 4, current: 1, due: 1, overdue: 2, settled: 1, none: 2 });
      const overdue = all.rows.find((row) => row.id === customers[0]);
      assert.equal(overdue.activeLoans, 2); assert.equal(overdue.pendingInstallments, 4);
      assert.equal(Number(overdue.balance), 345); assert.equal(Number(overdue.overdueBalance), 75);
      assert.equal(Number(overdue.todayBalance), 40); assert.equal(overdue.overdueDays, 5);
      assert.equal((await page("overdue")).count, 2);
      assert.equal((await page("balance")).count, 4);
      assert.equal((await page("", "", branch)).count, 6);
      assert.equal((await page("", "8095550001")).count, 1);
      assert.equal((await page("", "99000000001")).count, 1);
      const paginated = await page("", "", null, 2); assert.equal(paginated.rows.length, 2); assert.equal(paginated.count, 7); assert.equal(paginated.counts.all, 7);
      const [{ today }] = await tx`SELECT (now() AT TIME ZONE 'America/Santo_Domingo')::date::text AS today`;
      assert.equal((await page("", "", null, 25, today, today)).count, 1);
      await tx`INSERT INTO public.customer_photos(customer_id,tenant_id,image_data,updated_by) VALUES(${customers[0]},${tenant},${portrait},${admin})`;
      await tx`INSERT INTO public.customer_photos(customer_id,tenant_id,image_data,updated_by) VALUES(${customers[5]},${tenant},${portrait},${admin})`;
      assert.ok((await page()).rows.find((row) => row.id === customers[0]).photoUpdatedAt);
      await tx`UPDATE public.customer_photos SET image_data=${portrait},updated_at=clock_timestamp() WHERE customer_id=${customers[0]}`;
      await asUser(cashier);
      assert.equal((await page()).count, 6); assert.equal((await page("overdue")).count, 1);
      const expectDenied = async (operation) => { let rejected = false; try { await tx.savepoint(operation); } catch (error) { assert.equal(error.code, "42501"); rejected = true; } assert.ok(rejected); };
      await expectDenied((sp) => sp`INSERT INTO public.customer_photos(customer_id,tenant_id,image_data,updated_by) VALUES(${customers[5]},${tenant},${portrait},${cashier})`);
      assert.equal((await tx`SELECT customer_id FROM public.customer_photos WHERE customer_id=${customers[5]}`).length, 0);
      await asUser(reader);
      assert.equal((await tx`UPDATE public.customer_photos SET updated_by=${reader} WHERE customer_id=${customers[0]} RETURNING customer_id`).length, 0);
      await expectDenied((sp) => sp`INSERT INTO public.customer_photos(customer_id,tenant_id,image_data,updated_by) VALUES(${customers[1]},${tenant},${portrait},${reader})`);
      await asUser(outsider);
      await expectDenied((sp) => sp`SELECT public.customer_collection_page(${tenant})`);
      assert.equal((await tx`SELECT * FROM public.customer_photos WHERE tenant_id=${tenant}`).length, 0);
      await tx.unsafe("RESET ROLE");
      await tx`UPDATE public.installments SET amount_paid=amount_due,status='paid' WHERE id=${overdueNotes[0]}`;
      await asUser(admin);
      assert.equal((await page()).rows.find((row) => row.id === customers[0]).status, "due");
      await tx.unsafe("RESET ROLE");
      await tx`UPDATE public.installments SET amount_paid=25,status='partial' WHERE id=${overdueNotes[0]}`;
      await asUser(admin);
      assert.equal((await page()).rows.find((row) => row.id === customers[0]).status, "overdue");
      throw rollback;
    });
  } catch (error) { if (error !== rollback) throw error; }
  assert.equal((await sql`SELECT id FROM public.tenants WHERE id=${tenant}`).length, 0);
  console.log("Customer collection and photo database checks passed: distinct customers, multiple loans, exact balances, due dates, waived/approved exclusions, all filters, full counts with pagination, payment/reversal read-back and tenant/branch/read-only isolation; fixtures rolled back.");
} finally { await sql.end({ timeout: 5 }); }
