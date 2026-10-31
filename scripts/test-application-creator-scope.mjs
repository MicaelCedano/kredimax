import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { financingCalculator } from "./load-financing-calculator.mjs";

const { calculateFinancingQuote, DEFAULT_FINANCING_SETTINGS: defaults } = financingCalculator;
const line = readFileSync(new URL("../.env.local", import.meta.url), "utf8").split(/\r?\n/).find(row => row.startsWith("DATABASE_URL="));
const url = new URL(line.slice(13).trim().replace(/^['"]|['"]$/g, ""));
if (!["127.0.0.1", "localhost"].includes(url.hostname)) throw new Error("Local database required.");
const sql = postgres(url.toString(), { max: 1, prepare: false });
const tenant = randomUUID(), outsideTenant = randomUUID(), branch = randomUUID(), otherBranch = randomUUID();
const admin = randomUUID(), seller = randomUUID(), seller2 = randomUUID(), otherSeller = randomUUID(), manager = randomUUID(), auditor = randomUUID(), outsider = randomUUID();
const rollback = new Error("ROLLBACK_APPLICATION_CREATOR_SCOPE");
function imei() {
  const digits = randomUUID().replace(/\D/g, "").padEnd(14, "0").slice(0, 14);
  let sum = 0;
  for (let i=0;i<14;i++) { let n=Number(digits[i])*(i%2?2:1); if(n>9)n-=9; sum+=n; }
  return digits+(10-sum%10)%10;
}
try {
  try {
    await sql.begin(async tx => {
      const names = new Map([[admin,"Administrador"],[seller,"Vendedor Uno"],[seller2,"Vendedor Dos"],[otherSeller,"Otra sucursal"],[manager,"Gerente"],[auditor,"Auditor"],[outsider,"Fuera"]]);
      for (const [id, name] of names) await tx`INSERT INTO auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data)
        VALUES(${id},'authenticated','authenticated',${`${id}@example.test`},'{}',${tx.json({ full_name: name })})`;
      await tx`INSERT INTO public.tenants(id,name) VALUES(${tenant},'Disposable application ownership'),(${outsideTenant},'Outside application ownership')`;
      await tx`INSERT INTO public.branches(id,tenant_id,name,code) VALUES(${branch},${tenant},'Home','HOME'),(${otherBranch},${tenant},'Other','OTHER')`;
      for (const [id, role, scope, company] of [[admin,"tenant_admin",branch,tenant],[seller,"sales",branch,tenant],[seller2,"sales",branch,tenant],
        [otherSeller,"sales",otherBranch,tenant],[manager,"branch_manager",branch,tenant],[auditor,"auditor",branch,tenant],[outsider,"tenant_admin",null,outsideTenant]]) {
        await tx`INSERT INTO public.tenant_memberships(tenant_id,user_id,role,branch_id) VALUES(${company},${id},${role},${scope})`;
      }
      await tx`INSERT INTO public.financing_settings(tenant_id,down_payment_percent,annual_rate_percent,legal_expenses,allowed_terms,recovery_target_percent,recovery_enabled)
        VALUES(${tenant},${defaults.downPaymentPercent},${defaults.annualRatePercent},${defaults.legalExpenses},${defaults.allowedTerms},${defaults.recoveryTargetPercent},${defaults.recoveryEnabled})`;
      const asUser = async userId => {
        await tx.unsafe("RESET ROLE");
        await tx`SELECT set_config('request.jwt.claim.sub',${userId ?? ""},true),set_config('request.jwt.claims',${JSON.stringify(userId ? { sub:userId,aal:"aal1" } : {})},true)`;
        if (userId) await tx.unsafe("SET LOCAL ROLE authenticated");
      };
      const denied = async operation => {
        let rejected = false;
        try { await tx.savepoint(operation); } catch (error) { assert.equal(error.code,"42501"); rejected=true; }
        assert.ok(rejected,"Expected authorization rejection");
      };
      const [{ today }] = await tx`SELECT (clock_timestamp() AT TIME ZONE 'America/Santo_Domingo')::date::text AS today`;
      async function create(actor, scope, tag) {
        await asUser(actor);
        const [customer] = await tx`INSERT INTO public.customers(tenant_id,branch_id,full_name) VALUES(${tenant},${scope},${`Cliente ${tag}`}) RETURNING id`;
        const quote = calculateFinancingQuote({ ...defaults, salePrice:"12000.00", deviceCost:"12000.00", termMonths:5,
          frequency:"fortnightly", firstInstallmentDate:today, today });
        quote.recoveryTargetPercent = defaults.recoveryTargetPercent;
        quote.applicant = { customerName:`Cliente ${tag}`,identityNumber:null,phone:null,address:null,employer:null,monthlyIncome:null,reference:null };
        quote.device = { brand:"Demo",model:`Scope ${tag}`,imei:imei(),condition:"new",inventoryBranch:"Home" };
        const key=randomUUID();
        const call=async()=> (await tx`SELECT public.create_credit_application(${tenant},${customer.id},NULL,${scope},${quote.principal},${tx.json(quote)},${key}) AS id`)[0].id;
        const id=await call();assert.equal(await call(),id,"Retries keep one application and creator");
        const [saved]=await tx`SELECT created_by,created_by_name FROM public.credit_applications WHERE id=${id}`;
        assert.equal(saved.created_by,actor);assert.equal(saved.created_by_name,names.get(actor));
        return {id,quote};
      }
      const first=await create(seller,branch,"seller1");
      const second=await create(seller2,branch,"seller2");
      const remote=await create(otherSeller,otherBranch,"other-branch");
      const ownAdmin=await create(admin,branch,"admin");
      const directory=async()=> (await tx`SELECT public.application_creator_directory(${tenant}) AS rows`)[0].rows;
      const ids=async()=> (await tx`SELECT id FROM public.credit_applications WHERE tenant_id=${tenant} ORDER BY id`).map(row=>row.id).sort();
      assert.deepEqual(await ids(),[first.id,second.id,remote.id,ownAdmin.id].sort(),"Administrator reads all branches");
      assert.equal((await directory()).length,4);
      await tx`SELECT public.review_credit_application(${first.id},'approved','Ownership test',${first.quote.adjustmentRequiresApproval?"Test":null},${first.quote.adjustmentRequiresApproval?"Fictional basis":null},${first.quote.adjustmentRequiresApproval})`;
      const [{summary:adminSummary}] = await tx`SELECT public.tenant_dashboard_summary(${tenant},${today}::date,${today}::date) AS summary`;
      assert.equal(adminSummary.applications,4);
      await asUser(seller);
      assert.deepEqual(await ids(),[first.id],"The permissive FOR ALL policy cannot expose other sellers");
      assert.deepEqual(await directory(),[{id:seller,name:"Vendedor Uno"}]);
      assert.equal((await tx`SELECT quote_snapshot FROM public.credit_applications WHERE id=${second.id}`).length,0,"Direct IDs cannot reveal another quote");
      assert.equal((await tx`SELECT count(*)::int AS n FROM public.credit_applications WHERE tenant_id=${tenant} AND created_by=${seller2}`)[0].n,0);
      assert.equal((await tx`SELECT * FROM public.credit_application_events WHERE application_id=${second.id}`).length,0);
      const ownEvents=await tx`SELECT event_type,actor_id FROM public.credit_application_events WHERE application_id=${first.id}`;
      assert.ok(ownEvents.some(event=>event.event_type==='approved' && event.actor_id===admin),"Owner can read the administrator's decision on their request");
      await denied(sp=>sp`UPDATE public.credit_applications SET created_by=${seller} WHERE id=${second.id}`);
      await asUser(seller2);assert.deepEqual(await ids(),[second.id]);
      await asUser(otherSeller);assert.deepEqual(await ids(),[remote.id]);
      await asUser(manager);assert.deepEqual(await ids(),[]);
      await denied(sp=>sp`SELECT public.review_credit_application(${second.id},'rejected','Not my application',NULL,NULL,false)`);
      const [{summary}] = await tx`SELECT public.tenant_dashboard_summary(${tenant},${today}::date,${today}::date) AS summary`;
      assert.equal(summary.applications,0);assert.equal(summary.recent.length,0);
      await asUser(auditor);assert.deepEqual(await ids(),[]);
      const [{report}] = await tx`SELECT public.tenant_report_summary(${tenant},${today}::date,${today}::date) AS report`;
      assert.equal(report.applications,0);
      await asUser(outsider);assert.deepEqual(await ids(),[]);assert.deepEqual(await directory(),[]);
      await asUser(admin);
      await tx.unsafe("RESET ROLE");
      await denied(sp=>sp`UPDATE public.credit_applications SET created_by=${seller2} WHERE id=${first.id}`);
      await denied(sp=>sp`UPDATE public.credit_applications SET created_by_name='Forged name' WHERE id=${first.id}`);
      await tx`UPDATE auth.users SET raw_user_meta_data='{"full_name":"Changed profile","role":"tenant_admin"}' WHERE id=${seller}`;
      await asUser(seller);assert.deepEqual(await ids(),[first.id]);
      assert.equal((await tx`SELECT created_by_name FROM public.credit_applications WHERE id=${first.id}`)[0].created_by_name,"Vendedor Uno");
      await asUser(null);
      await tx`UPDATE public.tenant_memberships SET status='inactive' WHERE tenant_id=${tenant} AND user_id=${seller}`;
      await asUser(seller);assert.deepEqual(await ids(),[]);
      await tx.unsafe("RESET ROLE");
      await tx`UPDATE public.tenants SET status='suspended' WHERE id=${tenant}`;
      await asUser(admin);assert.deepEqual(await ids(),[]);
      await tx.unsafe("RESET ROLE");
      assert.equal((await tx`SELECT has_function_privilege('anon','public.application_creator_directory(uuid)','EXECUTE') AS allowed`)[0].allowed,false);
      await tx.unsafe("SET LOCAL ROLE anon");
      assert.equal((await tx`SELECT id FROM public.credit_applications WHERE tenant_id=${tenant}`).length,0);
      throw rollback;
    });
  } catch(error) { if(error!==rollback) throw error; }
  assert.equal((await sql`SELECT id FROM public.tenants WHERE id=${tenant}`).length,0);
  console.log("Application ownership passed: two same-branch sellers, other branch, administrator across branches, creator names and immutability, idempotency, direct IDs and filters, decision events, workflow RPC, counts/recent activity, inactive membership, suspended tenant and anonymous denial. Fixtures rolled back.");
} finally { await sql.end({timeout:5}); }
