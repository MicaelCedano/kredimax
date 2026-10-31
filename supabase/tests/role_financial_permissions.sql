-- Role-level financial RPC and read-permission matrix; local fixture rolls back.
BEGIN;

INSERT INTO auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at,raw_app_meta_data,raw_user_meta_data)
VALUES
 ('13000000-0000-4000-8000-000000000001','authenticated','authenticated','role-admin@example.test','',now(),now(),now(),'{}','{}'),
 ('13000000-0000-4000-8000-000000000002','authenticated','authenticated','role-branch@example.test','',now(),now(),now(),'{}','{}'),
 ('13000000-0000-4000-8000-000000000003','authenticated','authenticated','role-sales@example.test','',now(),now(),now(),'{}','{}'),
 ('13000000-0000-4000-8000-000000000004','authenticated','authenticated','role-cashier@example.test','',now(),now(),now(),'{}','{}'),
 ('13000000-0000-4000-8000-000000000005','authenticated','authenticated','role-collections@example.test','',now(),now(),now(),'{}','{}'),
 ('13000000-0000-4000-8000-000000000006','authenticated','authenticated','role-auditor@example.test','',now(),now(),now(),'{}','{}');
INSERT INTO public.tenants(id,name) VALUES('24000000-0000-4000-8000-000000000001','Role permission test');
INSERT INTO public.branches(id,tenant_id,name,code,active)
VALUES('25000000-0000-4000-8000-000000000001','24000000-0000-4000-8000-000000000001','Test branch','ROLE-1',true);
INSERT INTO public.tenant_memberships(tenant_id,user_id,role,branch_id) VALUES
 ('24000000-0000-4000-8000-000000000001','13000000-0000-4000-8000-000000000001','tenant_admin',NULL),
 ('24000000-0000-4000-8000-000000000001','13000000-0000-4000-8000-000000000002','branch_manager','25000000-0000-4000-8000-000000000001'),
 ('24000000-0000-4000-8000-000000000001','13000000-0000-4000-8000-000000000003','sales','25000000-0000-4000-8000-000000000001'),
 ('24000000-0000-4000-8000-000000000001','13000000-0000-4000-8000-000000000004','cashier','25000000-0000-4000-8000-000000000001'),
 ('24000000-0000-4000-8000-000000000001','13000000-0000-4000-8000-000000000005','collections','25000000-0000-4000-8000-000000000001'),
 ('24000000-0000-4000-8000-000000000001','13000000-0000-4000-8000-000000000006','auditor','25000000-0000-4000-8000-000000000001');
INSERT INTO public.customers(id,tenant_id,branch_id,full_name)
VALUES('26000000-0000-4000-8000-000000000001','24000000-0000-4000-8000-000000000001','25000000-0000-4000-8000-000000000001','Role test customer');
INSERT INTO public.devices(id,tenant_id,branch_id,imei,brand,model)
VALUES('27000000-0000-4000-8000-000000000001','24000000-0000-4000-8000-000000000001','25000000-0000-4000-8000-000000000001','490154203237518','Test','Role');
INSERT INTO public.credit_contracts(id,tenant_id,customer_id,contract_number,terms)
VALUES('28000000-0000-4000-8000-000000000001','24000000-0000-4000-8000-000000000001','26000000-0000-4000-8000-000000000001','ROLE-1','{}');
INSERT INTO public.loans(id,tenant_id,branch_id,customer_id,contract_id,device_id,status,sale_price,down_payment,principal,interest_rate,installment_count,calculation_strategy)
VALUES('29000000-0000-4000-8000-000000000001','24000000-0000-4000-8000-000000000001','25000000-0000-4000-8000-000000000001',
 '26000000-0000-4000-8000-000000000001','28000000-0000-4000-8000-000000000001','27000000-0000-4000-8000-000000000001',
 'active',100,0,100,0,1,'role-matrix');
INSERT INTO public.installments(id,tenant_id,loan_id,sequence,due_date,amount_due)
VALUES('2a000000-0000-4000-8000-000000000001','24000000-0000-4000-8000-000000000001',
 '29000000-0000-4000-8000-000000000001',1,((now() AT TIME ZONE 'America/Santo_Domingo')::date)+30,100);
