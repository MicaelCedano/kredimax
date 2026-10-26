-- Local-only financial integration proof. All fixtures and postings roll back together.
BEGIN;

DO $$
BEGIN
  IF to_regprocedure('public.activate_approved_loan(uuid,text,text,uuid,text,date)') IS NOT NULL
    OR to_regprocedure('app_private.activate_approved_loan(uuid,text,text,uuid,text,date)') IS NOT NULL THEN
    RAISE EXCEPTION 'Legacy activation RPC without contract attestation remains callable';
  END IF;
  IF to_regprocedure('public.activate_approved_loan_with_evidence(uuid,text,text,uuid,text,boolean,date,bytea,boolean)') IS NULL THEN
    RAISE EXCEPTION 'Attested activation RPC is missing';
  END IF;
END $$;

DO $$
BEGIN
  IF app_private.imei_is_valid('490154203237518') IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'PostgreSQL IMEI validator rejected the shared valid Luhn example';
  END IF;
  IF app_private.imei_is_valid('490154203237519') IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'PostgreSQL IMEI validator accepted an altered check digit';
  END IF;
  IF app_private.imei_is_valid('49015420323751X') IS DISTINCT FROM false
    OR app_private.imei_is_valid('12345678901234567890') IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'PostgreSQL IMEI validator accepted malformed length or characters';
  END IF;
END $$;

CREATE TABLE public.kredimax_acl_probe_0051(id integer);
CREATE FUNCTION app_private.kredimax_default_exec_probe() RETURNS boolean
LANGUAGE sql AS $$ SELECT true $$;
DO $$
BEGIN
  IF has_function_privilege('anon','app_private.kredimax_default_exec_probe()','EXECUTE')
    OR has_function_privilege('authenticated','app_private.kredimax_default_exec_probe()','EXECUTE') THEN
    RAISE EXCEPTION 'New application functions inherit API EXECUTE privileges by default';
  END IF;
END $$;
DROP FUNCTION app_private.kredimax_default_exec_probe();

INSERT INTO auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at,raw_app_meta_data,raw_user_meta_data)
VALUES('11000000-0000-4000-8000-000000000001','authenticated','authenticated','finance-test@example.test','',now(),now(),now(),'{}','{}'),
      ('11000000-0000-4000-8000-000000000002','authenticated','authenticated','finance-collections@example.test','',now(),now(),now(),'{}','{}'),
      ('11000000-0000-4000-8000-000000000003','authenticated','authenticated','finance-sales@example.test','',now(),now(),now(),'{}','{}');
INSERT INTO public.tenants(id,name) VALUES('21000000-0000-4000-8000-000000000001','Financial Test Tenant');
INSERT INTO public.branches(id,tenant_id,name,code,active)
VALUES('22000000-0000-4000-8000-000000000001','21000000-0000-4000-8000-000000000001','Financial test branch','FIN-1',true);
INSERT INTO public.tenant_memberships(tenant_id,user_id,role,branch_id)
VALUES('21000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000001','tenant_admin',NULL),
      ('21000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000002','collections','22000000-0000-4000-8000-000000000001'),
      ('21000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000003','sales','22000000-0000-4000-8000-000000000001');
INSERT INTO public.customers(id,tenant_id,branch_id,full_name,identity_number)
VALUES('31000000-0000-4000-8000-000000000001','21000000-0000-4000-8000-000000000001','22000000-0000-4000-8000-000000000001','Cliente de prueba','TEST-11001');
INSERT INTO public.devices(id,tenant_id,branch_id,imei,brand,model)
VALUES('41000000-0000-4000-8000-000000000001','21000000-0000-4000-8000-000000000001','22000000-0000-4000-8000-000000000001','490154203237518','Test','Phone'),
      ('41000000-0000-4000-8000-000000000002','21000000-0000-4000-8000-000000000001','22000000-0000-4000-8000-000000000001','123456789012347','Test','Phone');
INSERT INTO public.credit_contracts(id,tenant_id,branch_id,customer_id,contract_number,terms)
VALUES('51000000-0000-4000-8000-000000000001','21000000-0000-4000-8000-000000000001','22000000-0000-4000-8000-000000000001','31000000-0000-4000-8000-000000000001','TEST-01','{}'),
      ('51000000-0000-4000-8000-000000000002','21000000-0000-4000-8000-000000000001','22000000-0000-4000-8000-000000000001','31000000-0000-4000-8000-000000000001','TEST-02','{"downPayment":"10.00"}');
