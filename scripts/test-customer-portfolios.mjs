import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import postgres from "postgres";

const line = readFileSync(new URL("../.env.local", import.meta.url), "utf8").split(/\r?\n/).find(row => row.startsWith("DATABASE_URL="));
const url = new URL(line.slice(13).trim().replace(/^['"]|['"]$/g, ""));
if (!["127.0.0.1", "localhost"].includes(url.hostname)) throw new Error("Local database required.");
const sql = postgres(url.toString(), { max: 1, prepare: false });
const tenant = randomUUID(), outsideTenant = randomUUID(), branch = randomUUID(), otherBranch = randomUUID();
const admin = randomUUID(), seller = randomUUID(), seller2 = randomUUID(), outsider = randomUUID();
const rollback = new Error("ROLLBACK_PORTFOLIO_FIXTURE");
try {
  try {
    await sql.begin(async tx => {
      for (const [id, name] of [[admin, "Admin"], [seller, "Vendedor Uno"], [seller2, "Vendedor Dos"], [outsider, "Fuera"]]) {
        await tx`INSERT INTO auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data) VALUES(${id},'authenticated','authenticated',${`${id}@example.test`},'{}',${tx.json({ full_name: name })})`;
      }
      await tx`INSERT INTO public.tenants(id,name) VALUES(${tenant},'Disposable portfolios'),(${outsideTenant},'Outside portfolios')`;
      await tx`INSERT INTO public.branches(id,tenant_id,name,code) VALUES(${branch},${tenant},'Home','HOME'),(${otherBranch},${tenant},'Other','OTHER')`;
      for (const [id, role, scope, company] of [[admin,"tenant_admin",branch,tenant],[seller,"sales",branch,tenant],[seller2,"sales",otherBranch,tenant],[outsider,"tenant_admin",null,outsideTenant]]) {
        await tx`INSERT INTO public.tenant_memberships(tenant_id,user_id,role,branch_id) VALUES(${company},${id},${role},${scope})`;
      }
      const legacy = randomUUID();
      await tx`INSERT INTO public.customers(id,tenant_id,branch_id,full_name) VALUES(${legacy},${tenant},${branch},'Historical unknown')`;
      const asUser = async id => {
        await tx.unsafe("SET LOCAL ROLE authenticated");
        await tx`SELECT set_config('request.jwt.claim.sub',${id},true),set_config('request.jwt.claims',${JSON.stringify({ sub: id, aal: "aal1" })},true)`;
      };
      const denied = async operation => {
        let rejected = false;
        try { await tx.savepoint(operation); } catch (error) { assert.equal(error.code,"42501"); rejected = true; }
        assert.ok(rejected,"Expected access rejection");
      };
      await asUser(seller);
      const [created] = await tx`INSERT INTO public.customers(tenant_id,branch_id,full_name,created_by,created_by_name) VALUES(${tenant},${branch},'Registered by seller',${admin},'Forged admin') RETURNING id,created_by,created_by_name`;
      assert.equal(created.created_by,seller); assert.equal(created.created_by_name,"Vendedor Uno");
      await denied(sp => sp`UPDATE public.customers SET created_by=${admin} WHERE id=${created.id}`);
      await denied(sp => sp`UPDATE public.customers SET created_by_name='Forged name' WHERE id=${created.id}`);
      await tx`UPDATE public.customers SET phone='809-555-0101' WHERE id=${created.id}`;
      await denied(sp => sp`INSERT INTO public.customers(tenant_id,branch_id,full_name) VALUES(${tenant},${otherBranch},'Forbidden branch')`);
      await denied(sp => sp`INSERT INTO public.customers(tenant_id,full_name) VALUES(${outsideTenant},'Forbidden tenant')`);
      await asUser(seller2);
      await tx`INSERT INTO public.customers(tenant_id,branch_id,full_name) VALUES(${tenant},${otherBranch},'Other seller')`;
      const [{ directory: limited }] = await tx`SELECT public.customer_portfolio_sellers(${tenant}) AS directory`;
      assert.deepEqual(limited,[{ id:seller2,name:"Vendedor Dos" }]);
      await asUser(admin);
      const page = async (owner = "", size = 25) => {
        const [{ result }] = await tx`SELECT public.customer_collection_page(${tenant},'', '',NULL,NULL,NULL,1,${size},${owner}) AS result`;
        return result;
      };
      const all = await page(); assert.equal(all.count,3); assert.equal(all.counts.all,3);
      assert.equal((await page("unassigned")).rows[0].id,legacy);
      const own = await page(seller); assert.equal(own.count,1); assert.equal(own.counts.all,1);
      assert.equal(own.rows[0].sellerId,seller); assert.equal(own.rows[0].sellerName,"Vendedor Uno");
      assert.equal((await page(seller2)).count,1); assert.equal((await page(outsider)).count,0);
      assert.equal((await page("",1)).count,3); assert.equal((await page("",1)).rows.length,1);
      await denied(sp => sp`UPDATE public.customers SET created_by=${admin} WHERE id=${created.id}`);
      await asUser(outsider);
      const [{ directory }] = await tx`SELECT public.customer_portfolio_sellers(${tenant}) AS directory`;
      assert.deepEqual(directory,[]);
      await denied(sp => sp`SELECT public.customer_collection_page(${tenant})`);
      throw rollback;
    });
  } catch (error) { if (error !== rollback) throw error; }
  assert.equal((await sql`SELECT id FROM public.tenants WHERE id=${tenant}`).length,0);
  console.log("Portfolio checks passed: automatic creator and name, forged attribution ignored, immutable responsibility, editable contact, legacy unassigned, seller filters/counts/pagination, tenant/branch isolation; fixtures rolled back.");
} finally { await sql.end({ timeout: 5 }); }
