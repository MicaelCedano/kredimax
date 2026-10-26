-- Integration test for a local Supabase database only. Requires the foundation migration.
-- Creates disposable fixtures inside a transaction and rolls them back at the end.
begin;

insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at,raw_app_meta_data,raw_user_meta_data)
values
 ('10000000-0000-4000-8000-000000000001','authenticated','authenticated','rls-a@example.test','',now(),now(),now(),'{}','{}'),
 ('10000000-0000-4000-8000-000000000002','authenticated','authenticated','rls-b@example.test','',now(),now(),now(),'{}','{}'),
 ('10000000-0000-4000-8000-000000000003','authenticated','authenticated','rls-admin-a@example.test','',now(),now(),now(),'{}','{}');
insert into public.tenants(id,name) values
 ('20000000-0000-4000-8000-000000000001','Tenant A'),
 ('20000000-0000-4000-8000-000000000002','Tenant B');
insert into public.branches(id,tenant_id,name,code) values
 ('21000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','Sucursal A','A'),
 ('21000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002','Sucursal B','B');
insert into public.tenant_memberships(id,tenant_id,user_id,role,branch_id) values
 ('11000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','sales','21000000-0000-4000-8000-000000000001'),
 ('11000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002','sales','21000000-0000-4000-8000-000000000002'),
 ('11000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000003','tenant_admin',NULL);
insert into public.customers(id,tenant_id,branch_id,full_name,identity_number) values
 ('30000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','21000000-0000-4000-8000-000000000001','Cliente A','TENANT-A-IDENTITY'),
 ('30000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002','21000000-0000-4000-8000-000000000002','Cliente B','TENANT-B-IDENTITY');
insert into public.devices(id,tenant_id,branch_id,imei,brand,model) values
 ('40000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002','21000000-0000-4000-8000-000000000002','490154203237518','Prueba','Empresa B');
insert into public.credit_contracts(id,tenant_id,branch_id,customer_id,contract_number,terms) values
 ('50000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002','21000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000002','TENANT-B-ACTIVE','{}'),
 ('50000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000002','21000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000002','TENANT-B-APPROVED','{"downPayment":"10.00"}');
insert into public.loans(id,tenant_id,branch_id,customer_id,contract_id,device_id,status,sale_price,down_payment,principal,interest_rate,installment_count,calculation_strategy) values
 ('60000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002','21000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000002','50000000-0000-4000-8000-000000000002','40000000-0000-4000-8000-000000000002','active',10,0,10,0,1,'tenant-isolation'),
 ('60000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000002','21000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000002','50000000-0000-4000-8000-000000000003','40000000-0000-4000-8000-000000000002','approved',100,10,90,0,1,'tenant-isolation');
insert into public.installments(id,tenant_id,loan_id,sequence,due_date,amount_due) values
 ('70000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002','60000000-0000-4000-8000-000000000002',1,((now() AT TIME ZONE 'America/Santo_Domingo')::date)+30,10),
 ('70000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000002','60000000-0000-4000-8000-000000000003',1,((now() AT TIME ZONE 'America/Santo_Domingo')::date)+30,90);
-- Owner-only fixtures let the test exercise review and reversal RPCs against Tenant B.
ALTER TABLE public.credit_applications DISABLE TRIGGER credit_applications_attach_device_before_insert;
ALTER TABLE public.credit_applications DISABLE TRIGGER credit_applications_quote_snapshot_validate;
INSERT INTO public.credit_applications(id,tenant_id,customer_id,device_id,branch_id,requested_amount,status,quote_snapshot,submission_key,created_by)
VALUES('90000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000002',
  '30000000-0000-4000-8000-000000000002','40000000-0000-4000-8000-000000000002','21000000-0000-4000-8000-000000000002',10,'pending','{}',
  '90000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002');
ALTER TABLE public.credit_applications ENABLE TRIGGER credit_applications_attach_device_before_insert;
ALTER TABLE public.credit_applications ENABLE TRIGGER credit_applications_quote_snapshot_validate;
INSERT INTO public.payments(id,tenant_id,loan_id,idempotency_key,amount,received_by,payment_method,payment_type)
VALUES('80000000-0000-4000-8000-000000000013','20000000-0000-4000-8000-000000000002','60000000-0000-4000-8000-000000000002',
  '80000000-0000-4000-8000-000000000014',1,'10000000-0000-4000-8000-000000000002','cash','installment');