INSERT INTO public.loans(id,tenant_id,branch_id,customer_id,contract_id,device_id,status,sale_price,down_payment,principal,interest_rate,installment_count,calculation_strategy)
VALUES('61000000-0000-4000-8000-000000000001','21000000-0000-4000-8000-000000000001','22000000-0000-4000-8000-000000000001','31000000-0000-4000-8000-000000000001','51000000-0000-4000-8000-000000000001','41000000-0000-4000-8000-000000000001','active',40,0,40,0,2,'test'),
      ('61000000-0000-4000-8000-000000000002','21000000-0000-4000-8000-000000000001','22000000-0000-4000-8000-000000000001','31000000-0000-4000-8000-000000000001','51000000-0000-4000-8000-000000000002','41000000-0000-4000-8000-000000000002','approved',40,10,30,0,1,'test');
INSERT INTO public.installments(id,tenant_id,loan_id,sequence,due_date,amount_due)
VALUES('71000000-0000-4000-8000-000000000001','21000000-0000-4000-8000-000000000001','61000000-0000-4000-8000-000000000001',1,((now() AT TIME ZONE 'America/Santo_Domingo')::date),20),
      ('71000000-0000-4000-8000-000000000002','21000000-0000-4000-8000-000000000001','61000000-0000-4000-8000-000000000001',2,((now() AT TIME ZONE 'America/Santo_Domingo')::date)+15,20),
      ('71000000-0000-4000-8000-000000000003','21000000-0000-4000-8000-000000000001','61000000-0000-4000-8000-000000000002',1,((now() AT TIME ZONE 'America/Santo_Domingo')::date)+30,30);

