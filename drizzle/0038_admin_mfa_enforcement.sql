-- Administrators must have an AAL2 Supabase Auth session for all tenant
-- permissions. Missing AAL claims intentionally fail closed as AAL1.
CREATE OR REPLACE FUNCTION app_private.has_tenant_permission(p_tenant_id uuid,p_permission_key text)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
  SELECT EXISTS(
    SELECT 1 FROM public.tenant_memberships m
    JOIN public.roles r ON r.key=m.role
    JOIN public.role_permissions rp ON rp.role_id=r.id
    JOIN public.permissions p ON p.id=rp.permission_id
    WHERE m.tenant_id=p_tenant_id AND m.user_id=(SELECT auth.uid()) AND m.status='active'
      AND p.key=p_permission_key
      AND (r.key<>'tenant_admin' OR coalesce((SELECT auth.jwt()->>'aal'),'aal1')='aal2')
  )
$$;
--> statement-breakpoint
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
      AND (r.key<>'tenant_admin' OR coalesce((SELECT auth.jwt()->>'aal'),'aal1')='aal2')
      AND (r.key='tenant_admin' OR m.branch_id IS NULL OR m.branch_id=p_branch_id)
  )
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app_private.has_tenant_permission(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_private.has_tenant_permission(uuid,text) TO authenticated;
REVOKE ALL ON FUNCTION app_private.has_branch_permission(uuid,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_private.has_branch_permission(uuid,uuid,text) TO authenticated;
