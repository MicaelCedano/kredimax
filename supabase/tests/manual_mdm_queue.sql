-- Run on local Supabase after the Drizzle migrations. All fixture data rolls back.
BEGIN;

INSERT INTO auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data) VALUES
 ('84000000-0000-4000-8000-000000000001','authenticated','authenticated','operator-mdm@example.test','{}','{"full_name":"Programador Prueba"}');
INSERT INTO public.tenants(id,name) VALUES ('84000000-0000-4000-8000-000000000010','MDM QA');
INSERT INTO public.branches(id,tenant_id,name,code) VALUES
 ('84000000-0000-4000-8000-000000000011','84000000-0000-4000-8000-000000000010','MDM A','MDM-A'),
 ('84000000-0000-4000-8000-000000000012','84000000-0000-4000-8000-000000000010','MDM B','MDM-B');
INSERT INTO public.tenant_memberships(tenant_id,branch_id,user_id,role) VALUES
 ('84000000-0000-4000-8000-000000000010','84000000-0000-4000-8000-000000000011','84000000-0000-4000-8000-000000000001','mdm_operator');
INSERT INTO public.customers(id,tenant_id,branch_id,full_name) VALUES
 ('84000000-0000-4000-8000-000000000021','84000000-0000-4000-8000-000000000010','84000000-0000-4000-8000-000000000011','Valeria Demo'),
 ('84000000-0000-4000-8000-000000000022','84000000-0000-4000-8000-000000000010','84000000-0000-4000-8000-000000000012','Otra Sucursal');
INSERT INTO public.devices(id,tenant_id,branch_id,imei,brand,model) VALUES
 ('84000000-0000-4000-8000-000000000031','84000000-0000-4000-8000-000000000010','84000000-0000-4000-8000-000000000011','490154203237518','Apple','iPhone 15'),
 ('84000000-0000-4000-8000-000000000032','84000000-0000-4000-8000-000000000010','84000000-0000-4000-8000-000000000012','123456789012347','Samsung','Galaxy A55');
INSERT INTO public.credit_contracts(id,tenant_id,branch_id,customer_id,contract_number,terms) VALUES
 ('84000000-0000-4000-8000-000000000041','84000000-0000-4000-8000-000000000010','84000000-0000-4000-8000-000000000011','84000000-0000-4000-8000-000000000021','MDM-A','{}'),
 ('84000000-0000-4000-8000-000000000042','84000000-0000-4000-8000-000000000010','84000000-0000-4000-8000-000000000012','84000000-0000-4000-8000-000000000022','MDM-B','{}');
INSERT INTO public.loans(id,tenant_id,branch_id,customer_id,contract_id,device_id,status,sale_price,down_payment,principal,installment_count,calculation_strategy) VALUES
 ('84000000-0000-4000-8000-000000000051','84000000-0000-4000-8000-000000000010','84000000-0000-4000-8000-000000000011','84000000-0000-4000-8000-000000000021','84000000-0000-4000-8000-000000000041','84000000-0000-4000-8000-000000000031','approved',300,100,200,2,'mdm-qa'),
 ('84000000-0000-4000-8000-000000000052','84000000-0000-4000-8000-000000000010','84000000-0000-4000-8000-000000000012','84000000-0000-4000-8000-000000000022','84000000-0000-4000-8000-000000000042','84000000-0000-4000-8000-000000000032','approved',200,100,100,1,'mdm-qa');
INSERT INTO public.installments(tenant_id,loan_id,sequence,due_date,amount_due,amount_paid,status) VALUES
 ('84000000-0000-4000-8000-000000000010','84000000-0000-4000-8000-000000000051',1,(now() AT TIME ZONE 'America/Santo_Domingo')::date-1,100,40,'partial'),
 ('84000000-0000-4000-8000-000000000010','84000000-0000-4000-8000-000000000051',2,(now() AT TIME ZONE 'America/Santo_Domingo')::date,100,0,'pending');

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '84000000-0000-4000-8000-000000000001';
DO $$
DECLARE tenant uuid := '84000000-0000-4000-8000-000000000010';
  loan uuid := '84000000-0000-4000-8000-000000000051';
  queue jsonb;