DO $$ BEGIN
  IF has_table_privilege('authenticated','public.payments','INSERT')
    OR has_table_privilege('authenticated','public.payment_allocations','INSERT')
    OR has_table_privilege('authenticated','public.ledger_entries','INSERT')
    OR has_table_privilege('authenticated','public.audit_logs','INSERT') THEN
    RAISE EXCEPTION 'Direct financial/audit INSERT privilege remains';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind IN ('r','p')
      AND (has_table_privilege('anon',c.oid,'REFERENCES')
        OR has_table_privilege('anon',c.oid,'TRIGGER')
        OR has_table_privilege('authenticated',c.oid,'REFERENCES')
        OR has_table_privilege('authenticated',c.oid,'TRIGGER'))
  ) THEN RAISE EXCEPTION 'API roles retain table REFERENCES or TRIGGER privileges'; END IF;
  IF app_private.imei_is_valid('490154203237518') IS NOT TRUE
    OR app_private.imei_is_valid('490154203237519') IS NOT FALSE THEN RAISE EXCEPTION 'IMEI Luhn check failed'; END IF;
  IF has_function_privilege('anon','app_private.imei_is_valid(text)','EXECUTE')
    OR NOT has_function_privilege('authenticated','app_private.imei_is_valid(text)','EXECUTE') THEN
    RAISE EXCEPTION 'IMEI validator API grants are not restricted to authenticated users';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind IN ('r','p')
      AND (has_table_privilege('anon',c.oid,'INSERT')
        OR has_table_privilege('anon',c.oid,'UPDATE')
        OR has_table_privilege('authenticated',c.oid,'DELETE')
        OR has_table_privilege('authenticated',c.oid,'TRUNCATE')
        OR has_table_privilege('anon',c.oid,'DELETE')
        OR has_table_privilege('anon',c.oid,'TRUNCATE'))
  ) THEN RAISE EXCEPTION 'Anonymous write or destructive privilege remains on public tables'; END IF;
  IF has_table_privilege('authenticated','public.tenant_memberships','UPDATE')
    OR has_table_privilege('authenticated','public.branches','INSERT')
    OR has_table_privilege('authenticated','public.credit_applications','UPDATE')
    OR has_table_privilege('authenticated','public.credit_contracts','INSERT')
    OR has_table_privilege('authenticated','public.customer_documents','INSERT')
    OR has_table_privilege('authenticated','public.ledger_accounts','UPDATE') THEN
    RAISE EXCEPTION 'Workflow-owned table write privilege bypasses its authorized RPC';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_trigger t JOIN pg_proc p ON p.oid=t.tgfoid
    JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE NOT t.tgisinternal AND n.nspname='app_private'
      AND (has_function_privilege('authenticated',p.oid,'EXECUTE')
        OR has_function_privilege('anon',p.oid,'EXECUTE'))
  ) THEN RAISE EXCEPTION 'Internal trigger function is directly executable by API roles'; END IF;
  IF to_regprocedure('supabase_functions.http_request()') IS NOT NULL
    AND (has_function_privilege('anon',to_regprocedure('supabase_functions.http_request()'),'EXECUTE')
      OR has_function_privilege('authenticated',to_regprocedure('supabase_functions.http_request()'),'EXECUTE')) THEN
    RAISE EXCEPTION 'Supabase HTTP trigger function remains executable by API roles';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE p.prosecdef AND n.nspname IN ('public','app_private')
      AND NOT EXISTS (
        SELECT 1 FROM unnest(coalesce(p.proconfig,ARRAY[]::text[])) setting
        WHERE setting LIKE 'search_path=%'
      )
  ) THEN RAISE EXCEPTION 'Application SECURITY DEFINER function has no fixed search_path'; END IF;
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE p.prosecdef AND n.nspname IN ('public','graphql_public')
      AND (has_function_privilege('anon',p.oid,'EXECUTE')
        OR EXISTS (SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl
          WHERE acl.grantee=0 AND acl.privilege_type='EXECUTE'))
  ) THEN RAISE EXCEPTION 'Exposed-schema SECURITY DEFINER function is callable by anon or PUBLIC'; END IF;
  BEGIN
    INSERT INTO public.customers(tenant_id,full_name,identity_number)
    VALUES('21000000-0000-4000-8000-000000000001','Duplicado normalizado','test 11001');
    RAISE EXCEPTION 'Normalized duplicate customer identity unexpectedly succeeded';
  EXCEPTION WHEN unique_violation THEN NULL; END;
  PERFORM set_config('request.jwt.claim.sub','11000000-0000-4000-8000-000000000001',true);
  PERFORM set_config('request.jwt.claims','{"sub":"11000000-0000-4000-8000-000000000001","aal":"aal1"}',true);
  BEGIN
    INSERT INTO public.credit_applications(tenant_id,branch_id,customer_id,requested_amount,status,created_by,quote_snapshot,submission_key)
    VALUES('21000000-0000-4000-8000-000000000001','22000000-0000-4000-8000-000000000001','31000000-0000-4000-8000-000000000001',1,'pending',
      '11000000-0000-4000-8000-000000000001','{"currency":null,"device":{"brand":"Test","model":"Test","imei":"356938035643809"}}',
      '81000000-0000-4000-8000-000000000021');
    RAISE EXCEPTION 'Malformed quote JSON unexpectedly created an application';
  EXCEPTION WHEN SQLSTATE '22023' THEN
    IF SQLERRM<>'INVALID_QUOTE_JSON_SHAPE' THEN RAISE; END IF;
  END;
END $$;

-- Verify the complete activation RPC authorization path under the real API role.
-- Sales can prepare financing but cannot approve/activate or post the initial payment.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '11000000-0000-4000-8000-000000000003';
SET LOCAL request.jwt.claims = '{"sub":"11000000-0000-4000-8000-000000000003","aal":"aal1"}';
DO $$
BEGIN
  BEGIN
    PERFORM public.activate_approved_loan_with_evidence(
      '61000000-0000-4000-8000-000000000002','cash','UNAUTHORIZED-INITIAL',
      '81000000-0000-4000-8000-000000000097','test/private-contract.pdf',true,(now() AT TIME ZONE 'America/Santo_Domingo')::date
    ,decode('524946463600000057454250565038202a0000003003009d012a280028003e6d369848a42322a1238800800d896900001b81bd3e0e0000fefb2180000000','hex'),true);
    RAISE EXCEPTION 'Sales role unexpectedly activated an approved loan';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL; END;
  BEGIN
    UPDATE public.credit_contracts
      SET contract_evidence_attested=true,contract_evidence_attested_by='11000000-0000-4000-8000-000000000003',contract_evidence_attested_at=now()
      WHERE id='51000000-0000-4000-8000-000000000002';
    RAISE EXCEPTION 'Authenticated role unexpectedly wrote contract evidence directly';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  IF EXISTS (SELECT 1 FROM public.payments WHERE idempotency_key='81000000-0000-4000-8000-000000000097')
    OR EXISTS (SELECT 1 FROM public.audit_logs WHERE entity_id='61000000-0000-4000-8000-000000000002' AND action='loan.activated')
    OR EXISTS (SELECT 1 FROM public.credit_contracts WHERE id='51000000-0000-4000-8000-000000000002' AND signed_by IS NOT NULL)
    OR NOT EXISTS (SELECT 1 FROM public.loans WHERE id='61000000-0000-4000-8000-000000000002' AND status='approved' AND activated_at IS NULL) THEN
    RAISE EXCEPTION 'Denied loan activation left payment, contract, audit, or status mutations';
  END IF;
