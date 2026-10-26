-- Branch-level RLS test with disposable same-tenant branches and users.
BEGIN;

INSERT INTO auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at,raw_app_meta_data,raw_user_meta_data)
VALUES
 ('12000000-0000-4000-8000-000000000001','authenticated','authenticated','branch-a@example.test','',now(),now(),now(),'{}','{}'),
 ('12000000-0000-4000-8000-000000000002','authenticated','authenticated','branch-b@example.test','',now(),now(),now(),'{}','{}'),
 ('12000000-0000-4000-8000-000000000003','authenticated','authenticated','central-admin@example.test','',now(),now(),now(),'{}','{}'),
 ('12000000-0000-4000-8000-000000000004','authenticated','authenticated','branch-admin@example.test','',now(),now(),now(),'{}','{}'),
 ('12000000-0000-4000-8000-000000000005','authenticated','authenticated','branch-cashier@example.test','',now(),now(),now(),'{}','{}'),
 ('12000000-0000-4000-8000-000000000006','authenticated','authenticated','branch-collections@example.test','',now(),now(),now(),'{}','{}'),
 ('12000000-0000-4000-8000-000000000007','authenticated','authenticated','branch-auditor@example.test','',now(),now(),now(),'{}','{}');
INSERT INTO public.tenants(id,name) VALUES('22000000-0000-4000-8000-000000000001','Branch test tenant');
INSERT INTO public.branches(id,tenant_id,name,code,active) VALUES
 ('23000000-0000-4000-8000-000000000001','22000000-0000-4000-8000-000000000001','Sucursal A','BR-A',true),
 ('23000000-0000-4000-8000-000000000002','22000000-0000-4000-8000-000000000001','Sucursal B','BR-B',true);
INSERT INTO public.tenant_memberships(id,tenant_id,user_id,role,branch_id) VALUES
 ('28000000-0000-4000-8000-000000000001','22000000-0000-4000-8000-000000000001','12000000-0000-4000-8000-000000000001','branch_manager','23000000-0000-4000-8000-000000000001'),
 ('28000000-0000-4000-8000-000000000002','22000000-0000-4000-8000-000000000001','12000000-0000-4000-8000-000000000002','sales','23000000-0000-4000-8000-000000000002'),
 ('28000000-0000-4000-8000-000000000003','22000000-0000-4000-8000-000000000001','12000000-0000-4000-8000-000000000003','tenant_admin',NULL),
 ('28000000-0000-4000-8000-000000000004','22000000-0000-4000-8000-000000000001','12000000-0000-4000-8000-000000000004','tenant_admin','23000000-0000-4000-8000-000000000001'),
 ('28000000-0000-4000-8000-000000000005','22000000-0000-4000-8000-000000000001','12000000-0000-4000-8000-000000000005','cashier','23000000-0000-4000-8000-000000000001'),
 ('28000000-0000-4000-8000-000000000006','22000000-0000-4000-8000-000000000001','12000000-0000-4000-8000-000000000006','collections','23000000-0000-4000-8000-000000000001'),
 ('28000000-0000-4000-8000-000000000007','22000000-0000-4000-8000-000000000001','12000000-0000-4000-8000-000000000007','auditor','23000000-0000-4000-8000-000000000001');
INSERT INTO public.customers(id,tenant_id,branch_id,full_name) VALUES
 ('24000000-0000-4000-8000-000000000001','22000000-0000-4000-8000-000000000001','23000000-0000-4000-8000-000000000001','Cliente sucursal A'),
 ('24000000-0000-4000-8000-000000000002','22000000-0000-4000-8000-000000000001','23000000-0000-4000-8000-000000000002','Cliente sucursal B');
UPDATE public.customers SET identity_number='TEST-100001' WHERE id='24000000-0000-4000-8000-000000000001';
UPDATE public.customers SET identity_number='TEST-200002' WHERE id='24000000-0000-4000-8000-000000000002';
INSERT INTO public.devices(id,tenant_id,branch_id,imei,brand,model) VALUES
 ('25000000-0000-4000-8000-000000000011','22000000-0000-4000-8000-000000000001','23000000-0000-4000-8000-000000000001','490154203237518','Test','Branch A'),
 ('25000000-0000-4000-8000-000000000012','22000000-0000-4000-8000-000000000001','23000000-0000-4000-8000-000000000002','123456789012347','Test','Branch B');