INSERT INTO public.notifications(id,tenant_id,user_id,category,title,body) VALUES
 ('2d000000-0000-4000-8000-000000000001','24000000-0000-4000-8000-000000000001','13000000-0000-4000-8000-000000000001','test','Admin notice','Fixture'),
 ('2d000000-0000-4000-8000-000000000002','24000000-0000-4000-8000-000000000001','13000000-0000-4000-8000-000000000002','test','Branch notice','Fixture'),
 ('2d000000-0000-4000-8000-000000000003','24000000-0000-4000-8000-000000000001','13000000-0000-4000-8000-000000000003','test','Sales notice','Fixture'),
 ('2d000000-0000-4000-8000-000000000004','24000000-0000-4000-8000-000000000001','13000000-0000-4000-8000-000000000004','test','Cashier notice','Fixture'),
 ('2d000000-0000-4000-8000-000000000005','24000000-0000-4000-8000-000000000001','13000000-0000-4000-8000-000000000005','test','Collections notice','Fixture'),
 ('2d000000-0000-4000-8000-000000000006','24000000-0000-4000-8000-000000000001','13000000-0000-4000-8000-000000000006','test','Auditor notice','Fixture');

SET LOCAL ROLE authenticated;
DO $$
DECLARE
  v_users uuid[]:=ARRAY[
    '13000000-0000-4000-8000-000000000001'::uuid,
    '13000000-0000-4000-8000-000000000002'::uuid,
    '13000000-0000-4000-8000-000000000003'::uuid,
    '13000000-0000-4000-8000-000000000004'::uuid,
    '13000000-0000-4000-8000-000000000005'::uuid,
    '13000000-0000-4000-8000-000000000006'::uuid
  ];
  v_roles text[]:=ARRAY['tenant_admin','branch_manager','sales','cashier','collections','auditor'];
  v_can_record boolean[]:=ARRAY[true,true,true,true,true,false];
  v_can_report boolean[]:=ARRAY[true,true,false,false,true,true];
  v_can_read_payments boolean[]:=ARRAY[true,true,true,true,true,true];
  v_payment_ids uuid[]:='{}'::uuid[];
  v_payment_id uuid;
  v_count integer;
  v_permission_key text;
  v_expected_permission boolean;
  v_actual_permission boolean;
  i integer;