END $$;
RESET ROLE;

SET LOCAL ROLE anon;
DO $$ BEGIN
  BEGIN
    INSERT INTO public.customers(tenant_id,full_name) VALUES('21000000-0000-4000-8000-000000000001','Anonymous write test');
    RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='anon INSERT unexpectedly succeeded';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    UPDATE public.customers SET full_name='Anonymous update test' WHERE id='31000000-0000-4000-8000-000000000001';
    RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='anon UPDATE unexpectedly succeeded';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '11000000-0000-4000-8000-000000000001';
SET LOCAL request.jwt.claims = '{"sub":"11000000-0000-4000-8000-000000000001","aal":"aal1"}';
DO $$
BEGIN
  BEGIN
    DELETE FROM public.customers WHERE id='31000000-0000-4000-8000-000000000001';
    RAISE EXCEPTION 'Direct customer deletion unexpectedly succeeded';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    TRUNCATE TABLE public.customers;
    RAISE EXCEPTION 'TRUNCATE unexpectedly succeeded for authenticated';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    UPDATE public.tenant_memberships SET status='suspended'
      WHERE tenant_id='21000000-0000-4000-8000-000000000001' AND user_id='11000000-0000-4000-8000-000000000001';
    RAISE EXCEPTION 'Direct membership write unexpectedly succeeded';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    INSERT INTO public.customer_documents(tenant_id,customer_id,document_type,storage_path)
      VALUES('21000000-0000-4000-8000-000000000001','31000000-0000-4000-8000-000000000001','identity','unapproved/path');
    RAISE EXCEPTION 'Private-document metadata write unexpectedly succeeded before consent/storage approval';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
DO $$
DECLARE dashboard jsonb; report jsonb;
BEGIN
  SELECT public.tenant_dashboard_summary('21000000-0000-4000-8000-000000000001',((now() AT TIME ZONE 'America/Santo_Domingo')::date),((now() AT TIME ZONE 'America/Santo_Domingo')::date)) INTO dashboard;
  SELECT public.tenant_report_summary('21000000-0000-4000-8000-000000000001',((now() AT TIME ZONE 'America/Santo_Domingo')::date),((now() AT TIME ZONE 'America/Santo_Domingo')::date)+30) INTO report;
  IF jsonb_typeof(dashboard->'activeBalance')<>'string'
    OR jsonb_typeof(dashboard->'allTimePaymentsReceived')<>'string'
    OR jsonb_typeof(dashboard->'overdueBalance')<>'string'
    OR jsonb_typeof(report->'openReceivable')<>'string'
    OR jsonb_typeof(report->'paymentsReceived')<>'string'
    OR jsonb_typeof(report->'overdueBalance')<>'string'
  THEN RAISE EXCEPTION 'Money aggregates must cross JSON boundaries as decimal strings'; END IF;
