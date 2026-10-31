import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import postgres from "postgres";

const line = readFileSync(new URL("../.env.local", import.meta.url), "utf8").split(/\r?\n/).find(row => row.startsWith("DATABASE_URL="));
const url = new URL(line.slice(13).trim().replace(/^['"]|['"]$/g, ""));
if (!["127.0.0.1", "localhost"].includes(url.hostname)) throw new Error("Local database required.");
const sql = postgres(url.toString(), { max: 1, prepare: false });
const tenant = randomUUID(), outside = randomUUID(), branch = randomUUID(), otherBranch = randomUUID();
const admin = randomUUID(), auditor = randomUUID(), outsider = randomUUID(), sellers = [randomUUID(), randomUUID(), randomUUID()], otherSeller = randomUUID();
const rollback = new Error("ROLLBACK_CASH_FIXTURES");
function testImei() {
  const digits = randomUUID().replace(/\D/g, "").padEnd(14, "0").slice(0, 14);
  let sum = 0;
  for (let i=0;i<14;i++) { let n=Number(digits[i])*(i%2?2:1); if(n>9)n-=9; sum+=n; }
  return digits+(10-sum%10)%10;
}
const evidence = Buffer.from("524946463600000057454250565038202a0000003003009d012a280028003e6d369848a42322a1238800800d896900001b81bd3e0e0000fefb2180000000", "hex");
try {
  try {
    await sql.begin(async tx => {
      for (const [id, name] of [[admin,"Admin"],[auditor,"Auditor"],[outsider,"Fuera"],[otherSeller,"Otra sucursal"],...sellers.map((id,index)=>[id,`Vendedor ${index+1}`])]) {
        await tx`INSERT INTO auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data) VALUES(${id},'authenticated','authenticated',${`${id}@example.test`},'{}',${tx.json({ full_name:name })})`;
      }
      await tx`INSERT INTO public.tenants(id,name) VALUES(${tenant},'Disposable cash'),(${outside},'Outside cash')`;
      await tx`INSERT INTO public.branches(id,tenant_id,name,code) VALUES(${branch},${tenant},'Home','HOME'),(${otherBranch},${tenant},'Other','OTHER')`;
      for (const [id, role, scope, company] of [[admin,"tenant_admin",branch,tenant],[auditor,"auditor",branch,tenant],[outsider,"tenant_admin",null,outside],...sellers.map(id=>[id,"sales",branch,tenant]),[otherSeller,"sales",otherBranch,tenant]]) {
        await tx`INSERT INTO public.tenant_memberships(tenant_id,user_id,role,branch_id) VALUES(${company},${id},${role},${scope})`;
      }
      const asUser = async userId => {
        await tx.unsafe("RESET ROLE");
        await tx`SELECT set_config('request.jwt.claim.sub',${userId ?? ""},true),set_config('request.jwt.claims',${JSON.stringify(userId ? {sub:userId,aal:"aal1"} : {})},true)`;
        if (userId) await tx.unsafe("SET LOCAL ROLE authenticated");
      };
      const failure = async (operation, expected) => {
        let rejected = false;
        try { await tx.savepoint(operation); } catch (error) { assert.match(`${error.code}:${error.message}`,expected); rejected=true; }
        assert.ok(rejected,"Expected rejection");
      };
      const [{today, yesterday}] = await tx`SELECT (clock_timestamp() AT TIME ZONE 'America/Santo_Domingo')::date::text AS today,((clock_timestamp() AT TIME ZONE 'America/Santo_Domingo')::date-1)::text AS yesterday`;
      const report = async (day = today) => (await tx`SELECT public.cash_day_report(${tenant},${day}::date) AS rows`)[0].rows;
      const details = async (seller, type, page=1, day=today) => (await tx`SELECT public.cash_day_movements(${tenant},${branch},${seller},${day}::date,${type},${page}) AS result`)[0].result;
      const close = async (seller, type, cash, transfer, other="0", notes="") => (await tx`SELECT public.close_cash_day(${tenant},${branch},${seller},${today}::date,${type},${cash}::numeric,${transfer}::numeric,${other}::numeric,${notes}) AS id`)[0].id;
      const loans = [];
      for (const [offset, seller] of sellers.entries()) {
        for (const method of ["cash","bank_transfer"]) {
          await asUser(null);
          const customer=randomUUID(),device=randomUUID(),contract=randomUUID(),loan=randomUUID(),installment=randomUUID();
          await tx`INSERT INTO public.customers(id,tenant_id,branch_id,full_name) VALUES(${customer},${tenant},${branch},'Disposable cash customer')`;
          await tx`INSERT INTO public.devices(id,tenant_id,branch_id,imei,brand,model) VALUES(${device},${tenant},${branch},${testImei()},'Demo','Demo')`;
          await tx`INSERT INTO public.credit_contracts(id,tenant_id,customer_id,contract_number,terms) VALUES(${contract},${tenant},${customer},${`CASH-${randomUUID()}`},'{}')`;
          await tx`INSERT INTO public.loans(id,tenant_id,customer_id,contract_id,device_id,status,sale_price,down_payment,principal,interest_rate,installment_count,calculation_strategy)
            VALUES(${loan},${tenant},${customer},${contract},${device},'approved',10000,3000,7000,0,1,'cash-test')`;
          await tx`INSERT INTO public.installments(id,tenant_id,loan_id,sequence,due_date,amount_due) VALUES(${installment},${tenant},${loan},1,${today}::date,7000)`;
          await asUser(seller);
          const initialKey=randomUUID();
          const [{id:initial}] = await tx`SELECT public.activate_approved_loan_with_evidence(${loan},${method},'CASH-TEST',${initialKey},'DEMO/signed-test',true,${yesterday}::date,${evidence},true) AS id`;
          // Backdated delivery must still put the initial in today's drawer.
          assert.equal((await report()).find(row=>row.type==='down_payment').movements,method==='cash'?1:2);
          const [{id:retry}] = await tx`SELECT public.activate_approved_loan_with_evidence(${loan},${method},'CASH-TEST',${initialKey},'DEMO/signed-test',true,${yesterday}::date,${evidence},true) AS id`;
          assert.equal(retry,initial);
          const [{id:payment}] = await tx`SELECT public.record_loan_payment_with_evidence(${loan},100,${randomUUID()},${method},'CASH-TEST',${evidence},true) AS id`;
          assert.equal((await report()).length,2,"A seller only sees their own two drawers");
          await tx.unsafe("RESET ROLE");
          const [{receipt_number:number}] = await tx`SELECT receipt_number FROM public.payments WHERE id=${payment}`;
          assert.match(number,/^REC-\d{4}-\d{6}$/);
          loans.push({loan,installment,seller,initial,payment,method,offset});
        }
      }
      await asUser(admin);
      const rows=await report();
      assert.equal(rows.length,8,"Four sellers, two drawers each, including zero-collection drawers");
      const demo=rows.filter(row=>sellers.includes(row.sellerId));
      assert.equal(demo.filter(row=>row.type==='down_payment').reduce((sum,row)=>sum+Number(row.cash)+Number(row.transfer),0),18000);
      assert.equal(demo.filter(row=>row.type==='installment').reduce((sum,row)=>sum+Number(row.cash)+Number(row.transfer),0),600);
      const detail=await details(sellers[0],'installment');
      assert.equal(detail.count,2);assert.equal(detail.total,'200.00');assert.equal(detail.rows.length,2);
      assert.match(detail.rows[0].receipt,/^REC-\d{4}-\d{6}$/);
      assert.equal((await details(sellers[0],'installment',2)).rows.length,0);
      await asUser(auditor); assert.equal((await report()).length,6,"Auditor is branch scoped");
      await failure(()=>close(sellers[0],'installment','100','100'),/42501/);
      await asUser(outsider); await failure(()=>report(),/42501/);
      await asUser(otherSeller); assert.equal((await report()).length,2);
      await failure(()=>close(sellers[0],'installment','100','100'),/42501/);
      await asUser(sellers[0]);
      await failure(()=>details(sellers[1],'installment'),/42501/);
      assert.equal((await details(sellers[0],'down_payment')).count,2);
      await failure(()=>close(sellers[1],'installment','100','100'),/42501/);
      await failure(()=>close(sellers[0],'installment','90','110'),/CLOSING_DIFFERENCE_REASON_REQUIRED/);
      await failure(()=>close(sellers[0],'installment','100.001','100'),/INVALID_CLOSING/);
      await failure(()=>close(sellers[0],'installment','NaN','100'),/INVALID_CLOSING/);
      await failure(()=>close(sellers[0],'installment','100','100','0','x'.repeat(1001)),/INVALID_CLOSING/);
      const mismatch=await close(sellers[0],'installment','90','110','0','Diferencia por método de prueba');
      assert.equal(await close(sellers[0],'installment','90','110','0','Diferencia por método de prueba'),mismatch);
      await failure(()=>close(sellers[0],'installment','100','100'),/CASH_ALREADY_CLOSED/);
      await failure(sp=>sp`UPDATE public.cash_closings SET declared_cash=100 WHERE id=${mismatch}`,/42501/);
      await failure(sp=>sp`DELETE FROM public.cash_closings WHERE id=${mismatch}`,/42501/);
      const firstLoan=loans[0];
      await failure(sp=>sp`SELECT public.record_loan_payment_with_evidence(${firstLoan.loan},50,${randomUUID()},'cash','LATE',${evidence},true)`,/CASH_ALREADY_CLOSED/);
      const row=(await report()).find(row=>row.type==='installment');
      assert.equal(row.cash,'100.00');assert.equal(row.transfer,'100.00');assert.equal(row.closing.difference,'0.00');
      assert.equal(row.closing.cash,'90.00');assert.equal(row.closing.transfer,'110.00');
      await asUser(admin);
      await failure(sp=>sp`SELECT public.reverse_loan_payment(${firstLoan.payment},'After closing rejection')`,/CASH_ALREADY_CLOSED/);
      // A previous day's receipt and today's reversal stay on their respective business dates.
      const target=loans.find(loan=>loan.seller===sellers[1] && loan.method==='cash');
      await asUser(null);
      const historical=randomUUID();
      await tx`INSERT INTO public.payments(id,tenant_id,loan_id,idempotency_key,amount,received_by,payment_method,payment_type,received_at)
        VALUES(${historical},${tenant},${target.loan},${randomUUID()},50,${target.seller},'cash','installment',(${yesterday}::date+time '23:59:59') AT TIME ZONE 'America/Santo_Domingo')`;
      await tx`INSERT INTO public.payment_allocations(tenant_id,payment_id,installment_id,loan_id,amount) VALUES(${tenant},${historical},${target.installment},${target.loan},50)`;
      await tx`UPDATE public.installments SET amount_paid=amount_paid+50 WHERE id=${target.installment}`;
      await tx`INSERT INTO public.ledger_entries(tenant_id,account_id,payment_id,amount,entry_type,description,created_by)
        SELECT ${tenant},id,${historical},50,'payment_received','Historical test',${target.seller} FROM public.ledger_accounts WHERE tenant_id=${tenant} AND code='CASH_RECEIPTS'`;
      await asUser(admin);
      await tx`SELECT public.reverse_loan_payment(${historical},'Historical reversal test')`;
      const yesterdayRow=(await report(yesterday)).find(row=>row.sellerId===target.seller && row.type==='installment');
      assert.equal(yesterdayRow.cash,'50.00');
      const todayRow=(await report()).find(row=>row.sellerId===target.seller && row.type==='installment');
      assert.equal(todayRow.cash,'50.00'); assert.equal(todayRow.transfer,'100.00');
      const reversedDetail=await details(target.seller,'installment');
      assert.equal(reversedDetail.total,'150.00');assert.equal(reversedDetail.rows.find(row=>row.paymentId===historical).kind,'payment_reversal');
      const initialClosing=await close(sellers[0],'down_payment','3000','3000');
      assert.ok(initialClosing,"Initial and installment drawers close independently");
      await close(sellers[1],'installment','50','100');
      const [{count}] = await tx`SELECT count(*)::int AS count FROM public.audit_logs WHERE tenant_id=${tenant} AND action='cash.closed'`;
      assert.equal(count,3);
      await asUser(null);
      const [{numbers,unique_numbers}] = await tx`SELECT count(receipt_number)::int AS numbers,count(DISTINCT receipt_number)::int AS unique_numbers FROM public.payments WHERE tenant_id=${tenant}`;
      assert.equal(numbers,13);assert.equal(numbers,unique_numbers);
      throw rollback;
    });
  } catch(error) { if(error!==rollback) throw error; }
  assert.equal((await sql`SELECT id FROM public.tenants WHERE id=${tenant}`).length,0);
  console.log("Cash checks passed: three sellers; cash/transfer; initial vs installments; actual collection date; totals; zero drawers; role/branch/tenant isolation; numbered receipts; idempotency; differences by method; immutable closes; late posting/reversal rollback; historical reversal dates; audit. All fixtures rolled back.");
} finally { await sql.end({timeout:5}); }
