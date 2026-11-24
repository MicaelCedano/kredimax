-- Customer self-service portal accounts (KrediMax Clientes mobile app).
-- Links an authenticated Supabase Auth user strictly to a single customer record,
-- keeping staff tenant_memberships and administrative permissions isolated.
CREATE TABLE public.customer_portal_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  branch_id uuid,
  customer_id uuid NOT NULL,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  identity_key varchar(32) NOT NULL CHECK (identity_key ~ '^[0-9]{11}$'),
  status varchar(24) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'locked')),
  must_change_password boolean NOT NULL DEFAULT true,
  password_changed_at timestamptz,
  last_login_at timestamptz,
  failed_attempts integer NOT NULL DEFAULT 0 CHECK (failed_attempts >= 0),
  locked_until timestamptz,
  executive_name text,
  executive_whatsapp varchar(32),
  provisioned_by uuid NOT NULL REFERENCES auth.users(id),
  provisioned_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT customer_portal_accounts_customer_tenant_fk
    FOREIGN KEY (tenant_id, customer_id) REFERENCES public.customers(tenant_id, id),
  CONSTRAINT customer_portal_accounts_branch_tenant_fk
    FOREIGN KEY (tenant_id, branch_id) REFERENCES public.branches(tenant_id, id)
);
--> statement-breakpoint
CREATE UNIQUE INDEX customer_portal_accounts_user_uidx ON public.customer_portal_accounts(user_id);
--> statement-breakpoint
CREATE UNIQUE INDEX customer_portal_accounts_tenant_customer_uidx ON public.customer_portal_accounts(tenant_id, customer_id);
--> statement-breakpoint
CREATE UNIQUE INDEX customer_portal_accounts_tenant_identity_uidx ON public.customer_portal_accounts(tenant_id, identity_key);
--> statement-breakpoint
CREATE INDEX customer_portal_accounts_identity_idx ON public.customer_portal_accounts(identity_key);
--> statement-breakpoint
ALTER TABLE public.customer_portal_accounts ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE ALL ON public.customer_portal_accounts FROM PUBLIC, anon, authenticated;
--> statement-breakpoint
GRANT SELECT ON public.customer_portal_accounts TO authenticated;
--> statement-breakpoint
GRANT ALL ON public.customer_portal_accounts TO service_role;
--> statement-breakpoint
-- Helper to check whether the current authenticated user is an active customer owner
-- for a given tenant and customer, isolated from staff roles.
CREATE OR REPLACE FUNCTION app_private.is_portal_customer_owner(p_tenant_id uuid, p_customer_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.customer_portal_accounts a
    JOIN public.tenants t ON t.id = a.tenant_id AND t.status = 'active'
    WHERE a.user_id = (SELECT auth.uid())
      AND a.tenant_id = p_tenant_id
      AND a.customer_id = p_customer_id
      AND a.status = 'active'
      AND (a.locked_until IS NULL OR a.locked_until <= clock_timestamp())
  )
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app_private.is_portal_customer_owner(uuid, uuid) FROM PUBLIC, anon;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_private.is_portal_customer_owner(uuid, uuid) TO authenticated;
--> statement-breakpoint
-- RLS policies on customer_portal_accounts:
-- 1) Staff with customers.read can see portal account status in their branch/tenant.
-- 2) The authenticated customer can read only their own portal account link.
CREATE POLICY customer_portal_accounts_staff_select ON public.customer_portal_accounts
  FOR SELECT TO authenticated
  USING (app_private.has_branch_permission(tenant_id, branch_id, 'customers.read'));
--> statement-breakpoint
CREATE POLICY customer_portal_accounts_self_select ON public.customer_portal_accounts
  FOR SELECT TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    AND status = 'active'
    AND EXISTS (SELECT 1 FROM public.tenants t WHERE t.id = customer_portal_accounts.tenant_id AND t.status = 'active')
  );
--> statement-breakpoint
-- Read-only RLS policies for authenticated customer owners on their own records:
CREATE POLICY customers_portal_self_select ON public.customers
  FOR SELECT TO authenticated
  USING (app_private.is_portal_customer_owner(tenant_id, id));
--> statement-breakpoint
CREATE POLICY loans_portal_self_select ON public.loans
  FOR SELECT TO authenticated
  USING (app_private.is_portal_customer_owner(tenant_id, customer_id));
--> statement-breakpoint
CREATE POLICY credit_contracts_portal_self_select ON public.credit_contracts
  FOR SELECT TO authenticated
  USING (app_private.is_portal_customer_owner(tenant_id, customer_id));
--> statement-breakpoint
CREATE POLICY installments_portal_self_select ON public.installments
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.loans l
      WHERE l.tenant_id = installments.tenant_id
        AND l.id = installments.loan_id
        AND app_private.is_portal_customer_owner(l.tenant_id, l.customer_id)
    )
  );