BEGIN
  queue := public.manual_mdm_list(tenant,'enroll','',1);
  IF queue->>'count' IS DISTINCT FROM '1' OR queue #>> '{rows,0,customer}' IS DISTINCT FROM 'Valeria Demo' THEN
    RAISE EXCEPTION 'Only the assigned branch should be visible: %',queue;
  END IF;
  IF public.manual_mdm_list(tenant,'enroll','Galaxy',1)->>'count' IS DISTINCT FROM '0'
    OR public.manual_mdm_confirm(tenant,'84000000-0000-4000-8000-000000000052','enroll',NULL,NULL) <> 'forbidden'
    OR app_private.has_tenant_permission(tenant,'financing.approve')
    OR has_function_privilege('anon','public.manual_mdm_list(uuid,text,text,integer)','EXECUTE')
    OR has_table_privilege('authenticated','app_private.mdm_manual_events','INSERT')
    OR has_table_privilege('authenticated','public.mdm_commands','INSERT') THEN
    RAISE EXCEPTION 'MDM privileges escaped their scope';
  END IF;
  IF public.manual_mdm_confirm(tenant,loan,'enroll',NULL,'MDM-123') <> 'completed' THEN
    RAISE EXCEPTION 'Enrollment failed';
  END IF;
  IF public.manual_mdm_confirm(tenant,loan,'enroll',NULL,'Duplicate') <> 'stale'
    OR public.manual_mdm_list(tenant,'lock','',1)->>'count' IS DISTINCT FROM '0' THEN
    RAISE EXCEPTION 'An approved loan must not require locking or allow duplicate enrollment';
  END IF;
END $$;

RESET ROLE;
UPDATE public.loans SET status='active' WHERE id='84000000-0000-4000-8000-000000000051';
SET LOCAL ROLE authenticated;
DO $$
DECLARE tenant uuid := '84000000-0000-4000-8000-000000000010';
  loan uuid := '84000000-0000-4000-8000-000000000051';
  queue jsonb := public.manual_mdm_list(tenant,'lock','iPhone',1);
BEGIN
  IF queue->>'count' IS DISTINCT FROM '1' OR queue #>> '{rows,0,overdue_balance}' IS DISTINCT FROM '60.00' THEN
    RAISE EXCEPTION 'Past-due balance should exclude amounts paid and installments due today: %',queue;
  END IF;
  IF public.manual_mdm_confirm(tenant,loan,'lock',(queue #>> '{rows,0,previous_event_id}')::bigint,NULL) <> 'completed' THEN
    RAISE EXCEPTION 'Lock confirmation failed';
  END IF;
  IF public.manual_mdm_list(tenant,'unlock','',1)->>'count' IS DISTINCT FROM '0' THEN
    RAISE EXCEPTION 'A locked device should wait for the overdue balance to clear';
  END IF;
END $$;

RESET ROLE;
UPDATE public.installments SET amount_paid=amount_due,status='paid'
WHERE loan_id='84000000-0000-4000-8000-000000000051' AND sequence=1;
SET LOCAL ROLE authenticated;
DO $$
DECLARE tenant uuid := '84000000-0000-4000-8000-000000000010';
  loan uuid := '84000000-0000-4000-8000-000000000051';
  queue jsonb := public.manual_mdm_list(tenant,'unlock','',1);
BEGIN
  IF queue->>'count' IS DISTINCT FROM '1' THEN RAISE EXCEPTION 'Payment should move the device to unlock'; END IF;
  IF public.manual_mdm_confirm(tenant,loan,'unlock',(queue #>> '{rows,0,previous_event_id}')::bigint,NULL) <> 'completed' THEN
    RAISE EXCEPTION 'Unlock confirmation failed';
  END IF;
  queue := public.manual_mdm_list(tenant,'completed','Valeria',1);
  IF queue->>'count' IS DISTINCT FROM '3'
    OR queue #>> '{rows,0,action}' IS DISTINCT FROM 'unlock'
    OR queue #>> '{rows,2,operator_name}' IS DISTINCT FROM 'Programador Prueba'
    OR queue #>> '{rows,2,reference}' IS DISTINCT FROM 'MDM-123' THEN
    RAISE EXCEPTION 'The audit history did not retain all confirmations: %',queue;
  END IF;
END $$;

RESET ROLE;
UPDATE public.installments SET amount_paid=40,status='partial'
WHERE loan_id='84000000-0000-4000-8000-000000000051' AND sequence=1;
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  IF public.manual_mdm_list('84000000-0000-4000-8000-000000000010','lock','',1)->>'count' IS DISTINCT FROM '1' THEN
    RAISE EXCEPTION 'A reversed payment should restore the lock task';
  END IF;
END $$;

ROLLBACK;
