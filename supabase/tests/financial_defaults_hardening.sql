-- Covers the application RPC fallback when a tenant has no financing_settings row.
-- All fixtures roll back and use a disposable tenant inside the local test database.
BEGIN;

DO $$
DECLARE
  v_tenant uuid:=gen_random_uuid();
  v_user uuid:=gen_random_uuid();
  v_sales_user uuid:=gen_random_uuid();
  v_customer uuid:=gen_random_uuid();
  v_admin_branch uuid:=gen_random_uuid();
  v_other_branch uuid:=gen_random_uuid();
  v_application uuid;
  v_approved_loan uuid;
  v_initial_payment uuid;
  v_partial_payment uuid;
  v_final_payment uuid;
  v_new_customer_application uuid;
  v_quote jsonb;
  v_new_customer_quote jsonb;
  v_bad_quote jsonb;
  v_schedule jsonb:='[]'::jsonb;
  v_first date:=((now() AT TIME ZONE 'America/Santo_Domingo')::date)+1;
  v_due date;
  v_month_start date;
  v_last date;
  v_business_year text:=to_char((now() AT TIME ZONE 'America/Santo_Domingo')::date,'YYYY');
  v_sequence integer;
BEGIN
  INSERT INTO auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at,raw_app_meta_data,raw_user_meta_data)
  VALUES
    (v_user,'authenticated','authenticated',v_user::text||'@example.test','',now(),now(),now(),'{}','{}'),
    (v_sales_user,'authenticated','authenticated',v_sales_user::text||'@example.test','',now(),now(),now(),'{}','{}');
  INSERT INTO public.tenants(id,name) VALUES(v_tenant,'Disposable financing-default test');
  INSERT INTO public.branches(id,tenant_id,name,code,active) VALUES
    (v_admin_branch,v_tenant,'Sucursal asignada','DF-HOME',true),
    (v_other_branch,v_tenant,'Sucursal destino','DF-TARGET',true);
  INSERT INTO public.tenant_memberships(tenant_id,user_id,role,branch_id) VALUES
    (v_tenant,v_user,'tenant_admin',v_admin_branch),
    (v_tenant,v_sales_user,'sales',v_admin_branch);
  INSERT INTO public.customers(id,tenant_id,branch_id,full_name,identity_number)
  VALUES(v_customer,v_tenant,v_other_branch,'Cliente de prueba','DEFAULT-'||left(v_user::text,12));

  IF EXISTS (SELECT 1 FROM public.financing_settings WHERE tenant_id=v_tenant) THEN
    RAISE EXCEPTION 'Test tenant unexpectedly has financing settings';
  END IF;

  FOR v_sequence IN 1..5 LOOP
    v_month_start:=(date_trunc('month',v_first)::date+((v_sequence-1)*interval '1 month'))::date;
    v_last:=(v_month_start+interval '1 month - 1 day')::date;
    v_due:=v_month_start+(least(extract(day FROM v_first)::integer,extract(day FROM v_last)::integer)-1);
    v_schedule:=v_schedule||jsonb_build_array(jsonb_build_object(
      'sequence',v_sequence,'dueDate',to_char(v_due,'YYYY-MM-DD'),'amount','368.00',
      'principal','140.00','interest','28.00','legalExpenses','200.00','proposedAdjustment','0.00'));
  END LOOP;

  v_quote:=jsonb_build_object(
    'currency','DOP','salePrice','1000.00','deviceCost','1000.00','downPaymentPercent','30.00',
    'downPayment','300.00','principal','700.00','annualRatePercent','48.000','baseInterest','140.00',
    'legalExpenses','1000.00','termMonths',5,'frequency','monthly','installmentCount',5,
    'baseInstallment','368.00','recoveryInstallment','280.00','fixedInstallment','368.00',
    'proposedAdjustment','0.00','totalCustomerPays','2140.00','recoveryAtHalf','1036.00',
    'recoveryTarget','1000.00','recoveryTargetPercent','100.00','recoveryEnabled',false,
    'recoveryMet',true,'firstInstallmentDate',to_char(v_first,'YYYY-MM-DD'),
    'finalDueDate',to_char((v_schedule->4->>'dueDate')::date,'YYYY-MM-DD'),'schedule',v_schedule,
    'device',jsonb_build_object('brand','Test','model','Phone','imei','490154203237518'));
  v_new_customer_quote:=jsonb_set(v_quote,'{device,imei}','"356938035643809"'::jsonb);

  PERFORM set_config('request.jwt.claim.sub',v_user::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',v_user::text,'aal','aal1')::text,true);
  PERFORM set_config('TimeZone','Pacific/Kiritimati',true);
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='app_private' AND p.proname IN ('create_credit_application','review_credit_application')
      AND NOT EXISTS (
        SELECT 1 FROM unnest(coalesce(p.proconfig,ARRAY[]::text[])) AS cfg(setting)
        WHERE lower(cfg.setting)='timezone=america/santo_domingo'
      )
  ) OR (
    SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='app_private' AND p.proname IN ('create_credit_application','review_credit_application')
      AND EXISTS (
        SELECT 1 FROM unnest(coalesce(p.proconfig,ARRAY[]::text[])) AS cfg(setting)
        WHERE lower(cfg.setting)='timezone=america/santo_domingo'
      )
  )<>2 THEN
    RAISE EXCEPTION 'Financial RPCs do not pin the Santo Domingo business timezone';
  END IF;
  BEGIN
    PERFORM public.create_credit_application(v_tenant,v_customer,NULL,v_other_branch,'NaN'::numeric,v_quote,gen_random_uuid());
    RAISE EXCEPTION 'Non-finite requested amount unexpectedly succeeded';
  EXCEPTION WHEN SQLSTATE '22023' THEN
    IF SQLERRM<>'INVALID_QUOTE' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.create_credit_application(v_tenant,v_customer,NULL,v_other_branch,700,
      jsonb_set(v_quote,'{recoveryEnabled}','null'::jsonb),gen_random_uuid());
    RAISE EXCEPTION 'Null recovery flag unexpectedly succeeded';
  EXCEPTION WHEN SQLSTATE '22023' THEN
    IF SQLERRM<>'INVALID_QUOTE_JSON_SHAPE' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.create_credit_application(v_tenant,v_customer,NULL,v_other_branch,700,
      jsonb_set(v_quote,'{schedule}','{}'::jsonb),gen_random_uuid());
    RAISE EXCEPTION 'Non-array schedule unexpectedly succeeded';
  EXCEPTION WHEN SQLSTATE '22023' THEN
    IF SQLERRM<>'INVALID_QUOTE_JSON_SHAPE' THEN RAISE; END IF;
  END;

  FOR v_bad_quote IN
    SELECT bad_quote FROM (VALUES
      (jsonb_set(v_quote,'{salePrice}','1000'::jsonb)),
      (jsonb_set(v_quote,'{deviceCost}','null'::jsonb)),
      (jsonb_set(v_quote,'{downPaymentPercent}','null'::jsonb)),
      (jsonb_set(v_quote,'{schedule,0,sequence}','"1"'::jsonb)),
      (jsonb_set(v_quote,'{schedule,0,principal}','null'::jsonb)),
      (jsonb_set(v_quote,'{schedule,0,amount}','"369.00"'::jsonb)),
      (jsonb_set(v_quote,'{totalCustomerPays}','"2140.01"'::jsonb)),
      (jsonb_set(v_quote,'{frequency}','"weekly"'::jsonb)),
      (jsonb_set(v_quote,'{schedule,2,dueDate}',to_jsonb(to_char((v_schedule->2->>'dueDate')::date+1,'YYYY-MM-DD')))),
      (NULL::jsonb),
      ('[]'::jsonb)
    ) AS invalid_quotes(bad_quote)
  LOOP
    BEGIN
      PERFORM public.create_credit_application(v_tenant,v_customer,NULL,v_other_branch,700,v_bad_quote,gen_random_uuid());
      RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='Malformed or manipulated quote snapshot unexpectedly succeeded';
    EXCEPTION WHEN SQLSTATE '22023' THEN NULL;
    END;
  END LOOP;

  v_application:=public.create_credit_application(v_tenant,v_customer,NULL,v_other_branch,700,v_quote,gen_random_uuid());
  IF NOT EXISTS (SELECT 1 FROM public.credit_applications WHERE id=v_application AND status='pending'
      AND requested_amount=700 AND device_id IS NOT NULL AND branch_id=v_other_branch
      AND quote_snapshot->>'termMonths'='5' AND quote_snapshot->>'recoveryEnabled'='false'
      AND quote_snapshot->'device'->>'id'=device_id::text) THEN
    RAISE EXCEPTION 'Branch-assigned administrator could not create a five-month request in another branch';
  END IF;
  v_approved_loan:=public.review_credit_application(v_application,'approved',NULL,NULL,NULL,false);
  IF NOT EXISTS (
    SELECT 1 FROM public.credit_applications a
    JOIN public.loans l ON l.tenant_id=a.tenant_id AND l.id=v_approved_loan AND l.contract_id IS NOT NULL
    JOIN public.credit_contracts c ON c.tenant_id=l.tenant_id AND c.id=l.contract_id
    WHERE a.id=v_application AND a.status='approved' AND l.status='approved'
      AND l.branch_id=v_other_branch AND l.down_payment=300
      AND c.contract_number='KM-'||v_business_year||'-'||upper(substr(replace(v_application::text,'-',''),1,8))
      AND (SELECT count(*) FROM public.installments i WHERE i.tenant_id=l.tenant_id AND i.loan_id=l.id)=5
  ) THEN
    RAISE EXCEPTION 'Approval did not create the expected contract, loan, and five-installment schedule';
  END IF;
  v_initial_payment:=public.activate_approved_loan_with_evidence(
    v_approved_loan,'cash','INITIAL-EVIDENCE',gen_random_uuid(),'test/private-contract.pdf',true,
    (now() AT TIME ZONE 'America/Santo_Domingo')::date
  ,decode('524946463600000057454250565038202a0000003003009d012a280028003e6d369848a42322a1238800800d896900001b81bd3e0e0000fefb2180000000','hex'),true);
  IF NOT EXISTS (
    SELECT 1 FROM public.loans l
    JOIN public.credit_contracts c ON c.tenant_id=l.tenant_id AND c.id=l.contract_id
    JOIN public.payments p ON p.tenant_id=l.tenant_id AND p.loan_id=l.id
    WHERE l.id=v_approved_loan AND l.status='active' AND l.activated_by=v_user
      AND l.delivered_by=v_user AND l.delivered_at=(now() AT TIME ZONE 'America/Santo_Domingo')::date
      AND c.signed_by=v_user AND c.document_path='test/private-contract.pdf'
      AND c.contract_evidence_attested AND c.contract_evidence_attested_by=v_user AND c.contract_evidence_attested_at IS NOT NULL
      AND p.id=v_initial_payment AND p.amount=300 AND p.payment_type='down_payment'
      AND EXISTS (SELECT 1 FROM public.ledger_entries e WHERE e.tenant_id=l.tenant_id
        AND e.payment_id=p.id AND e.entry_type='payment_received' AND e.amount=300)
      AND EXISTS (SELECT 1 FROM public.audit_logs al WHERE al.tenant_id=l.tenant_id
        AND al.entity_id=l.id AND al.action='loan.activated' AND al.actor_id=v_user)
      AND EXISTS (SELECT 1 FROM public.audit_logs al WHERE al.tenant_id=l.tenant_id
        AND al.entity_id=p.id AND al.action='payment.recorded' AND al.actor_id=v_user)
      AND EXISTS (SELECT 1 FROM public.credit_application_events e WHERE e.tenant_id=l.tenant_id
        AND e.application_id=v_application AND e.actor_id=v_user AND e.to_status='approved')
  ) THEN
    RAISE EXCEPTION 'Approval/activation did not record payment, ledger, audit, contract signature, and delivery';
  END IF;
  v_partial_payment:=public.record_loan_payment_with_evidence(v_approved_loan,5,gen_random_uuid(),'bank_transfer','COLLECTION-PARTIAL',decode('524946463600000057454250565038202a0000003003009d012a280028003e6d369848a42322a1238800800d896900001b81bd3e0e0000fefb2180000000','hex'),true);
  IF NOT EXISTS (SELECT 1 FROM public.installments i JOIN public.loans l ON l.tenant_id=i.tenant_id AND l.id=i.loan_id
    WHERE l.id=v_approved_loan AND l.status='active' AND i.sequence=1 AND i.amount_paid=5 AND i.status='partial')
    OR NOT EXISTS (SELECT 1 FROM public.ledger_entries e WHERE e.payment_id=v_partial_payment AND e.entry_type='payment_received' AND e.amount=5)
    OR NOT EXISTS (SELECT 1 FROM public.audit_logs al WHERE al.entity_id=v_partial_payment AND al.action='payment.recorded' AND al.actor_id=v_user) THEN
    RAISE EXCEPTION 'An activated loan did not accept and audit a partial installment payment';
  END IF;
  v_final_payment:=public.record_loan_payment_with_evidence(v_approved_loan,1835,gen_random_uuid(),'cash','COLLECTION-FINAL',decode('524946463600000057454250565038202a0000003003009d012a280028003e6d369848a42322a1238800800d896900001b81bd3e0e0000fefb2180000000','hex'),true);
  IF NOT EXISTS (SELECT 1 FROM public.loans l WHERE l.id=v_approved_loan AND l.status='paid_off')
    OR (SELECT count(*) FROM public.installments i WHERE i.loan_id=v_approved_loan AND i.status='paid' AND i.amount_paid=i.amount_due)<>5
    OR NOT EXISTS (SELECT 1 FROM public.ledger_entries e WHERE e.payment_id=v_final_payment AND e.entry_type='payment_received' AND e.amount=1835)
    OR NOT EXISTS (SELECT 1 FROM public.audit_logs al WHERE al.entity_id=v_final_payment AND al.action='payment.recorded' AND al.actor_id=v_user) THEN
    RAISE EXCEPTION 'The final payment did not close the paid loan with five paid installments and audited ledger';
  END IF;
  v_new_customer_application:=public.create_customer_and_credit_application(
    v_tenant,v_other_branch,'Nuevo cliente','DEFAULT-NEW-'||left(v_user::text,12),NULL,NULL,NULL,700,v_new_customer_quote,gen_random_uuid());
  IF NOT EXISTS (SELECT 1 FROM public.credit_applications a JOIN public.customers c
      ON c.tenant_id=a.tenant_id AND c.id=a.customer_id
      WHERE a.id=v_new_customer_application AND a.branch_id=v_other_branch AND c.branch_id=v_other_branch) THEN
    RAISE EXCEPTION 'Branch-assigned administrator could not create a customer and request in another branch';
  END IF;

  PERFORM set_config('request.jwt.claim.sub',v_sales_user::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',v_sales_user::text,'aal','aal1')::text,true);
  BEGIN
    PERFORM public.create_credit_application(v_tenant,v_customer,NULL,v_other_branch,700,v_quote,gen_random_uuid());
    RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='Branch-scoped sales user unexpectedly created a request in another branch';
  EXCEPTION WHEN SQLSTATE '42501' THEN
    IF SQLERRM<>'INVALID_BRANCH_SCOPE' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.create_customer_and_credit_application(
      v_tenant,v_other_branch,'Venta fuera de sucursal','DEFAULT-SALES-'||left(v_sales_user::text,12),NULL,NULL,NULL,700,v_quote,gen_random_uuid());
    RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='Branch-scoped sales user unexpectedly created a customer and request in another branch';
  EXCEPTION WHEN SQLSTATE '42501' THEN
    IF SQLERRM<>'INVALID_BRANCH_SCOPE' THEN RAISE; END IF;
  END;
  -- Sales must be able to originate in their own branch, including the history event.
  v_new_customer_quote:=jsonb_set(v_quote,'{device,imei}','"352099001761481"'::jsonb);
  v_new_customer_application:=public.create_customer_and_credit_application(
    v_tenant,v_admin_branch,'Cliente del vendedor','DEFAULT-OWN-'||left(v_sales_user::text,12),NULL,NULL,NULL,700,v_new_customer_quote,gen_random_uuid());
  IF NOT EXISTS (SELECT 1 FROM public.credit_application_events e
      JOIN public.credit_applications a ON a.tenant_id=e.tenant_id AND a.id=e.application_id
      WHERE a.id=v_new_customer_application AND a.created_by=v_sales_user AND a.status='pending'
        AND e.branch_id=v_admin_branch AND e.actor_id=v_sales_user AND e.event_type='application_created') THEN
    RAISE EXCEPTION 'Seller origination did not create the branch-scoped history event';
  END IF;
  BEGIN
    PERFORM public.review_credit_application(v_new_customer_application,'approved',NULL,NULL,NULL,false);
    RAISE EXCEPTION 'Sales unexpectedly approved their own request';
  EXCEPTION WHEN SQLSTATE '42501' THEN
    IF SQLERRM<>'FORBIDDEN' THEN RAISE; END IF;
  END;
END $$;

ROLLBACK;
