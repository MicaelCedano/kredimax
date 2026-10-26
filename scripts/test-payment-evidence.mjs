import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import postgres from 'postgres';
import sharp from 'sharp';
const line=readFileSync(new URL('../.env.local',import.meta.url),'utf8').split(/\r?\n/).find(x=>x.startsWith('DATABASE_URL='));
const url=new URL(line.slice(13).trim().replace(/^['"]|['"]$/g,''));
if(!['localhost','127.0.0.1'].includes(url.hostname))throw Error('Local database required');
const sql=postgres(url.toString(),{max:1,prepare:false});
const tenant=randomUUID(), branch=randomUUID(), otherBranch=randomUUID(), user=randomUUID(), cashier=randomUUID(), reader=randomUUID(), outside=randomUUID(), outsideTenant=randomUUID(), customer=randomUUID();
const image=await sharp({create:{width:30,height:40,channels:3,background:'white'}}).webp().toBuffer();
const changed=await sharp({create:{width:30,height:40,channels:3,background:'blue'}}).webp().toBuffer();
const rollback=Error('ROLLBACK_EVIDENCE');
try{try{await sql.begin(async tx=>{
  for(const id of [user,cashier,reader,outside])await tx`INSERT INTO auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at,raw_app_meta_data,raw_user_meta_data) VALUES(${id},'authenticated','authenticated',${id+'@example.test'},'',now(),now(),now(),'{}','{}')`;
  await tx`INSERT INTO public.tenants(id,name) VALUES(${tenant},'Disposable evidence test'),(${outsideTenant},'Outside evidence test')`;
  await tx`INSERT INTO public.branches(id,tenant_id,name,code) VALUES(${branch},${tenant},'Home','E-HOME'),(${otherBranch},${tenant},'Other','E-OTHER')`;
  for(const [id,role,scope] of [[user,'tenant_admin',branch],[cashier,'cashier',otherBranch],[reader,'auditor',branch]])await tx`INSERT INTO public.tenant_memberships(tenant_id,user_id,role,branch_id) VALUES(${tenant},${id},${role},${scope})`;
  await tx`INSERT INTO public.tenant_memberships(tenant_id,user_id,role) VALUES(${outsideTenant},${outside},'tenant_admin')`;
  await tx`INSERT INTO public.customers(id,tenant_id,branch_id,full_name) VALUES(${customer},${tenant},${branch},'Evidence test customer')`;
  const loans=[];
  for(let i=0;i<2;i++){
    const device=randomUUID(),contract=randomUUID(),loan=randomUUID();loans.push(loan);
    await tx`INSERT INTO public.devices(id,tenant_id,branch_id,imei,brand,model) VALUES(${device},${tenant},${branch},${'990821'+String(i).padStart(9,'0')},'Test','Evidence')`;
    await tx`INSERT INTO public.credit_contracts(id,tenant_id,branch_id,customer_id,contract_number,terms) VALUES(${contract},${tenant},${branch},${customer},${'E-'+i},'{}')`;
    await tx`INSERT INTO public.loans(id,tenant_id,branch_id,customer_id,contract_id,device_id,status,sale_price,down_payment,principal,interest_rate,installment_count,calculation_strategy) VALUES(${loan},${tenant},${branch},${customer},${contract},${device},${i===0?'active':'approved'},1000,300,700,0,1,'evidence-fixture')`;
    await tx`INSERT INTO public.installments(id,tenant_id,loan_id,sequence,due_date,amount_due) VALUES(${randomUUID()},${tenant},${loan},1,current_date+10,700)`;
  }
  const asUser=async id=>{await tx.unsafe('SET LOCAL ROLE authenticated');await tx`SELECT set_config('request.jwt.claim.sub',${id},true),set_config('request.jwt.claims',${JSON.stringify({sub:id,aal:'aal1'})},true)`;};
  const reject=async(fn,code,pattern)=>{let rejected=false;try{await tx.savepoint(fn);}catch(e){assert.equal(e.code,code);if(pattern)assert.match(e.message,pattern);rejected=true;}assert.equal(rejected,true);};
  const record=(sp,method,bytes,attest=false,key=randomUUID(),amount=100)=>sp`SELECT public.record_loan_payment_with_evidence(${loans[0]},${amount},${key},${method},'TEST-EVIDENCE',${bytes},${attest}) AS id`;
  const activate=(sp,bytes,attest=true,key=randomUUID())=>sp`SELECT public.activate_approved_loan_with_evidence(${loans[1]},'cash','TEST-INITIAL',${key},'test/contract-signed',true,(now() AT TIME ZONE 'America/Santo_Domingo')::date,${bytes},${attest}) AS id`;
  await asUser(user);
  await reject(sp=>record(sp,'cash',null,true),'22023',/EVIDENCE_REQUIRED/);
  await reject(sp=>record(sp,'bank_transfer',null),'22023',/EVIDENCE_REQUIRED/);
  await reject(sp=>record(sp,'cash',image,false),'22023',/SIGNED_CASH/);
  await reject(sp=>record(sp,'bank_transfer',Buffer.from('fake')),'22023',/INVALID_PAYMENT_EVIDENCE/);
  await reject(sp=>activate(sp,null),'22023',/EVIDENCE_REQUIRED/);
  assert.equal((await tx`SELECT id FROM public.payments WHERE tenant_id=${tenant}`).length,0);
  assert.equal((await tx`SELECT status FROM public.loans WHERE id=${loans[1]}`)[0].status,'approved');
  const key=randomUUID();const [{id:payment}]=await record(tx,'bank_transfer',image,false,key);
  assert.equal((await record(tx,'bank_transfer',image,false,key))[0].id,payment);
  await reject(sp=>record(sp,'bank_transfer',changed,false,key),'22023',/IDEMPOTENCY_EVIDENCE_CONFLICT/);
  const [stored]=await tx`SELECT * FROM public.payment_evidence WHERE payment_id=${payment}`;
  assert.equal(stored.evidence_kind,'bank_transfer_voucher');assert.equal(stored.created_by,user);assert.deepEqual(stored.image_data,image);
  assert.equal((await tx`SELECT sum(amount)::text AS total FROM public.payment_allocations WHERE payment_id=${payment}`)[0].total,'100.00');
  assert.equal((await tx`SELECT count(*)::integer AS n FROM public.ledger_entries WHERE payment_id=${payment}`)[0].n,1);
  const [{id:cashPayment}]=await record(tx,'cash',image,true);
  assert.equal((await tx`SELECT signed_receipt_attested FROM public.payment_evidence WHERE payment_id=${cashPayment}`)[0].signed_receipt_attested,true);
  const initialKey=randomUUID();const [{id:initial}]=await activate(tx,image,true,initialKey);
  assert.equal((await activate(tx,image,true,initialKey))[0].id,initial);
  assert.equal((await tx`SELECT status FROM public.loans WHERE id=${loans[1]}`)[0].status,'active');
  assert.equal((await tx`SELECT amount::text,payment_type FROM public.payments WHERE id=${initial}`)[0].amount,'300.00');
  assert.equal((await tx`SELECT count(*)::integer AS n FROM public.payment_evidence WHERE tenant_id=${tenant}`)[0].n,3);
  const [{result}]=await tx`SELECT public.tenant_receipt_page(${tenant}) AS result`;assert.ok(result.rows.every(x=>x.hasEvidence));
  await reject(sp=>sp`UPDATE public.payment_evidence SET image_data=${changed} WHERE payment_id=${payment}`,'42501');
  await reject(sp=>sp`DELETE FROM public.payment_evidence WHERE payment_id=${payment}`,'42501');
  for(const signature of ['public.record_loan_payment(uuid,numeric,uuid,text,text)','app_private.record_loan_payment(uuid,numeric,uuid,text,text)','public.activate_approved_loan(uuid,text,text,uuid,text,boolean,date)','app_private.activate_approved_loan(uuid,text,text,uuid,text,boolean,date)'])assert.equal((await tx`SELECT has_function_privilege('authenticated',${signature},'EXECUTE') AS allowed`)[0].allowed,false);
  await tx`SELECT public.reverse_loan_payment(${payment},'Evidence retention test')`;
  assert.equal((await tx`SELECT image_sha256 FROM public.payment_evidence WHERE payment_id=${payment}`)[0].image_sha256,stored.image_sha256);
  await asUser(reader);assert.equal((await tx`SELECT payment_id FROM public.payment_evidence WHERE tenant_id=${tenant}`).length,3);await reject(sp=>record(sp,'cash',image,true),'42501');
  for(const id of [cashier,outside]){await asUser(id);assert.equal((await tx`SELECT payment_id FROM public.payment_evidence WHERE tenant_id=${tenant}`).length,0);await reject(sp=>record(sp,'cash',image,true),'42501');}
  await tx.unsafe('RESET ROLE');
  // Force evidence insertion to fail after financial work. The entire wrapper must roll back.
  await tx.unsafe(`CREATE FUNCTION pg_temp.reject_evidence() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'TEST_INSERT_FAILURE'; END $$`);
  await tx.unsafe('CREATE TRIGGER test_reject_evidence BEFORE INSERT ON public.payment_evidence FOR EACH ROW EXECUTE FUNCTION pg_temp.reject_evidence()');
  await asUser(user);
  const before=(await tx`SELECT amount_paid::text FROM public.installments WHERE loan_id=${loans[0]}`)[0].amount_paid;
  await reject(sp=>record(sp,'cash',image,true),'P0001',/TEST_INSERT_FAILURE/);
  assert.equal((await tx`SELECT amount_paid::text FROM public.installments WHERE loan_id=${loans[0]}`)[0].amount_paid,before);
  assert.equal((await tx`SELECT count(*)::integer AS n FROM public.payments WHERE tenant_id=${tenant}`)[0].n,3);
  assert.equal((await tx`SELECT count(*)::integer AS n FROM public.ledger_entries WHERE tenant_id=${tenant} AND entry_type='payment_received'`)[0].n,3);
  throw rollback;
});}catch(e){if(e!==rollback)throw e;}
assert.equal((await sql`SELECT id FROM public.tenants WHERE id=${tenant}`).length,0);
console.log('Payment evidence passed: mandatory images and signed cash attestation, atomic initial/installment payments, exact allocations/ledger, idempotency conflicts, reversal retention, immutable evidence, old entry-point protection, read permissions and tenant/branch isolation. Failure injection rolled back all financial effects; fixtures removed.');
}finally{await sql.end({timeout:5});}