END $$;
DO $$
DECLARE payment_one uuid; payment_two uuid; payment_again uuid; reversal_id uuid; paid numeric; loan_state public.financing_status; membership_id uuid;
BEGIN
  INSERT INTO public.customers(tenant_id,full_name,identity_number)
    VALUES('21000000-0000-4000-8000-000000000001','Cliente auditado','TEST-AUDIT-11002');
  UPDATE public.devices SET model='Phone auditado' WHERE id='41000000-0000-4000-8000-000000000002';
  BEGIN
    UPDATE public.devices SET imei='123456789012345' WHERE id='41000000-0000-4000-8000-000000000001';
    RAISE EXCEPTION 'Financed device IMEI unexpectedly changed';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM<>'FINANCED_DEVICE_IMEI_LOCKED' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.activate_approved_loan_with_evidence('61000000-0000-4000-8000-000000000002','cash','INITIAL-1','81000000-0000-4000-8000-000000000099',NULL,true,(now() AT TIME ZONE 'America/Santo_Domingo')::date,decode('524946463600000057454250565038202a0000003003009d012a280028003e6d369848a42322a1238800800d896900001b81bd3e0e0000fefb2180000000','hex'),true);
    RAISE EXCEPTION 'Activation without signed document reference succeeded';
  EXCEPTION WHEN SQLSTATE '22023' THEN NULL; END;
  BEGIN
    PERFORM public.activate_approved_loan_with_evidence('61000000-0000-4000-8000-000000000002','cash','INITIAL-1','81000000-0000-4000-8000-000000000099','test/private-contract.pdf',false,(now() AT TIME ZONE 'America/Santo_Domingo')::date,decode('524946463600000057454250565038202a0000003003009d012a280028003e6d369848a42322a1238800800d896900001b81bd3e0e0000fefb2180000000','hex'),true);
    RAISE EXCEPTION 'Activation without explicit contract evidence attestation succeeded';
  EXCEPTION WHEN SQLSTATE '22023' THEN NULL; END;
  BEGIN
    PERFORM public.activate_approved_loan_with_evidence('61000000-0000-4000-8000-000000000002','cash','INITIAL-1','81000000-0000-4000-8000-000000000099','test/private-contract.pdf',NULL::boolean,(now() AT TIME ZONE 'America/Santo_Domingo')::date,decode('524946463600000057454250565038202a0000003003009d012a280028003e6d369848a42322a1238800800d896900001b81bd3e0e0000fefb2180000000','hex'),true);
    RAISE EXCEPTION 'Activation with null contract evidence attestation succeeded';
  EXCEPTION WHEN SQLSTATE '22023' THEN NULL; END;
  payment_one:=public.activate_approved_loan_with_evidence('61000000-0000-4000-8000-000000000002','cash','INITIAL-1','81000000-0000-4000-8000-000000000099','test/private-contract.pdf',true,(now() AT TIME ZONE 'America/Santo_Domingo')::date,decode('524946463600000057454250565038202a0000003003009d012a280028003e6d369848a42322a1238800800d896900001b81bd3e0e0000fefb2180000000','hex'),true);
  payment_again:=public.activate_approved_loan_with_evidence('61000000-0000-4000-8000-000000000002','cash','INITIAL-1','81000000-0000-4000-8000-000000000099','test/private-contract.pdf',true,(now() AT TIME ZONE 'America/Santo_Domingo')::date,decode('524946463600000057454250565038202a0000003003009d012a280028003e6d369848a42322a1238800800d896900001b81bd3e0e0000fefb2180000000','hex'),true);
  IF payment_one<>payment_again OR NOT EXISTS(SELECT 1 FROM public.payments WHERE id=payment_one AND amount=10 AND payment_type='down_payment')
    OR NOT EXISTS(SELECT 1 FROM public.loans WHERE id='61000000-0000-4000-8000-000000000002' AND status='active' AND delivered_by='11000000-0000-4000-8000-000000000001')
    OR NOT EXISTS(SELECT 1 FROM public.credit_contracts WHERE id='51000000-0000-4000-8000-000000000002' AND signed_by='11000000-0000-4000-8000-000000000001' AND document_path='test/private-contract.pdf' AND contract_evidence_attested AND contract_evidence_attested_by='11000000-0000-4000-8000-000000000001' AND contract_evidence_attested_at IS NOT NULL)
    OR NOT EXISTS(SELECT 1 FROM public.audit_logs WHERE entity_id='61000000-0000-4000-8000-000000000002' AND action='loan.activated' AND metadata->>'contractEvidenceAttested'='true')
  THEN RAISE EXCEPTION 'Activation evidence or idempotency failed'; END IF;
  BEGIN
    PERFORM public.record_loan_payment_with_evidence('61000000-0000-4000-8000-000000000002',10,'81000000-0000-4000-8000-000000000099','cash','INITIAL-1',decode('524946463600000057454250565038202a0000003003009d012a280028003e6d369848a42322a1238800800d896900001b81bd3e0e0000fefb2180000000','hex'),true);
    RAISE EXCEPTION 'Initial-payment key was reused for an installment';
  EXCEPTION WHEN SQLSTATE '22023' THEN
    IF SQLERRM NOT LIKE '%IDEMPOTENCY_KEY_REUSED%' THEN RAISE; END IF;
  END;
  reversal_id:=public.reverse_loan_payment(payment_one,'Reverso inicial de prueba');
  IF NOT EXISTS(SELECT 1 FROM public.loans WHERE id='61000000-0000-4000-8000-000000000002' AND status='approved')
    OR NOT EXISTS(SELECT 1 FROM public.ledger_entries WHERE id=reversal_id AND amount=-10 AND reverses_entry_id IS NOT NULL)
  THEN RAISE EXCEPTION 'Initial-payment reversal did not compensate and return loan to approval'; END IF;
  payment_one:=public.activate_approved_loan_with_evidence('61000000-0000-4000-8000-000000000002','bank_transfer','INITIAL-2','81000000-0000-4000-8000-000000000098','test/private-contract.pdf',true,(now() AT TIME ZONE 'America/Santo_Domingo')::date,decode('524946463600000057454250565038202a0000003003009d012a280028003e6d369848a42322a1238800800d896900001b81bd3e0e0000fefb2180000000','hex'),true);
  IF NOT EXISTS(SELECT 1 FROM public.loans WHERE id='61000000-0000-4000-8000-000000000002' AND status='active')
  THEN RAISE EXCEPTION 'Loan could not be reactivated after replacement initial payment'; END IF;
  BEGIN
    INSERT INTO public.payments(tenant_id,loan_id,idempotency_key,amount,received_by)
    VALUES('21000000-0000-4000-8000-000000000001','61000000-0000-4000-8000-000000000001','81000000-0000-4000-8000-000000000001',1,'11000000-0000-4000-8000-000000000001');
    RAISE EXCEPTION 'Direct payment insert unexpectedly succeeded';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    INSERT INTO public.payment_allocations(tenant_id,payment_id,installment_id,loan_id,amount)
    VALUES('21000000-0000-4000-8000-000000000001','81000000-0000-4000-8000-000000000001','71000000-0000-4000-8000-000000000001','61000000-0000-4000-8000-000000000001',1);
    RAISE EXCEPTION 'Direct allocation insert unexpectedly succeeded';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    INSERT INTO public.ledger_entries(tenant_id,account_id,amount,entry_type,description,created_by)
    VALUES('21000000-0000-4000-8000-000000000001',gen_random_uuid(),1,'forged','forged','11000000-0000-4000-8000-000000000001');
    RAISE EXCEPTION 'Direct ledger insert unexpectedly succeeded';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    INSERT INTO public.audit_logs(tenant_id,actor_id,action,entity_type)
    VALUES('21000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000001','forged','payment');
    RAISE EXCEPTION 'Direct audit insert unexpectedly succeeded';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;

  payment_one:=public.record_loan_payment_with_evidence('61000000-0000-4000-8000-000000000001',30,'81000000-0000-4000-8000-000000000011','cash',NULL,decode('524946463600000057454250565038202a0000003003009d012a280028003e6d369848a42322a1238800800d896900001b81bd3e0e0000fefb2180000000','hex'),true);
  SELECT amount_paid INTO paid FROM public.installments WHERE id='71000000-0000-4000-8000-000000000001';
  IF paid<>20 THEN RAISE EXCEPTION 'FIFO partial payment failed on installment 1'; END IF;
  SELECT amount_paid INTO paid FROM public.installments WHERE id='71000000-0000-4000-8000-000000000002';
  IF paid<>10 THEN RAISE EXCEPTION 'FIFO partial payment failed on installment 2'; END IF;
  BEGIN
    PERFORM public.record_loan_payment_with_evidence('61000000-0000-4000-8000-000000000001',11,'81000000-0000-4000-8000-000000000012','cash',NULL,decode('524946463600000057454250565038202a0000003003009d012a280028003e6d369848a42322a1238800800d896900001b81bd3e0e0000fefb2180000000','hex'),true);
    RAISE EXCEPTION 'Overpayment unexpectedly succeeded';
  EXCEPTION WHEN SQLSTATE '22023' THEN
    IF SQLERRM NOT LIKE '%PAYMENT_EXCEEDS_BALANCE%' THEN RAISE; END IF;
  END;
  payment_two:=public.record_loan_payment_with_evidence('61000000-0000-4000-8000-000000000001',10,'81000000-0000-4000-8000-000000000013','bank_transfer','TX-1',decode('524946463600000057454250565038202a0000003003009d012a280028003e6d369848a42322a1238800800d896900001b81bd3e0e0000fefb2180000000','hex'),true);
  SELECT status INTO loan_state FROM public.loans WHERE id='61000000-0000-4000-8000-000000000001';
  IF loan_state<>'paid_off' THEN RAISE EXCEPTION 'Loan did not close after exact final payment'; END IF;
  payment_again:=public.record_loan_payment_with_evidence('61000000-0000-4000-8000-000000000001',10,'81000000-0000-4000-8000-000000000013','bank_transfer','TX-1',decode('524946463600000057454250565038202a0000003003009d012a280028003e6d369848a42322a1238800800d896900001b81bd3e0e0000fefb2180000000','hex'),true);
  IF payment_again<>payment_two THEN RAISE EXCEPTION 'Idempotent retry returned another payment'; END IF;
  PERFORM set_config('request.jwt.claim.sub','11000000-0000-4000-8000-000000000002',true);
  PERFORM set_config('request.jwt.claims','{"sub":"11000000-0000-4000-8000-000000000002","aal":"aal1"}',true);
  BEGIN
    PERFORM public.reverse_loan_payment(payment_two,'No autorizado');
    RAISE EXCEPTION 'Collections role unexpectedly reversed payment';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL; END;
  PERFORM set_config('request.jwt.claim.sub','11000000-0000-4000-8000-000000000001',true);
  PERFORM set_config('request.jwt.claims','{"sub":"11000000-0000-4000-8000-000000000001","aal":"aal1"}',true);
  IF (SELECT count(*) FROM public.tenant_memberships WHERE tenant_id='21000000-0000-4000-8000-000000000001')<>3 THEN
    RAISE EXCEPTION 'Tenant administrator cannot read all memberships';
  END IF;
  SELECT id INTO membership_id FROM public.tenant_memberships WHERE user_id='11000000-0000-4000-8000-000000000002';
  PERFORM public.manage_tenant_membership(membership_id,'sales','22000000-0000-4000-8000-000000000001','active');
  IF NOT EXISTS(SELECT 1 FROM public.audit_logs WHERE action='membership.updated' AND entity_id=membership_id) THEN
    RAISE EXCEPTION 'Membership update was not audited';
  END IF;
  reversal_id:=public.reverse_loan_payment(payment_two,'Prueba de reverso autorizado');
  IF reversal_id IS NULL THEN RAISE EXCEPTION 'Reversal ledger entry was not created'; END IF;
  SELECT status INTO loan_state FROM public.loans WHERE id='61000000-0000-4000-8000-000000000001';
  IF loan_state<>'active' THEN RAISE EXCEPTION 'Reversal did not reopen paid loan'; END IF;
  payment_again:=public.record_loan_payment_with_evidence('61000000-0000-4000-8000-000000000001',10,'81000000-0000-4000-8000-000000000014','cash',NULL,decode('524946463600000057454250565038202a0000003003009d012a280028003e6d369848a42322a1238800800d896900001b81bd3e0e0000fefb2180000000','hex'),true);
  SELECT status INTO loan_state FROM public.loans WHERE id='61000000-0000-4000-8000-000000000001';
  IF loan_state<>'paid_off' THEN RAISE EXCEPTION 'Reopened balance could not be repaid'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.ledger_entries WHERE id=reversal_id AND amount=-10 AND reverses_entry_id IS NOT NULL)
    OR NOT EXISTS(SELECT 1 FROM public.audit_logs WHERE action='payment.reversed' AND entity_id=payment_two)
    OR NOT EXISTS(SELECT 1 FROM public.audit_logs WHERE action='payment.recorded' AND entity_id=payment_one) THEN
    RAISE EXCEPTION 'Ledger or audit evidence is incomplete';
  END IF;