INSERT INTO public.credit_contracts(id,tenant_id,customer_id,contract_number,terms) VALUES
 ('25000000-0000-4000-8000-000000000021','22000000-0000-4000-8000-000000000001','24000000-0000-4000-8000-000000000001','BR-LOAN-A','{}'),
 ('25000000-0000-4000-8000-000000000022','22000000-0000-4000-8000-000000000001','24000000-0000-4000-8000-000000000002','BR-LOAN-B','{}');
INSERT INTO public.loans(id,tenant_id,branch_id,customer_id,contract_id,device_id,status,sale_price,down_payment,principal,interest_rate,installment_count,calculation_strategy) VALUES
 ('25000000-0000-4000-8000-000000000031','22000000-0000-4000-8000-000000000001','23000000-0000-4000-8000-000000000001','24000000-0000-4000-8000-000000000001','25000000-0000-4000-8000-000000000021','25000000-0000-4000-8000-000000000011','active',20,0,20,0,1,'branch-test'),
 ('25000000-0000-4000-8000-000000000032','22000000-0000-4000-8000-000000000001','23000000-0000-4000-8000-000000000002','24000000-0000-4000-8000-000000000002','25000000-0000-4000-8000-000000000022','25000000-0000-4000-8000-000000000012','active',20,0,20,0,1,'branch-test');
INSERT INTO public.installments(id,tenant_id,loan_id,sequence,due_date,amount_due) VALUES
 ('25000000-0000-4000-8000-000000000041','22000000-0000-4000-8000-000000000001','25000000-0000-4000-8000-000000000031',1,((now() AT TIME ZONE 'America/Santo_Domingo')::date)+2,20),
 ('25000000-0000-4000-8000-000000000042','22000000-0000-4000-8000-000000000001','25000000-0000-4000-8000-000000000032',1,((now() AT TIME ZONE 'America/Santo_Domingo')::date)+2,20);
INSERT INTO public.audit_logs(tenant_id,branch_id,actor_id,action,entity_type,entity_id,metadata) VALUES
 ('22000000-0000-4000-8000-000000000001','23000000-0000-4000-8000-000000000001','12000000-0000-4000-8000-000000000001','fixture.branch_a','customer','24000000-0000-4000-8000-000000000001','{}'),
 ('22000000-0000-4000-8000-000000000001','23000000-0000-4000-8000-000000000002','12000000-0000-4000-8000-000000000002','fixture.branch_b','customer','24000000-0000-4000-8000-000000000002','{}');
-- Seed an existing request as the database owner; application inserts from the API must use the RPC trigger.
ALTER TABLE public.credit_applications DISABLE TRIGGER credit_applications_attach_device_before_insert;
ALTER TABLE public.credit_applications DISABLE TRIGGER credit_applications_quote_snapshot_validate;
INSERT INTO public.credit_applications(id,tenant_id,customer_id,device_id,branch_id,requested_amount,status,quote_snapshot,submission_key,created_by)
VALUES
 ('2d000000-0000-4000-8000-000000000001','22000000-0000-4000-8000-000000000001',
  '24000000-0000-4000-8000-000000000002','25000000-0000-4000-8000-000000000012','23000000-0000-4000-8000-000000000002',20,'pending','{}',
  '2e000000-0000-4000-8000-000000000001','12000000-0000-4000-8000-000000000002'),
 ('2d000000-0000-4000-8000-000000000002','22000000-0000-4000-8000-000000000001',
  '24000000-0000-4000-8000-000000000001','25000000-0000-4000-8000-000000000011','23000000-0000-4000-8000-000000000001',20,'pending','{}',
  '2e000000-0000-4000-8000-000000000002','12000000-0000-4000-8000-000000000001');