BEGIN
  IF has_function_privilege('anon','public.record_loan_payment_with_evidence(uuid,numeric,uuid,text,text,bytea,boolean)','EXECUTE')
    OR NOT has_function_privilege('authenticated','public.record_loan_payment_with_evidence(uuid,numeric,uuid,text,text,bytea,boolean)','EXECUTE')
    OR has_function_privilege('anon','public.reverse_loan_payment(uuid,text)','EXECUTE')
    OR NOT has_function_privilege('authenticated','public.reverse_loan_payment(uuid,text)','EXECUTE') THEN
    RAISE EXCEPTION 'Financial RPC grants are broader/narrower than intended';
  END IF;
  IF has_table_privilege('authenticated','public.notifications','INSERT')
    OR has_table_privilege('authenticated','public.notifications','UPDATE')
    OR has_table_privilege('authenticated','public.notifications','DELETE')
    OR has_table_privilege('authenticated','public.notifications','TRUNCATE')
    OR has_column_privilege('authenticated','public.notifications','title','UPDATE')
    OR has_column_privilege('authenticated','public.notifications','body','UPDATE')
    OR NOT has_column_privilege('authenticated','public.notifications','read_at','UPDATE') THEN
    RAISE EXCEPTION 'Notification privileges do not restrict API users to marking read_at';
  END IF;
  IF has_table_privilege('authenticated','public.mdm_commands','INSERT')
    OR has_table_privilege('authenticated','public.mdm_commands','UPDATE')
    OR has_table_privilege('authenticated','public.mdm_commands','DELETE')
    OR has_table_privilege('authenticated','public.mdm_commands','TRUNCATE')
    OR has_table_privilege('anon','public.mdm_commands','INSERT')
    OR has_table_privilege('anon','public.mdm_commands','UPDATE')
    OR has_table_privilege('anon','public.mdm_commands','DELETE')
    OR has_table_privilege('anon','public.mdm_commands','TRUNCATE')
    OR NOT has_table_privilege('authenticated','public.mdm_commands','SELECT')
    OR EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='mdm_commands'
      AND policyname='mdm_commands_confirmed_insert') THEN
    RAISE EXCEPTION 'MDM API users can still create or mutate local commands';
  END IF;

  FOR i IN 1..array_length(v_users,1) LOOP
    PERFORM set_config('request.jwt.claim.sub',v_users[i]::text,true);
    PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',v_users[i]::text,'aal','aal1')::text,true);
    SELECT count(*) INTO v_count FROM public.notifications WHERE tenant_id='24000000-0000-4000-8000-000000000001';
    IF v_count<>1 THEN RAISE EXCEPTION 'Role % can see another user notification: % rows',v_roles[i],v_count; END IF;
    UPDATE public.notifications SET read_at=now()
      WHERE id=('2d000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid AND user_id=v_users[i];
    GET DIAGNOSTICS v_count=ROW_COUNT;
    IF v_count<>1 THEN RAISE EXCEPTION 'Role % could not mark its own notice read',v_roles[i]; END IF;
    UPDATE public.notifications SET read_at=now()
      WHERE id='2d000000-0000-4000-8000-000000000001' AND user_id<>v_users[i];
    GET DIAGNOSTICS v_count=ROW_COUNT;
    IF v_count<>0 THEN RAISE EXCEPTION 'Role % updated another user notification',v_roles[i]; END IF;
    IF i=1 THEN
      BEGIN
        INSERT INTO public.notifications(tenant_id,user_id,category,title,body)
        VALUES('24000000-0000-4000-8000-000000000001',v_users[i],'test','Injected','Not allowed');
        RAISE EXCEPTION 'Direct notification insert unexpectedly succeeded';
      EXCEPTION WHEN insufficient_privilege THEN NULL; END;
      BEGIN
        UPDATE public.notifications SET title='Injected' WHERE id='2d000000-0000-4000-8000-000000000001';
        RAISE EXCEPTION 'Direct notification content update unexpectedly succeeded';
      EXCEPTION WHEN insufficient_privilege THEN NULL; END;
    END IF;
    FOREACH v_permission_key IN ARRAY ARRAY[
      'customers.read','customers.write','financing.read','financing.write','financing.approve',
      'payments.read','payments.record','devices.read','devices.write','mdm.command',
      'reports.read','tenant.manage','audit.read','branches.read','branches.manage','settings.manage',
      'cash.read','cash.close','cash.manage','financing.activate'
    ] LOOP
      v_expected_permission := CASE v_roles[i]
        WHEN 'tenant_admin' THEN true
        WHEN 'branch_manager' THEN v_permission_key=ANY(ARRAY[
          'customers.read','customers.write','financing.read','financing.write','financing.approve',
          'payments.read','payments.record','devices.read','devices.write','reports.read','branches.read','branches.manage',
          'cash.read','cash.close','cash.manage','financing.activate'
        ])
        WHEN 'sales' THEN v_permission_key=ANY(ARRAY[
          'customers.read','customers.write','financing.read','financing.write','devices.read','devices.write',
          'payments.read','payments.record','cash.read','cash.close','financing.activate'
        ])
        WHEN 'cashier' THEN v_permission_key=ANY(ARRAY[
          'customers.read','financing.read','payments.read','payments.record','cash.read','cash.close'
        ])
        WHEN 'collections' THEN v_permission_key=ANY(ARRAY[
          'customers.read','financing.read','payments.read','payments.record','reports.read','cash.read','cash.close'
        ])
        WHEN 'auditor' THEN v_permission_key=ANY(ARRAY[
          'customers.read','financing.read','payments.read','devices.read','reports.read','audit.read','branches.read','cash.read','cash.manage'
        ])
        ELSE false
      END;
      v_actual_permission := app_private.has_branch_permission(
        '24000000-0000-4000-8000-000000000001','25000000-0000-4000-8000-000000000001',v_permission_key
      );
      IF v_actual_permission IS DISTINCT FROM v_expected_permission THEN
        RAISE EXCEPTION 'Unexpected permission % for role %: expected %, got %',
          v_permission_key,v_roles[i],v_expected_permission,v_actual_permission;
      END IF;
    END LOOP;
    IF app_private.has_branch_permission('24000000-0000-4000-8000-000000000001','25000000-0000-4000-8000-000000000001','payments.record') IS DISTINCT FROM v_can_record[i] THEN
      RAISE EXCEPTION 'Unexpected payments.record permission for role %',v_roles[i];
    END IF;
    IF app_private.has_branch_permission('24000000-0000-4000-8000-000000000001','25000000-0000-4000-8000-000000000001','reports.read') IS DISTINCT FROM v_can_report[i] THEN
      RAISE EXCEPTION 'Unexpected reports.read permission for role %',v_roles[i];
    END IF;
    IF v_can_report[i] THEN
      PERFORM public.tenant_report_summary('24000000-0000-4000-8000-000000000001',((now() AT TIME ZONE 'America/Santo_Domingo')::date),((now() AT TIME ZONE 'America/Santo_Domingo')::date)+30);
      PERFORM public.tenant_report_payment_details('24000000-0000-4000-8000-000000000001',((now() AT TIME ZONE 'America/Santo_Domingo')::date)-1,((now() AT TIME ZONE 'America/Santo_Domingo')::date)+31);
    ELSE
      BEGIN
        PERFORM public.tenant_report_summary('24000000-0000-4000-8000-000000000001',((now() AT TIME ZONE 'America/Santo_Domingo')::date),((now() AT TIME ZONE 'America/Santo_Domingo')::date)+30);
        RAISE EXCEPTION 'Report RPC unexpectedly allowed role %',v_roles[i];
      EXCEPTION WHEN SQLSTATE '42501' THEN NULL; END;
      BEGIN
        PERFORM public.tenant_report_payment_details('24000000-0000-4000-8000-000000000001',((now() AT TIME ZONE 'America/Santo_Domingo')::date)-1,((now() AT TIME ZONE 'America/Santo_Domingo')::date)+31);
        RAISE EXCEPTION 'Payment detail export unexpectedly allowed role %',v_roles[i];
      EXCEPTION WHEN SQLSTATE '42501' THEN NULL; END;
    END IF;
    IF v_can_read_payments[i] THEN
      PERFORM public.tenant_collections_summary('24000000-0000-4000-8000-000000000001');
      PERFORM public.tenant_open_installment_page('24000000-0000-4000-8000-000000000001',1,50);
    ELSE
      BEGIN
        PERFORM public.tenant_collections_summary('24000000-0000-4000-8000-000000000001');
        RAISE EXCEPTION 'Collections summary unexpectedly allowed role %',v_roles[i];
      EXCEPTION WHEN SQLSTATE '42501' THEN NULL; END;
      BEGIN
        PERFORM public.tenant_open_installment_page('24000000-0000-4000-8000-000000000001',1,50);
        RAISE EXCEPTION 'Open installment page unexpectedly allowed role %',v_roles[i];
      EXCEPTION WHEN SQLSTATE '42501' THEN NULL; END;
    END IF;
    IF v_can_record[i] THEN
      v_payment_id:=public.record_loan_payment_with_evidence('29000000-0000-4000-8000-000000000001',5,
        ('2b000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,'cash','ROLE-'||v_roles[i],decode('524946463600000057454250565038202a0000003003009d012a280028003e6d369848a42322a1238800800d896900001b81bd3e0e0000fefb2180000000','hex'),true);
      v_payment_ids:=array_append(v_payment_ids,v_payment_id);
    ELSE
      BEGIN
        PERFORM public.record_loan_payment_with_evidence('29000000-0000-4000-8000-000000000001',5,
          ('2b000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,'cash','ROLE-'||v_roles[i],decode('524946463600000057454250565038202a0000003003009d012a280028003e6d369848a42322a1238800800d896900001b81bd3e0e0000fefb2180000000','hex'),true);
        RAISE EXCEPTION 'Payment RPC unexpectedly allowed role %',v_roles[i];
      EXCEPTION WHEN SQLSTATE '42501' THEN NULL; END;
    END IF;
  END LOOP;

  IF cardinality(v_payment_ids)<>5 THEN RAISE EXCEPTION 'Expected five authorized role payments'; END IF;
  PERFORM set_config('request.jwt.claim.sub','13000000-0000-4000-8000-000000000003',true);
  PERFORM set_config('request.jwt.claims','{"sub":"13000000-0000-4000-8000-000000000003","aal":"aal1"}',true);
  BEGIN
    UPDATE public.devices SET imei='356938035643809' WHERE id='27000000-0000-4000-8000-000000000001';
    RAISE EXCEPTION 'Same-branch sales role unexpectedly changed a financed device IMEI';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM<>'FINANCED_DEVICE_IMEI_LOCKED' THEN RAISE; END IF;
  END;
  IF NOT EXISTS(SELECT 1 FROM public.devices WHERE id='27000000-0000-4000-8000-000000000001' AND imei='490154203237518') THEN
    RAISE EXCEPTION 'Financed device IMEI changed despite the identity lock';
  END IF;
  FOR i IN 1..array_length(v_users,1) LOOP
    PERFORM set_config('request.jwt.claim.sub',v_users[i]::text,true);
    PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',v_users[i]::text,'aal','aal1')::text,true);
    SELECT count(*) INTO v_count FROM public.payments WHERE tenant_id='24000000-0000-4000-8000-000000000001';
    IF v_count<>5 THEN
      RAISE EXCEPTION 'Unexpected payment visibility for role %: %',v_roles[i],v_count;
    END IF;
  END LOOP;
  FOR i IN 2..array_length(v_users,1) LOOP
    PERFORM set_config('request.jwt.claim.sub',v_users[i]::text,true);
    PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',v_users[i]::text,'aal','aal1')::text,true);
    BEGIN
      PERFORM public.reverse_loan_payment(v_payment_ids[1],'Unauthorized matrix reversal');
      RAISE EXCEPTION 'Role % unexpectedly reversed a payment',v_roles[i];
    EXCEPTION WHEN SQLSTATE '42501' THEN NULL; END;
  END LOOP;
  PERFORM set_config('request.jwt.claim.sub',v_users[1]::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',v_users[1]::text,'aal','aal1')::text,true);
  FOREACH v_payment_id IN ARRAY v_payment_ids LOOP
    PERFORM public.reverse_loan_payment(v_payment_id,'Authorized matrix reversal');
  END LOOP;
  SELECT count(*) INTO v_count FROM public.ledger_entries WHERE tenant_id='24000000-0000-4000-8000-000000000001'
    AND entry_type='payment_reversal';
  IF v_count<>5 OR EXISTS(SELECT 1 FROM public.installments WHERE id='2a000000-0000-4000-8000-000000000001' AND amount_paid<>0) THEN
    RAISE EXCEPTION 'Authorized reversals did not restore allocations and compensating ledger';
  END IF;

  IF to_regprocedure('public.record_loan_payment(uuid,numeric,uuid)') IS NOT NULL
    OR to_regprocedure('app_private.record_loan_payment(uuid,numeric,uuid)') IS NOT NULL THEN
    RAISE EXCEPTION 'Redundant three-argument payment wrappers remain and conflict with default arguments';
  END IF;
  v_payment_id:=public.record_loan_payment_with_evidence(
    '29000000-0000-4000-8000-000000000001'::uuid,5::numeric,
    '2b000000-0000-4000-8000-000000000098'::uuid,'other',NULL
  ,decode('524946463600000057454250565038202a0000003003009d012a280028003e6d369848a42322a1238800800d896900001b81bd3e0e0000fefb2180000000','hex'),true);
  IF NOT EXISTS(SELECT 1 FROM public.payments WHERE id=v_payment_id AND payment_method='other' AND reference IS NULL) THEN
    RAISE EXCEPTION 'Explicit other-method payment did not preserve its method and reference';
  END IF;
  PERFORM public.reverse_loan_payment(v_payment_id,'Three-argument RPC compatibility check');
END $$;
RESET ROLE;
UPDATE public.tenants SET status='suspended' WHERE id='24000000-0000-4000-8000-000000000001';
SET LOCAL ROLE authenticated;
DO $$
DECLARE
  v_user uuid:='13000000-0000-4000-8000-000000000001';
  v_count integer;
BEGIN
  PERFORM set_config('request.jwt.claim.sub',v_user::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',v_user::text,'aal','aal1')::text,true);
  IF app_private.has_branch_permission('24000000-0000-4000-8000-000000000001','25000000-0000-4000-8000-000000000001','payments.record') THEN
    RAISE EXCEPTION 'Suspended tenant retained branch permissions';
  END IF;
  SELECT count(*) INTO v_count FROM public.payments WHERE tenant_id='24000000-0000-4000-8000-000000000001';
  IF v_count<>0 THEN RAISE EXCEPTION 'Suspended tenant payments remained visible'; END IF;
  SELECT count(*) INTO v_count FROM public.notifications WHERE tenant_id='24000000-0000-4000-8000-000000000001';
  IF v_count<>0 THEN RAISE EXCEPTION 'Suspended tenant notifications remained visible'; END IF;
  BEGIN
    PERFORM public.record_loan_payment_with_evidence('29000000-0000-4000-8000-000000000001',5,
      '2b000000-0000-4000-8000-000000000099','cash','SUSPENDED-TENANT',decode('524946463600000057454250565038202a0000003003009d012a280028003e6d369848a42322a1238800800d896900001b81bd3e0e0000fefb2180000000','hex'),true);
    RAISE EXCEPTION 'Suspended tenant unexpectedly accepted a payment';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL; END;
  BEGIN
    PERFORM public.tenant_report_summary('24000000-0000-4000-8000-000000000001',((now() AT TIME ZONE 'America/Santo_Domingo')::date),((now() AT TIME ZONE 'America/Santo_Domingo')::date)+30);
    RAISE EXCEPTION 'Suspended tenant unexpectedly exposed reports';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL; END;
  BEGIN
    PERFORM public.tenant_report_payment_details('24000000-0000-4000-8000-000000000001',((now() AT TIME ZONE 'America/Santo_Domingo')::date)-1,((now() AT TIME ZONE 'America/Santo_Domingo')::date)+31);
    RAISE EXCEPTION 'Suspended tenant unexpectedly exposed payment detail reports';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL; END;
END $$;
ROLLBACK;
