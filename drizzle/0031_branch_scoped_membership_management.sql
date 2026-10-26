-- Keep membership administration inside the actor's branch scope.
DROP POLICY IF EXISTS memberships_select_tenant_admin ON public.tenant_memberships;
CREATE POLICY memberships_select_tenant_admin ON public.tenant_memberships FOR SELECT TO authenticated
  USING(app_private.has_branch_permission(tenant_memberships.tenant_id,tenant_memberships.branch_id,'tenant.manage'));
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.manage_tenant_membership(
  p_membership_id uuid,p_role public.member_role,p_branch_id uuid,p_status text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_user uuid:=(SELECT auth.uid());
  v_tenant uuid;
  v_target_user uuid;
  v_target_branch uuid;
  v_target_role public.member_role;
  v_target_status text;
  v_before jsonb;
  v_other_central_admins integer;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE='42501'; END IF;
  IF p_membership_id IS NULL OR p_role IS NULL OR p_status IS NULL OR p_status NOT IN ('active','suspended') THEN
    RAISE EXCEPTION 'INVALID_MEMBERSHIP' USING ERRCODE='22023';
  END IF;

  SELECT tenant_id INTO v_tenant FROM public.tenant_memberships WHERE id=p_membership_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'MEMBERSHIP_NOT_FOUND' USING ERRCODE='23503'; END IF;
  -- Serialize membership changes for a tenant so two administrators cannot remove its last central administrator.
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

  IF v_target_role='tenant_admin' AND v_target_branch IS NULL AND v_target_status='active'
    AND (p_role<>'tenant_admin' OR p_branch_id IS NOT NULL OR p_status<>'active') THEN
    SELECT count(*) INTO v_other_central_admins FROM public.tenant_memberships
      WHERE tenant_id=v_tenant AND id<>p_membership_id AND role='tenant_admin' AND branch_id IS NULL AND status='active';
    IF v_other_central_admins=0 THEN RAISE EXCEPTION 'LAST_TENANT_ADMIN' USING ERRCODE='22023'; END IF;
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
