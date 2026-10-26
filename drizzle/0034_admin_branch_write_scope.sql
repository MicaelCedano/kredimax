-- Tenant administrators can read the whole tenant and manage users/branches,
-- while ordinary operational writes remain scoped to their assigned branch.
-- An unassigned administrator retains full tenant scope by design.
CREATE OR REPLACE FUNCTION app_private.has_branch_permission(p_tenant_id uuid,p_branch_id uuid,p_permission_key text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS(
    SELECT 1 FROM public.tenant_memberships m
    JOIN public.tenants t ON t.id=m.tenant_id AND t.status='active'
    JOIN public.roles r ON r.key=m.role
    JOIN public.role_permissions rp ON rp.role_id=r.id
    JOIN public.permissions p ON p.id=rp.permission_id
    WHERE m.tenant_id=p_tenant_id AND m.user_id=(SELECT auth.uid()) AND m.status='active'
      AND p.key=p_permission_key
      AND (m.branch_id IS NULL OR m.branch_id=p_branch_id OR (
        r.key='tenant_admin' AND p.key IN (
          'customers.read','devices.read','financing.read','payments.read','reports.read',
          'audit.read','branches.read','tenant.manage','branches.manage'
        )
      ))
  )
$$;
