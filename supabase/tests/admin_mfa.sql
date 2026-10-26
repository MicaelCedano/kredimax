-- TOTP is temporarily disabled; role, tenant status, and branch rules remain active.
BEGIN;
INSERT INTO auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at,raw_app_meta_data,raw_user_meta_data)
VALUES
 ('31000000-0000-4000-8000-000000000001','authenticated','authenticated','mfa-admin@example.test','',now(),now(),now(),'{}','{}'),
 ('31000000-0000-4000-8000-000000000002','authenticated','authenticated','mfa-sales@example.test','',now(),now(),now(),'{}','{}');
INSERT INTO public.tenants(id,name) VALUES('32000000-0000-4000-8000-000000000001','MFA policy test');
INSERT INTO public.branches(id,tenant_id,name,code,active)
VALUES('33000000-0000-4000-8000-000000000001','32000000-0000-4000-8000-000000000001','MFA branch','MFA-1',true);
INSERT INTO public.tenant_memberships(tenant_id,user_id,role,branch_id) VALUES
 ('32000000-0000-4000-8000-000000000001','31000000-0000-4000-8000-000000000001','tenant_admin',NULL),
 ('32000000-0000-4000-8000-000000000001','31000000-0000-4000-8000-000000000002','sales','33000000-0000-4000-8000-000000000001');
SET LOCAL ROLE authenticated;
DO $$
DECLARE v_count integer;
BEGIN
  PERFORM set_config('request.jwt.claim.sub','31000000-0000-4000-8000-000000000001',true);
  PERFORM set_config('request.jwt.claims','{"sub":"31000000-0000-4000-8000-000000000001","aal":"aal1"}',true);
  IF NOT app_private.has_tenant_permission('32000000-0000-4000-8000-000000000001','tenant.manage')
    OR NOT app_private.has_branch_permission('32000000-0000-4000-8000-000000000001',NULL,'tenant.manage') THEN
    RAISE EXCEPTION 'Administrator permissions must remain available at AAL1 while TOTP is disabled';
  END IF;
  SELECT count(*) INTO v_count FROM public.tenant_memberships WHERE user_id='31000000-0000-4000-8000-000000000001';
  IF v_count<>1 THEN RAISE EXCEPTION 'AAL1 administrator membership read is not scoped to the fixture'; END IF;

  PERFORM set_config('request.jwt.claim.sub','31000000-0000-4000-8000-000000000002',true);
  PERFORM set_config('request.jwt.claims','{"sub":"31000000-0000-4000-8000-000000000002","aal":"aal1"}',true);
  IF NOT app_private.has_branch_permission('32000000-0000-4000-8000-000000000001','33000000-0000-4000-8000-000000000001','customers.read') THEN
    RAISE EXCEPTION 'Non-administrator permissions were incorrectly gated by MFA';
  END IF;

END $$;
RESET ROLE;
UPDATE public.tenants SET status='suspended' WHERE id='32000000-0000-4000-8000-000000000001';
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"31000000-0000-4000-8000-000000000001","aal":"aal1"}',true);
  IF app_private.has_tenant_permission('32000000-0000-4000-8000-000000000001','tenant.manage')
    OR app_private.has_branch_permission('32000000-0000-4000-8000-000000000001',NULL,'tenant.manage') THEN
    RAISE EXCEPTION 'Disabling TOTP bypassed suspended-tenant protection';
  END IF;
END $$;
RESET ROLE;
ROLLBACK;
