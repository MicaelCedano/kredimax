CREATE POLICY memberships_select_tenant_admin ON public.tenant_memberships FOR SELECT TO authenticated
  USING(app_private.has_tenant_permission(tenant_memberships.tenant_id,'tenant.manage'));

CREATE OR REPLACE FUNCTION public.manage_tenant_membership(
  p_membership_id uuid,p_role public.member_role,p_branch_id uuid,p_status text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_user uuid:=(SELECT auth.uid()); v_tenant uuid; v_target_user uuid; v_before jsonb;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE='42501'; END IF;
  IF p_membership_id IS NULL OR p_role IS NULL OR p_status NOT IN ('active','suspended') THEN
    RAISE EXCEPTION 'INVALID_MEMBERSHIP' USING ERRCODE='22023';
  END IF;
  SELECT tenant_id,user_id,to_jsonb(m) INTO v_tenant,v_target_user,v_before
    FROM public.tenant_memberships m WHERE id=p_membership_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'MEMBERSHIP_NOT_FOUND' USING ERRCODE='23503'; END IF;
  IF NOT app_private.has_tenant_permission(v_tenant,'tenant.manage') THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
  IF p_branch_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.branches b WHERE b.id=p_branch_id AND b.tenant_id=v_tenant AND b.active) THEN
    RAISE EXCEPTION 'INVALID_BRANCH' USING ERRCODE='22023';
  END IF;
  IF p_role='platform_admin' THEN RAISE EXCEPTION 'PLATFORM_ROLE_NOT_ASSIGNABLE' USING ERRCODE='42501'; END IF;
  UPDATE public.tenant_memberships SET role=p_role,branch_id=p_branch_id,status=p_status WHERE id=p_membership_id;
  INSERT INTO public.audit_logs(tenant_id,actor_id,action,entity_type,entity_id,metadata)
    VALUES(v_tenant,v_user,'membership.updated','tenant_membership',p_membership_id,
      jsonb_build_object('targetUser',v_target_user,'before',jsonb_build_object('role',v_before->>'role','branchId',v_before->>'branch_id','status',v_before->>'status'),
        'after',jsonb_build_object('role',p_role,'branchId',p_branch_id,'status',p_status)));
END $$;
REVOKE ALL ON FUNCTION public.manage_tenant_membership(uuid,public.member_role,uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.manage_tenant_membership(uuid,public.member_role,uuid,text) TO authenticated;
