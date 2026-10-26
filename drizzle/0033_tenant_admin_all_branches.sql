-- Tenant administrators have tenant-wide access even when the membership keeps
-- a default branch for day-to-day context. Every other role remains branch-scoped.
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
      AND (r.key='tenant_admin' OR m.branch_id IS NULL OR m.branch_id=p_branch_id)
  )
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION app_private.guard_branch_membership()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_actor_branch uuid; v_actor_role public.member_role;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN RETURN NEW; END IF;
  SELECT branch_id,role INTO v_actor_branch,v_actor_role FROM public.tenant_memberships
    WHERE tenant_id=NEW.tenant_id AND user_id=(SELECT auth.uid()) AND status='active';
  IF NOT FOUND OR (v_actor_role<>'tenant_admin' AND v_actor_branch IS NOT NULL
      AND NEW.branch_id IS DISTINCT FROM v_actor_branch) THEN
    RAISE EXCEPTION 'BRANCH_SCOPE_FORBIDDEN' USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION app_private.create_tenant_branch(p_tenant_id uuid,p_name text,p_code text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_user_id uuid:=(SELECT auth.uid()); v_branch_id uuid; v_name text:=btrim(p_name); v_code text:=upper(btrim(p_code));
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE='42501'; END IF;
  IF p_tenant_id IS NULL OR v_name IS NULL OR length(v_name)<2 OR length(v_name)>120
    OR v_code IS NULL OR v_code !~ '^[A-Z0-9][A-Z0-9_-]{1,19}$' THEN
    RAISE EXCEPTION 'INVALID_BRANCH' USING ERRCODE='22023';
  END IF;
  IF NOT app_private.has_branch_permission(p_tenant_id,NULL,'branches.manage') THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501';
  END IF;
  INSERT INTO public.branches(tenant_id,name,code,active) VALUES(p_tenant_id,v_name,v_code,true)
    RETURNING id INTO v_branch_id;
  INSERT INTO public.audit_logs(tenant_id,actor_id,action,entity_type,entity_id,metadata)
    VALUES(p_tenant_id,v_user_id,'branch.created','branch',v_branch_id,jsonb_build_object('name',v_name,'code',v_code));
  RETURN v_branch_id;
EXCEPTION WHEN unique_violation THEN
  RAISE EXCEPTION 'BRANCH_CODE_TAKEN' USING ERRCODE='23505';
END $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app_private.create_tenant_branch(uuid,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION app_private.create_tenant_branch(uuid,text,text) TO authenticated;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.manage_tenant_membership(
  p_membership_id uuid,p_role public.member_role,p_branch_id uuid,p_status text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_user uuid:=(SELECT auth.uid()); v_tenant uuid; v_target_user uuid;
  v_target_branch uuid; v_target_role public.member_role; v_target_status text;
  v_before jsonb; v_other_admins integer;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE='42501'; END IF;
  IF p_membership_id IS NULL OR p_role IS NULL OR p_status IS NULL OR p_status NOT IN ('active','suspended') THEN
    RAISE EXCEPTION 'INVALID_MEMBERSHIP' USING ERRCODE='22023';
  END IF;
  SELECT tenant_id INTO v_tenant FROM public.tenant_memberships WHERE id=p_membership_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'MEMBERSHIP_NOT_FOUND' USING ERRCODE='23503'; END IF;
  PERFORM 1 FROM public.tenants WHERE id=v_tenant AND status='active' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'TENANT_SUSPENDED' USING ERRCODE='42501'; END IF;
  SELECT user_id,branch_id,role,status,to_jsonb(m)
    INTO v_target_user,v_target_branch,v_target_role,v_target_status,v_before
    FROM public.tenant_memberships m WHERE id=p_membership_id AND tenant_id=v_tenant FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'MEMBERSHIP_NOT_FOUND' USING ERRCODE='23503'; END IF;
  IF NOT app_private.has_branch_permission(v_tenant,v_target_branch,'tenant.manage')
    OR NOT app_private.has_branch_permission(v_tenant,p_branch_id,'tenant.manage') THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501';
  END IF;
  IF p_branch_id IS NOT NULL AND NOT EXISTS(
    SELECT 1 FROM public.branches b WHERE b.id=p_branch_id AND b.tenant_id=v_tenant AND b.active
  ) THEN RAISE EXCEPTION 'INVALID_BRANCH' USING ERRCODE='22023'; END IF;
  IF p_role='platform_admin' THEN RAISE EXCEPTION 'PLATFORM_ROLE_NOT_ASSIGNABLE' USING ERRCODE='42501'; END IF;
  IF v_target_role='tenant_admin' AND v_target_status='active'
    AND (p_role<>'tenant_admin' OR p_status<>'active') THEN
    SELECT count(*) INTO v_other_admins FROM public.tenant_memberships
      WHERE tenant_id=v_tenant AND id<>p_membership_id AND role='tenant_admin' AND status='active';
    IF v_other_admins=0 THEN RAISE EXCEPTION 'LAST_TENANT_ADMIN' USING ERRCODE='22023'; END IF;
  END IF;
  UPDATE public.tenant_memberships SET role=p_role,branch_id=p_branch_id,status=p_status WHERE id=p_membership_id;
  INSERT INTO public.audit_logs(tenant_id,actor_id,action,entity_type,entity_id,metadata)
    VALUES(v_tenant,v_user,'membership.updated','tenant_membership',p_membership_id,
      jsonb_build_object('targetUser',v_target_user,
        'before',jsonb_build_object('role',v_before->>'role','branchId',v_before->>'branch_id','status',v_before->>'status'),
        'after',jsonb_build_object('role',p_role,'branchId',p_branch_id,'status',p_status)));
END $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.manage_tenant_membership(uuid,public.member_role,uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.manage_tenant_membership(uuid,public.member_role,uuid,text) TO authenticated;
