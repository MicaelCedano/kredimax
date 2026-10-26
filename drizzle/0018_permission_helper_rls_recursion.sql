-- Membership administration policies call this helper while memberships are being read.
-- SECURITY DEFINER avoids recursive RLS evaluation; the helper only returns a boolean for auth.uid().
CREATE OR REPLACE FUNCTION app_private.has_tenant_permission(p_tenant_id uuid,p_permission_key text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.tenant_memberships m
    JOIN public.tenants t ON t.id=m.tenant_id
    JOIN public.roles r ON r.key=m.role
    JOIN public.role_permissions rp ON rp.role_id=r.id
    JOIN public.permissions p ON p.id=rp.permission_id
    WHERE m.tenant_id=p_tenant_id AND m.user_id=(SELECT auth.uid())
      AND m.status='active' AND t.status='active' AND p.key=p_permission_key
  )
$$;
REVOKE ALL ON FUNCTION app_private.has_tenant_permission(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION app_private.has_tenant_permission(uuid,text) TO authenticated;