set local role authenticated;
set local request.jwt.claim.sub = '10000000-0000-4000-8000-000000000001';
do $$
declare visible_count integer;
begin
 select count(*) into visible_count from public.customers;
 if visible_count <> 1 then raise exception 'RLS tenant isolation failed: expected 1 visible customer, got %', visible_count; end if;
 if exists(select 1 from public.customers where id='30000000-0000-4000-8000-000000000002') then
  raise exception 'RLS tenant isolation failed: user A read tenant B customer';
 end if;
 update public.customers set full_name='Changed by tenant A' where id='30000000-0000-4000-8000-000000000002';
 get diagnostics visible_count = row_count;
 if visible_count <> 0 then raise exception 'RLS tenant isolation failed: user A updated tenant B customer'; end if;
 begin
  insert into public.customers(tenant_id,full_name) values('20000000-0000-4000-8000-000000000002','Unauthorized');
  raise exception 'RLS tenant isolation failed: user A inserted into tenant B';
 exception when insufficient_privilege then null;
 end;
 begin
  perform public.tenant_dashboard_summary('20000000-0000-4000-8000-000000000001',((now() AT TIME ZONE 'America/Santo_Domingo')::date),((now() AT TIME ZONE 'America/Santo_Domingo')::date));
  raise exception 'Dashboard summary unexpectedly allowed sales role without reports.read';
 exception when sqlstate '42501' then null;
 end;
 begin
  perform public.tenant_dashboard_summary('20000000-0000-4000-8000-000000000002',((now() AT TIME ZONE 'America/Santo_Domingo')::date),((now() AT TIME ZONE 'America/Santo_Domingo')::date));
  raise exception 'Dashboard summary unexpectedly exposed another tenant';
 exception when sqlstate '42501' then null;
 end;
 perform set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000003',true);
 perform set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000003","aal":"aal1"}',true);
 if jsonb_array_length(public.tenant_report_payment_details('20000000-0000-4000-8000-000000000001',((now() AT TIME ZONE 'America/Santo_Domingo')::date)-1,((now() AT TIME ZONE 'America/Santo_Domingo')::date)+1))<>0 then
  raise exception 'Tenant A payment detail report returned unexpected rows';
 end if;
 begin
  perform public.tenant_report_payment_details('20000000-0000-4000-8000-000000000002',((now() AT TIME ZONE 'America/Santo_Domingo')::date)-1,((now() AT TIME ZONE 'America/Santo_Domingo')::date)+1);
  raise exception 'Payment detail report unexpectedly exposed another tenant';
 exception when sqlstate '42501' then null;
 end;
 begin
  perform public.tenant_dashboard_summary('20000000-0000-4000-8000-000000000002',((now() AT TIME ZONE 'America/Santo_Domingo')::date)-30,((now() AT TIME ZONE 'America/Santo_Domingo')::date));
  raise exception 'Dashboard summary unexpectedly exposed another tenant to an Administrator';
 exception when sqlstate '42501' then null;
 end;
 begin
  perform public.tenant_report_summary('20000000-0000-4000-8000-000000000002',((now() AT TIME ZONE 'America/Santo_Domingo')::date)-1,((now() AT TIME ZONE 'America/Santo_Domingo')::date)+31);
  raise exception 'Report summary unexpectedly exposed another tenant';
 exception when sqlstate '42501' then null;
 end;
 begin
  perform public.tenant_collections_summary('20000000-0000-4000-8000-000000000002');
  raise exception 'Collections summary unexpectedly exposed another tenant';
 exception when sqlstate '42501' then null;
 end;
 begin
  perform public.tenant_open_installment_page('20000000-0000-4000-8000-000000000002',1,50);
  raise exception 'Open installment page unexpectedly exposed another tenant';
 exception when sqlstate '42501' then null;
 end;
 begin
  SELECT count(*) INTO visible_count FROM public.lookup_customer_by_identity('20000000-0000-4000-8000-000000000002','TENANT-B-IDENTITY');
  IF visible_count<>0 THEN RAISE EXCEPTION 'Identity lookup exposed another tenant customer'; END IF;
 end;
 begin
  PERFORM public.create_credit_application('20000000-0000-4000-8000-000000000002',NULL,NULL,'21000000-0000-4000-8000-000000000002',10,NULL,'80000000-0000-4000-8000-000000000021');
  raise exception 'Credit application RPC unexpectedly wrote into another tenant';
 exception when sqlstate '42501' then null;
 end;
 begin
  PERFORM public.create_customer_and_credit_application(
    '20000000-0000-4000-8000-000000000002','21000000-0000-4000-8000-000000000002',
    'No autorizado','CROSS-TENANT-IDENTITY',NULL,NULL,NULL,10,NULL,'80000000-0000-4000-8000-000000000022'
  );
  raise exception 'Customer/application RPC unexpectedly wrote into another tenant';
 exception when sqlstate '42501' then null;
 end;
 begin
  PERFORM public.create_tenant_branch('20000000-0000-4000-8000-000000000002','Unauthorized branch','CROSS-A');
  raise exception 'Branch creation RPC unexpectedly wrote into another tenant';
 exception when sqlstate '42501' then null;
 end;
 begin
  PERFORM public.manage_tenant_membership('11000000-0000-4000-8000-000000000002','sales','21000000-0000-4000-8000-000000000002','suspended');
  raise exception 'Membership management RPC unexpectedly changed another tenant';
 exception when sqlstate '42501' then null;
 end;
 begin
  PERFORM public.review_credit_application('90000000-0000-4000-8000-000000000001','rejected','Cross-tenant test',NULL,NULL,false);
  raise exception 'Application review RPC unexpectedly changed another tenant';
 exception when sqlstate '42501' then null;
 end;
 begin
  PERFORM public.reverse_loan_payment('80000000-0000-4000-8000-000000000013','Cross-tenant reversal test');
  raise exception 'Payment reversal RPC unexpectedly changed another tenant';
 exception when sqlstate '42501' then null;
 end;
 begin
  perform public.record_loan_payment_with_evidence('60000000-0000-4000-8000-000000000002',1,
   '80000000-0000-4000-8000-000000000011','cash','CROSS-TENANT-PAYMENT',decode('524946463600000057454250565038202a0000003003009d012a280028003e6d369848a42322a1238800800d896900001b81bd3e0e0000fefb2180000000','hex'),true);
  raise exception 'Tenant A administrator unexpectedly posted a payment to tenant B';
 exception when sqlstate '42501' then null;
 end;
 begin
  perform public.activate_approved_loan_with_evidence('60000000-0000-4000-8000-000000000003','cash','CROSS-TENANT-INITIAL',
   '80000000-0000-4000-8000-000000000012','test/private-contract.pdf',true,(now() AT TIME ZONE 'America/Santo_Domingo')::date,decode('524946463600000057454250565038202a0000003003009d012a280028003e6d369848a42322a1238800800d896900001b81bd3e0e0000fefb2180000000','hex'),true);
  raise exception 'Tenant A administrator unexpectedly activated a tenant B loan';
 exception when sqlstate '42501' then null;
 end;