END $$;

DO $$
DECLARE v_report jsonb; v_dashboard jsonb; v_reconciliation jsonb;
BEGIN
  v_report:=public.tenant_report_summary('21000000-0000-4000-8000-000000000001',((now() AT TIME ZONE 'America/Santo_Domingo')::date)-1,((now() AT TIME ZONE 'America/Santo_Domingo')::date)+30);
  IF (v_report->>'customers')::integer<>2 OR (v_report->>'devices')::integer<>2
    OR (v_report->>'activeLoans')::integer<>1 OR (v_report->>'openReceivable')::numeric<>30
    OR (v_report->>'paymentsReceived')::numeric<>50 OR (v_report->>'overdueInstallments')::integer<>0 THEN
    RAISE EXCEPTION 'Date-filtered unbounded report aggregation returned unexpected totals: %',v_report;
  END IF;
  v_reconciliation:=public.tenant_payment_reconciliation('21000000-0000-4000-8000-000000000001',
    ((now() AT TIME ZONE 'America/Santo_Domingo')::date)-1,((now() AT TIME ZONE 'America/Santo_Domingo')::date)+30);
  IF (v_reconciliation->>'paymentCount')::integer<>5
    OR (v_reconciliation->>'activePaymentCount')::integer<>3
    OR (v_reconciliation->>'reversedPaymentCount')::integer<>2
    OR (v_reconciliation->>'expectedLedgerNet')::numeric<>50
    OR (v_reconciliation->>'actualLedgerNet')::numeric<>50
    OR (v_reconciliation->>'ledgerDifference')::numeric<>0
    OR (v_reconciliation->>'receiptMismatchCount')::integer<>0
    OR (v_reconciliation->>'allocationMismatchCount')::integer<>0
    OR (v_reconciliation->>'reversalMismatchCount')::integer<>0 THEN
    RAISE EXCEPTION 'Internal payment reconciliation returned unexpected totals: %',v_reconciliation;
  END IF;
  v_dashboard:=public.tenant_dashboard_summary('21000000-0000-4000-8000-000000000001',
    (date_trunc('month',((now() AT TIME ZONE 'America/Santo_Domingo')::date))-interval '11 months')::date,((now() AT TIME ZONE 'America/Santo_Domingo')::date));
  IF (v_dashboard->>'customers')::integer<>2 OR (v_dashboard->>'devices')::integer<>2
    OR (v_dashboard->>'activeLoans')::integer<>1 OR (v_dashboard->>'activeBalance')::numeric<>30
    OR (v_dashboard->>'allTimePaymentsReceived')::numeric<>50
    OR (v_dashboard->>'overdueInstallments')::integer<>0 OR (v_dashboard->>'collectionRate')::integer<>0
    OR jsonb_typeof(v_dashboard->'chart')<>'array' OR jsonb_array_length(v_dashboard->'chart')<>12
    OR jsonb_typeof(v_dashboard->'upcoming')<>'array' OR jsonb_typeof(v_dashboard->'recent')<>'array' THEN
    RAISE EXCEPTION 'Unbounded dashboard aggregation returned unexpected totals: %',v_dashboard;
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.audit_logs WHERE tenant_id='21000000-0000-4000-8000-000000000001'
      AND action='customer.insert' AND entity_type='customer' AND metadata->'changedFields' ? 'full_name')
    OR NOT EXISTS(SELECT 1 FROM public.audit_logs WHERE tenant_id='21000000-0000-4000-8000-000000000001'
      AND action='device.update' AND entity_id='41000000-0000-4000-8000-000000000002' AND metadata->'changedFields' ? 'model') THEN
    RAISE EXCEPTION 'Operational customer/device changes were not audited';
  END IF;