ALTER TABLE public.credit_applications ENABLE TRIGGER credit_applications_attach_device_before_insert;
ALTER TABLE public.credit_applications ENABLE TRIGGER credit_applications_quote_snapshot_validate;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '12000000-0000-4000-8000-000000000001';
DO $$
DECLARE v_count integer; v_dashboard jsonb; v_report jsonb; v_payment_report jsonb; v_reconciliation jsonb; v_collections jsonb; v_installment_page jsonb; v_membership_a uuid; v_role text;
BEGIN
  SELECT count(*) INTO v_count FROM public.tenant_memberships WHERE tenant_id='22000000-0000-4000-8000-000000000001';
  IF v_count<>1 THEN RAISE EXCEPTION 'Branch manager saw memberships outside its own account: %',v_count; END IF;
  SELECT count(*) INTO v_count FROM public.customers WHERE tenant_id='22000000-0000-4000-8000-000000000001';
  IF v_count<>1 OR NOT EXISTS(SELECT 1 FROM public.customers WHERE id='24000000-0000-4000-8000-000000000001') THEN
    RAISE EXCEPTION 'Branch read isolation failed for assigned user';
  END IF;
  SELECT count(*) INTO v_count FROM public.devices WHERE tenant_id='22000000-0000-4000-8000-000000000001';
  IF v_count<>1 OR NOT EXISTS(SELECT 1 FROM public.devices WHERE id='25000000-0000-4000-8000-000000000011') THEN
    RAISE EXCEPTION 'Branch device read isolation failed';
  END IF;
  SELECT count(*) INTO v_count FROM public.credit_contracts WHERE tenant_id='22000000-0000-4000-8000-000000000001';
  IF v_count<>1 OR NOT EXISTS(SELECT 1 FROM public.credit_contracts WHERE id='25000000-0000-4000-8000-000000000021') THEN
    RAISE EXCEPTION 'Branch contract read isolation failed';
  END IF;
  SELECT count(*) INTO v_count FROM public.loans WHERE tenant_id='22000000-0000-4000-8000-000000000001';
  IF v_count<>1 OR NOT EXISTS(SELECT 1 FROM public.loans WHERE id='25000000-0000-4000-8000-000000000031') THEN
    RAISE EXCEPTION 'Branch loan read isolation failed';
  END IF;
  SELECT count(*) INTO v_count FROM public.credit_applications WHERE tenant_id='22000000-0000-4000-8000-000000000001';
  IF v_count<>1 OR NOT EXISTS(SELECT 1 FROM public.credit_applications WHERE id='2d000000-0000-4000-8000-000000000002') THEN
    RAISE EXCEPTION 'Branch application read isolation failed';
  END IF;
  IF app_private.has_branch_permission('22000000-0000-4000-8000-000000000001','23000000-0000-4000-8000-000000000002','customers.read') THEN
    RAISE EXCEPTION 'Branch manager permission leaked to another branch';
  END IF;
  SELECT count(*) INTO v_count FROM public.lookup_customer_by_identity('22000000-0000-4000-8000-000000000001','TEST-200002');
  IF v_count<>0 THEN RAISE EXCEPTION 'Identity lookup leaked another branch customer'; END IF;
  BEGIN
    PERFORM public.review_credit_application('2d000000-0000-4000-8000-000000000001','rejected','Fuera de sucursal',NULL,NULL,false);
    RAISE EXCEPTION 'Branch manager reviewed an application from another branch';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL; END;
  SELECT count(*) INTO v_count FROM public.lookup_customer_by_identity('22000000-0000-4000-8000-000000000001','TEST-100001');
  IF v_count<>1 THEN RAISE EXCEPTION 'Identity lookup did not find same-branch customer'; END IF;
  SELECT count(*) INTO v_count FROM public.installments WHERE tenant_id='22000000-0000-4000-8000-000000000001';
  IF v_count<>1 OR NOT EXISTS(SELECT 1 FROM public.installments WHERE id='25000000-0000-4000-8000-000000000041')
    OR EXISTS(SELECT 1 FROM public.installments WHERE id='25000000-0000-4000-8000-000000000042') THEN
    RAISE EXCEPTION 'Branch-assigned user saw another branch installment/alert';
  END IF;
  PERFORM public.record_loan_payment_with_evidence('25000000-0000-4000-8000-000000000031',1,'26000000-0000-4000-8000-000000000001','cash',NULL,decode('524946463600000057454250565038202a0000003003009d012a280028003e6d369848a42322a1238800800d896900001b81bd3e0e0000fefb2180000000','hex'),true);
  BEGIN
    PERFORM public.record_loan_payment_with_evidence('25000000-0000-4000-8000-000000000032',1,'26000000-0000-4000-8000-000000000002','cash',NULL,decode('524946463600000057454250565038202a0000003003009d012a280028003e6d369848a42322a1238800800d896900001b81bd3e0e0000fefb2180000000','hex'),true);
    RAISE EXCEPTION 'Branch manager recorded a payment for another branch';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL; END;
  v_collections:=public.tenant_collections_summary('22000000-0000-4000-8000-000000000001');
  v_installment_page:=public.tenant_open_installment_page('22000000-0000-4000-8000-000000000001',1,50);
  IF (v_collections->>'openInstallments')::integer<>1 OR (v_collections->>'openBalance')::numeric<>19
    OR (v_installment_page->>'count')::integer<>1 OR jsonb_array_length(v_installment_page->'rows')<>1
    OR v_installment_page->'rows'->0->>'loanId'<>'25000000-0000-4000-8000-000000000031'
    OR (v_installment_page->'rows'->0->>'loanBalance')::numeric<>19 THEN
    RAISE EXCEPTION 'Collections summary/page escaped assigned branch RLS: %, %',v_collections,v_installment_page;
  END IF;
  v_dashboard:=public.tenant_dashboard_summary('22000000-0000-4000-8000-000000000001',((now() AT TIME ZONE 'America/Santo_Domingo')::date)-30,((now() AT TIME ZONE 'America/Santo_Domingo')::date));
  IF (v_dashboard->>'customers')::integer<>1 OR (v_dashboard->>'devices')::integer<>1
    OR (v_dashboard->>'activeLoans')::integer<>1 OR (v_dashboard->>'activeBalance')::numeric<>19
    OR (v_dashboard->>'allTimePaymentsReceived')::numeric<>1 OR jsonb_array_length(v_dashboard->'upcoming')<>1 THEN
    RAISE EXCEPTION 'Dashboard summary escaped assigned branch RLS: %',v_dashboard;
  END IF;
  v_report:=public.tenant_report_summary('22000000-0000-4000-8000-000000000001',((now() AT TIME ZONE 'America/Santo_Domingo')::date)-7,((now() AT TIME ZONE 'America/Santo_Domingo')::date));
  IF (v_report->>'customers')::integer<>1 THEN RAISE EXCEPTION 'Branch manager report escaped branch scope: %',v_report; END IF;
  v_payment_report:=public.tenant_report_payment_details('22000000-0000-4000-8000-000000000001',((now() AT TIME ZONE 'America/Santo_Domingo')::date)-1,((now() AT TIME ZONE 'America/Santo_Domingo')::date)+1);
  IF jsonb_array_length(v_payment_report)<>1 OR v_payment_report->0->>'loanId'<>'25000000-0000-4000-8000-000000000031'
    OR v_payment_report->0->>'branchId'<>'23000000-0000-4000-8000-000000000001'
    OR v_payment_report->0->'allocations'->0->>'amount'<>'1.00' THEN
    RAISE EXCEPTION 'Branch manager payment export escaped scope or omitted its allocation: %',v_payment_report;
  END IF;
  v_reconciliation:=public.tenant_payment_reconciliation('22000000-0000-4000-8000-000000000001',((now() AT TIME ZONE 'America/Santo_Domingo')::date)-1,((now() AT TIME ZONE 'America/Santo_Domingo')::date)+1);
  IF (v_reconciliation->>'paymentCount')::integer<>1 OR (v_reconciliation->>'expectedLedgerNet')::numeric<>1
    OR (v_reconciliation->>'ledgerDifference')::numeric<>0 THEN
    RAISE EXCEPTION 'Branch reconciliation escaped RLS scope or misreported the visible payment: %',v_reconciliation;
  END IF;
  PERFORM set_config('request.jwt.claim.sub','12000000-0000-4000-8000-000000000002',true);
  PERFORM set_config('request.jwt.claims','{"sub":"12000000-0000-4000-8000-000000000002","aal":"aal1"}',true);
  SELECT count(*) INTO v_count FROM public.installments WHERE tenant_id='22000000-0000-4000-8000-000000000001';
  IF v_count<>1 OR NOT EXISTS(SELECT 1 FROM public.installments WHERE id='25000000-0000-4000-8000-000000000042')
    OR EXISTS(SELECT 1 FROM public.installments WHERE id='25000000-0000-4000-8000-000000000041') THEN
    RAISE EXCEPTION 'Second branch user saw another branch installment/alert';
  END IF;
  BEGIN
    PERFORM public.tenant_dashboard_summary('22000000-0000-4000-8000-000000000001',((now() AT TIME ZONE 'America/Santo_Domingo')::date)-7,((now() AT TIME ZONE 'America/Santo_Domingo')::date));
    RAISE EXCEPTION 'Sales role unexpectedly read the dashboard aggregate';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL; END;
  BEGIN
    PERFORM public.tenant_report_payment_details('22000000-0000-4000-8000-000000000001',((now() AT TIME ZONE 'America/Santo_Domingo')::date)-1,((now() AT TIME ZONE 'America/Santo_Domingo')::date)+1);
    RAISE EXCEPTION 'Sales role unexpectedly read the payment detail export';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL; END;
  BEGIN
    PERFORM public.tenant_payment_reconciliation('22000000-0000-4000-8000-000000000001',((now() AT TIME ZONE 'America/Santo_Domingo')::date)-1,((now() AT TIME ZONE 'America/Santo_Domingo')::date)+1);
    RAISE EXCEPTION 'Sales role unexpectedly read payment reconciliation';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL; END;
  FOR v_membership_a IN SELECT id FROM public.tenant_memberships
    WHERE tenant_id='22000000-0000-4000-8000-000000000001' AND role IN ('cashier','collections','auditor')
    ORDER BY role
  LOOP
    PERFORM set_config('request.jwt.claim.sub',(
      SELECT user_id::text FROM public.tenant_memberships WHERE id=v_membership_a
    ),true);
    PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',(
      SELECT user_id::text FROM public.tenant_memberships WHERE id=v_membership_a
    ),'aal','aal1')::text,true);
    SELECT role INTO STRICT v_role FROM public.tenant_memberships WHERE id=v_membership_a;
    IF (SELECT count(*) FROM public.customers WHERE tenant_id='22000000-0000-4000-8000-000000000001')<>1
      OR NOT EXISTS(SELECT 1 FROM public.customers WHERE id='24000000-0000-4000-8000-000000000001')
      OR EXISTS(SELECT 1 FROM public.customers WHERE id='24000000-0000-4000-8000-000000000002')
      OR (SELECT count(*) FROM public.credit_applications WHERE tenant_id='22000000-0000-4000-8000-000000000001')<>1
      OR EXISTS(SELECT 1 FROM public.credit_applications WHERE id='2d000000-0000-4000-8000-000000000001')
      OR (SELECT count(*) FROM public.loans WHERE tenant_id='22000000-0000-4000-8000-000000000001')<>1
      OR EXISTS(SELECT 1 FROM public.loans WHERE id='25000000-0000-4000-8000-000000000032')
      OR (SELECT count(*) FROM public.installments WHERE tenant_id='22000000-0000-4000-8000-000000000001')<>1
      OR EXISTS(SELECT 1 FROM public.installments WHERE id='25000000-0000-4000-8000-000000000042')
      OR (SELECT count(*) FROM public.payments WHERE tenant_id='22000000-0000-4000-8000-000000000001')<>1
      OR (SELECT count(*) FROM public.payment_allocations WHERE tenant_id='22000000-0000-4000-8000-000000000001')<>1
      OR (SELECT count(*) FROM public.ledger_entries WHERE tenant_id='22000000-0000-4000-8000-000000000001')<>1 THEN
      RAISE EXCEPTION 'Role % read data outside its assigned branch',v_role;
    END IF;
    IF app_private.has_branch_permission('22000000-0000-4000-8000-000000000001','23000000-0000-4000-8000-000000000002','customers.read')
      OR app_private.has_branch_permission('22000000-0000-4000-8000-000000000001','23000000-0000-4000-8000-000000000002','payments.read') THEN
      RAISE EXCEPTION 'Role % retained permission in another branch',v_role;
    END IF;
    SELECT count(*) INTO v_count FROM public.devices WHERE tenant_id='22000000-0000-4000-8000-000000000001';
    IF v_count<>(CASE WHEN v_role='auditor' THEN 1 ELSE 0 END) THEN
      RAISE EXCEPTION 'Role % has incorrect branch device visibility: %',v_role,v_count;
    END IF;
    SELECT count(*) INTO v_count FROM public.audit_logs WHERE tenant_id='22000000-0000-4000-8000-000000000001'
      AND action LIKE 'fixture.%';
    IF v_count<>(CASE WHEN v_role='auditor' THEN 1 ELSE 0 END)
      OR EXISTS(SELECT 1 FROM public.audit_logs WHERE action='fixture.branch_b') THEN
      RAISE EXCEPTION 'Role % has incorrect branch audit visibility: %',v_role,v_count;
    END IF;
    IF v_role IN ('collections','auditor') THEN
      PERFORM public.tenant_report_summary('22000000-0000-4000-8000-000000000001',((now() AT TIME ZONE 'America/Santo_Domingo')::date)-1,((now() AT TIME ZONE 'America/Santo_Domingo')::date)+1);
      PERFORM public.tenant_report_payment_details('22000000-0000-4000-8000-000000000001',((now() AT TIME ZONE 'America/Santo_Domingo')::date)-1,((now() AT TIME ZONE 'America/Santo_Domingo')::date)+1);
      PERFORM public.tenant_payment_reconciliation('22000000-0000-4000-8000-000000000001',((now() AT TIME ZONE 'America/Santo_Domingo')::date)-1,((now() AT TIME ZONE 'America/Santo_Domingo')::date)+1);
    ELSE
      BEGIN
        PERFORM public.tenant_report_summary('22000000-0000-4000-8000-000000000001',((now() AT TIME ZONE 'America/Santo_Domingo')::date)-1,((now() AT TIME ZONE 'America/Santo_Domingo')::date)+1);
        RAISE EXCEPTION 'Cashier unexpectedly read the report summary';
      EXCEPTION WHEN SQLSTATE '42501' THEN NULL; END;
      BEGIN
        PERFORM public.tenant_report_payment_details('22000000-0000-4000-8000-000000000001',((now() AT TIME ZONE 'America/Santo_Domingo')::date)-1,((now() AT TIME ZONE 'America/Santo_Domingo')::date)+1);
        RAISE EXCEPTION 'Cashier unexpectedly read the payment detail report';
      EXCEPTION WHEN SQLSTATE '42501' THEN NULL; END;
      BEGIN
        PERFORM public.tenant_payment_reconciliation('22000000-0000-4000-8000-000000000001',((now() AT TIME ZONE 'America/Santo_Domingo')::date)-1,((now() AT TIME ZONE 'America/Santo_Domingo')::date)+1);
        RAISE EXCEPTION 'Cashier unexpectedly read payment reconciliation';
      EXCEPTION WHEN SQLSTATE '42501' THEN NULL; END;
    END IF;
  END LOOP;
  PERFORM set_config('request.jwt.claim.sub','12000000-0000-4000-8000-000000000001',true);
  PERFORM set_config('request.jwt.claims','{"sub":"12000000-0000-4000-8000-000000000001","aal":"aal1"}',true);
  UPDATE public.customers SET full_name='Unauthorized cross-branch update' WHERE id='24000000-0000-4000-8000-000000000002';
  GET DIAGNOSTICS v_count=ROW_COUNT;
  IF v_count<>0 THEN RAISE EXCEPTION 'Cross-branch update was allowed'; END IF;
  BEGIN
    INSERT INTO public.customers(tenant_id,branch_id,full_name)
      VALUES('22000000-0000-4000-8000-000000000001','23000000-0000-4000-8000-000000000002','Unauthorized cross-branch insert');
    RAISE EXCEPTION 'Cross-branch insert was allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  INSERT INTO public.customers(tenant_id,branch_id,full_name)
    VALUES('22000000-0000-4000-8000-000000000001','23000000-0000-4000-8000-000000000001','Allowed same-branch insert');
  BEGIN
    INSERT INTO public.branches(tenant_id,name,code) VALUES('22000000-0000-4000-8000-000000000001','Forged branch','BR-F');
    RAISE EXCEPTION 'Direct branch insert unexpectedly succeeded';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  PERFORM set_config('request.jwt.claim.sub','12000000-0000-4000-8000-000000000002',true);
  PERFORM set_config('request.jwt.claims','{"sub":"12000000-0000-4000-8000-000000000002","aal":"aal1"}',true);
  BEGIN
    PERFORM public.create_tenant_branch('22000000-0000-4000-8000-000000000001','Unauthorized branch','BR-X');
    RAISE EXCEPTION 'Branch-scoped user unexpectedly created a branch';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL; END;
  PERFORM set_config('request.jwt.claim.sub','12000000-0000-4000-8000-000000000004',true);
  PERFORM set_config('request.jwt.claims','{"sub":"12000000-0000-4000-8000-000000000004","aal":"aal1"}',true);
  PERFORM public.create_tenant_branch('22000000-0000-4000-8000-000000000001','Sucursal Central','BR-C');
  IF NOT EXISTS(SELECT 1 FROM public.branches WHERE tenant_id='22000000-0000-4000-8000-000000000001' AND code='BR-C' AND active)
    OR NOT EXISTS(SELECT 1 FROM public.audit_logs WHERE action='branch.created' AND metadata->>'code'='BR-C') THEN
    RAISE EXCEPTION 'Branch-assigned tenant administrator could not create/audit a branch';
  END IF;
  PERFORM set_config('request.jwt.claim.sub','12000000-0000-4000-8000-000000000004',true);
  PERFORM set_config('request.jwt.claims','{"sub":"12000000-0000-4000-8000-000000000004","aal":"aal1"}',true);
  SELECT id INTO v_membership_a FROM public.tenant_memberships
    WHERE tenant_id='22000000-0000-4000-8000-000000000001' AND user_id='12000000-0000-4000-8000-000000000001';
  SELECT count(*) INTO v_count FROM public.tenant_memberships WHERE tenant_id='22000000-0000-4000-8000-000000000001';
  IF v_count<>7 THEN RAISE EXCEPTION 'Tenant administrator could not read memberships across branches: %',v_count; END IF;
  SELECT count(*) INTO v_count FROM public.customers WHERE tenant_id='22000000-0000-4000-8000-000000000001';
  IF v_count<>3 OR NOT EXISTS(SELECT 1 FROM public.customers WHERE id='24000000-0000-4000-8000-000000000002')
    OR NOT app_private.has_branch_permission('22000000-0000-4000-8000-000000000001','23000000-0000-4000-8000-000000000002','customers.read') THEN
    RAISE EXCEPTION 'Tenant administrator could not read customer records across branches';
  END IF;
  IF NOT app_private.has_branch_permission('22000000-0000-4000-8000-000000000001','23000000-0000-4000-8000-000000000002','customers.write')
    OR NOT app_private.has_branch_permission('22000000-0000-4000-8000-000000000001','23000000-0000-4000-8000-000000000002','payments.record') THEN
    RAISE EXCEPTION 'Branch-assigned administrator could not receive tenant-wide operational write scope';
  END IF;
  PERFORM public.review_credit_application('2d000000-0000-4000-8000-000000000001','rejected','Prueba Administrador entre sucursales',NULL,NULL,false);
  IF NOT EXISTS(SELECT 1 FROM public.credit_applications WHERE id='2d000000-0000-4000-8000-000000000001' AND status='rejected')
    OR NOT EXISTS(SELECT 1 FROM public.credit_application_events WHERE application_id='2d000000-0000-4000-8000-000000000001'
      AND actor_id='12000000-0000-4000-8000-000000000004' AND from_status='pending' AND to_status='rejected') THEN
    RAISE EXCEPTION 'Branch-assigned tenant administrator could not review/audit an application in another branch';
  END IF;
  PERFORM set_config('request.jwt.claim.sub','12000000-0000-4000-8000-000000000001',true);
  PERFORM set_config('request.jwt.claims','{"sub":"12000000-0000-4000-8000-000000000001","aal":"aal1"}',true);
  IF EXISTS(SELECT 1 FROM public.credit_application_events WHERE application_id='2d000000-0000-4000-8000-000000000001') THEN
    RAISE EXCEPTION 'Branch manager read a review event from another branch';
  END IF;
  PERFORM set_config('request.jwt.claim.sub','12000000-0000-4000-8000-000000000004',true);
  PERFORM set_config('request.jwt.claims','{"sub":"12000000-0000-4000-8000-000000000004","aal":"aal1"}',true);
  UPDATE public.customers SET full_name='Authorized administrator cross-branch update'
    WHERE id='24000000-0000-4000-8000-000000000002';
  GET DIAGNOSTICS v_count=ROW_COUNT;
  IF v_count<>1 OR NOT EXISTS(SELECT 1 FROM public.customers WHERE id='24000000-0000-4000-8000-000000000002' AND full_name='Authorized administrator cross-branch update') THEN
    RAISE EXCEPTION 'Branch-assigned administrator could not update an operational record in another branch';
  END IF;
  INSERT INTO public.customers(tenant_id,branch_id,full_name)
    VALUES('22000000-0000-4000-8000-000000000001','23000000-0000-4000-8000-000000000002','Authorized administrator cross-branch insert');
  PERFORM public.record_loan_payment_with_evidence('25000000-0000-4000-8000-000000000032',1,'26000000-0000-4000-8000-000000000003','cash',NULL,decode('524946463600000057454250565038202a0000003003009d012a280028003e6d369848a42322a1238800800d896900001b81bd3e0e0000fefb2180000000','hex'),true);
  v_collections:=public.tenant_collections_summary('22000000-0000-4000-8000-000000000001');
  v_installment_page:=public.tenant_open_installment_page('22000000-0000-4000-8000-000000000001',1,50);
  IF (v_collections->>'openInstallments')::integer<>2 OR (v_collections->>'openBalance')::numeric<>38
    OR (v_installment_page->>'count')::integer<>2 OR jsonb_array_length(v_installment_page->'rows')<>2 THEN
    RAISE EXCEPTION 'Administrator collections views omitted cross-branch data: %, %',v_collections,v_installment_page;
  END IF;
  v_installment_page:=public.tenant_open_installment_page('22000000-0000-4000-8000-000000000001',2,1);
  IF (v_installment_page->>'count')::integer<>2 OR jsonb_array_length(v_installment_page->'rows')<>1
    OR v_installment_page->'rows'->0->>'loanId'<>'25000000-0000-4000-8000-000000000032' THEN
    RAISE EXCEPTION 'Open installment pagination skipped or repeated a cross-branch record: %',v_installment_page;
  END IF;
  v_payment_report:=public.tenant_report_payment_details('22000000-0000-4000-8000-000000000001',((now() AT TIME ZONE 'America/Santo_Domingo')::date)-1,((now() AT TIME ZONE 'America/Santo_Domingo')::date)+1);
  IF jsonb_array_length(v_payment_report)<>2 THEN
    RAISE EXCEPTION 'Tenant administrator detail export omitted a branch payment: %',v_payment_report;
  END IF;
  v_reconciliation:=public.tenant_payment_reconciliation('22000000-0000-4000-8000-000000000001',((now() AT TIME ZONE 'America/Santo_Domingo')::date)-1,((now() AT TIME ZONE 'America/Santo_Domingo')::date)+1);
  IF (v_reconciliation->>'paymentCount')::integer<>2 OR (v_reconciliation->>'expectedLedgerNet')::numeric<>2
    OR (v_reconciliation->>'ledgerDifference')::numeric<>0 THEN
    RAISE EXCEPTION 'Tenant administrator reconciliation omitted cross-branch totals: %',v_reconciliation;
  END IF;
  v_dashboard:=public.tenant_dashboard_summary('22000000-0000-4000-8000-000000000001',((now() AT TIME ZONE 'America/Santo_Domingo')::date)-30,((now() AT TIME ZONE 'America/Santo_Domingo')::date));
  IF (v_dashboard->>'customers')::integer<>4 OR (v_dashboard->>'devices')::integer<>2
    OR (v_dashboard->>'activeLoans')::integer<>2 OR (v_dashboard->>'activeBalance')::numeric<>38 THEN
    RAISE EXCEPTION 'Tenant administrator dashboard did not include both branches: %',v_dashboard;
  END IF;
  PERFORM public.manage_tenant_membership(v_membership_a,'sales','23000000-0000-4000-8000-000000000001','active');
  PERFORM public.manage_tenant_membership('28000000-0000-4000-8000-000000000002',
    'sales','23000000-0000-4000-8000-000000000002','active');
  PERFORM set_config('request.jwt.claim.sub','12000000-0000-4000-8000-000000000003',true);
  PERFORM set_config('request.jwt.claims','{"sub":"12000000-0000-4000-8000-000000000003","aal":"aal1"}',true);
  SELECT count(*) INTO v_count FROM public.tenant_memberships WHERE tenant_id='22000000-0000-4000-8000-000000000001';
  IF v_count<>7 THEN RAISE EXCEPTION 'Central administrator could not read tenant memberships: %',v_count; END IF;
  PERFORM public.manage_tenant_membership(
    (SELECT id FROM public.tenant_memberships WHERE user_id='12000000-0000-4000-8000-000000000003'),
    'tenant_admin',NULL,'suspended');
  PERFORM set_config('request.jwt.claim.sub','12000000-0000-4000-8000-000000000004',true);
  PERFORM set_config('request.jwt.claims','{"sub":"12000000-0000-4000-8000-000000000004","aal":"aal1"}',true);
  BEGIN
    PERFORM public.manage_tenant_membership('28000000-0000-4000-8000-000000000004',
      'tenant_admin','23000000-0000-4000-8000-000000000001','suspended');
    RAISE EXCEPTION 'The last active tenant administrator was unexpectedly suspendable';
  EXCEPTION WHEN SQLSTATE '22023' THEN
    IF SQLERRM<>'LAST_TENANT_ADMIN' THEN RAISE; END IF;
  END;
END $$;

ROLLBACK;