end $$;
reset role;
do $$
begin
 if NOT EXISTS(SELECT 1 FROM public.tenant_memberships WHERE id='11000000-0000-4000-8000-000000000002' AND status='active')
  OR EXISTS(SELECT 1 FROM public.branches WHERE tenant_id='20000000-0000-4000-8000-000000000002' AND code='CROSS-A')
  OR EXISTS(SELECT 1 FROM public.customers WHERE tenant_id='20000000-0000-4000-8000-000000000002' AND identity_number='CROSS-TENANT-IDENTITY')
  OR EXISTS(SELECT 1 FROM public.credit_applications WHERE submission_key IN ('80000000-0000-4000-8000-000000000021','80000000-0000-4000-8000-000000000022'))
  OR NOT EXISTS(SELECT 1 FROM public.credit_applications WHERE id='90000000-0000-4000-8000-000000000001' AND status='pending')
  OR NOT EXISTS(SELECT 1 FROM public.payments WHERE id='80000000-0000-4000-8000-000000000013' AND reversed_at IS NULL)
  OR EXISTS(SELECT 1 FROM public.credit_application_events WHERE application_id='90000000-0000-4000-8000-000000000001' AND to_status='rejected')
  OR EXISTS(SELECT 1 FROM public.ledger_entries WHERE payment_id='80000000-0000-4000-8000-000000000013' AND entry_type='payment_reversal') THEN
  raise exception 'Cross-tenant membership or branch-management denial left mutations';
 end if;
 if exists(select 1 from public.payments where idempotency_key in (
   '80000000-0000-4000-8000-000000000011','80000000-0000-4000-8000-000000000012'))
  or not exists(select 1 from public.loans where id='60000000-0000-4000-8000-000000000003' and status='approved' and activated_at is null)
  or exists(select 1 from public.credit_contracts where id='50000000-0000-4000-8000-000000000003' and signed_by is not null)
  or exists(select 1 from public.audit_logs where entity_id='60000000-0000-4000-8000-000000000003' and action='loan.activated') then
  raise exception 'Cross-tenant denial left payment, activation, contract, or audit mutations';
 end if;
end $$;

rollback;