END $$;

-- Inject a corrupted but transaction-local duplicate ledger receipt as the test owner.
-- The read-only reconciliation must surface it rather than silently repairing it.
RESET ROLE;
INSERT INTO public.ledger_entries(tenant_id,account_id,payment_id,amount,entry_type,description,created_by)
SELECT e.tenant_id,e.account_id,e.payment_id,1,'payment_received','Reconciliation anomaly fixture','11000000-0000-4000-8000-000000000001'
FROM public.ledger_entries e
WHERE e.tenant_id='21000000-0000-4000-8000-000000000001' AND e.entry_type='payment_received'
ORDER BY e.created_at,e.id LIMIT 1;
SET LOCAL ROLE authenticated;
DO $$
DECLARE v_reconciliation jsonb;
BEGIN
  v_reconciliation:=public.tenant_payment_reconciliation('21000000-0000-4000-8000-000000000001',
    ((now() AT TIME ZONE 'America/Santo_Domingo')::date)-1,((now() AT TIME ZONE 'America/Santo_Domingo')::date)+30);
  IF (v_reconciliation->>'receiptMismatchCount')::integer<>1
    OR (v_reconciliation->>'ledgerDifference')::numeric<>1 THEN
    RAISE EXCEPTION 'Read-only reconciliation did not expose a deliberately injected ledger mismatch: %',v_reconciliation;
  END IF;
END $$;

ROLLBACK;