--> statement-breakpoint
CREATE POLICY payments_portal_self_select ON public.payments
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.loans l
      WHERE l.tenant_id = payments.tenant_id
        AND l.id = payments.loan_id
        AND app_private.is_portal_customer_owner(l.tenant_id, l.customer_id)
    )
  );
--> statement-breakpoint
CREATE POLICY payment_allocations_portal_self_select ON public.payment_allocations
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.loans l
      WHERE l.tenant_id = payment_allocations.tenant_id
        AND l.id = payment_allocations.loan_id
        AND app_private.is_portal_customer_owner(l.tenant_id, l.customer_id)
    )
  );
--> statement-breakpoint
CREATE POLICY devices_portal_self_select ON public.devices
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.loans l
      WHERE l.tenant_id = devices.tenant_id
        AND l.device_id = devices.id
        AND app_private.is_portal_customer_owner(l.tenant_id, l.customer_id)
    )
  );
--> statement-breakpoint
CREATE POLICY branches_portal_self_select ON public.branches
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.customer_portal_accounts a
      WHERE a.user_id = (SELECT auth.uid())
        AND a.tenant_id = branches.tenant_id
        AND a.branch_id = branches.id
        AND a.status = 'active'
    )
  );
--> statement-breakpoint
-- Server-only provisioning RPC called by authorized administrators or activation staff.
-- Never accepts customer_id from untrusted client claims; verifies actor permissions and audit-logs without full identity_number exposure.
CREATE OR REPLACE FUNCTION public.provision_customer_portal_account(
  p_tenant_id uuid,
  p_actor_id uuid,
  p_customer_id uuid,
  p_user_id uuid,
  p_identity_key text
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_account_id uuid;
  v_branch_id uuid;
  v_clean_identity text := regexp_replace(coalesce(p_identity_key, ''), '[^0-9]', '', 'g');
BEGIN
  IF p_tenant_id IS NULL OR p_actor_id IS NULL OR p_customer_id IS NULL OR p_user_id IS NULL THEN
    RAISE EXCEPTION 'INVALID_PORTAL_PROVISION_ARGS' USING ERRCODE = '22023';
  END IF;
  IF v_clean_identity !~ '^[0-9]{11}$' THEN
    RAISE EXCEPTION 'INVALID_CUSTOMER_IDENTITY_KEY' USING ERRCODE = '22023';
  END IF;
  PERFORM 1 FROM public.tenants WHERE id = p_tenant_id AND status = 'active' FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'TENANT_SUSPENDED' USING ERRCODE = '42501';
  END IF;
  SELECT branch_id INTO v_branch_id
  FROM public.customers
  WHERE tenant_id = p_tenant_id AND id = p_customer_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'CUSTOMER_NOT_FOUND' USING ERRCODE = '23503';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.tenant_memberships m
    JOIN public.roles r ON r.key = m.role
    JOIN public.role_permissions rp ON rp.role_id = r.id
    JOIN public.permissions p ON p.id = rp.permission_id
    WHERE m.tenant_id = p_tenant_id
      AND m.user_id = p_actor_id
      AND m.status = 'active'
      AND p.key IN ('customers.write', 'financing.activate', 'tenant.manage')
      AND (m.role = 'tenant_admin' OR m.branch_id IS NULL OR m.branch_id = v_branch_id)
  ) THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501';
  END IF;
  IF EXISTS (SELECT 1 FROM public.tenant_memberships WHERE user_id = p_user_id) THEN
    RAISE EXCEPTION 'STAFF_USER_CANNOT_BE_PORTAL_CUSTOMER' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.customer_portal_accounts (
    tenant_id, branch_id, customer_id, user_id, identity_key, status,
    must_change_password, provisioned_by, provisioned_at, updated_at
  ) VALUES (
    p_tenant_id, v_branch_id, p_customer_id, p_user_id, v_clean_identity, 'active',
    true, p_actor_id, clock_timestamp(), clock_timestamp()
  )
  ON CONFLICT (tenant_id, customer_id) DO UPDATE SET
    user_id = EXCLUDED.user_id,
    identity_key = EXCLUDED.identity_key,
    status = 'active',
    must_change_password = true,
    failed_attempts = 0,
    locked_until = NULL,
    provisioned_by = EXCLUDED.provisioned_by,
    updated_at = clock_timestamp()
  RETURNING id INTO v_account_id;

  INSERT INTO public.audit_logs (tenant_id, branch_id, actor_id, action, entity_type, entity_id, metadata)
  VALUES (
    p_tenant_id,
    v_branch_id,
    p_actor_id,
    'customer_portal.provisioned',
    'customer',
    p_customer_id,
    jsonb_build_object(
      'portalAccountId', v_account_id,
      'maskedIdentity', '***-****' || right(v_clean_identity, 4),
      'mustChangePassword', true
    )
  );
  RETURN v_account_id;
END $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.provision_customer_portal_account(uuid, uuid, uuid, uuid, text) FROM PUBLIC, anon, authenticated;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.provision_customer_portal_account(uuid, uuid, uuid, uuid, text) TO service_role;
