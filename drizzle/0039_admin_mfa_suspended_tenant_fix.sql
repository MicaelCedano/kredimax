-- Preserve the tenant suspension gate while enforcing AAL2 for Administrators.
CREATE OR REPLACE FUNCTION app_private.has_tenant_permission(p_tenant_id uuid,p_permission_key text)
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
  )
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app_private.has_tenant_permission(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION app_private.has_tenant_permission(uuid,text) TO authenticated;
