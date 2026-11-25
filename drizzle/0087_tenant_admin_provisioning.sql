CREATE OR REPLACE FUNCTION public.provision_tenant_user(
  p_tenant_id uuid,p_actor_id uuid,p_user_id uuid,p_role public.member_role,p_branch_id uuid
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_membership uuid;
BEGIN
  PERFORM 1 FROM public.tenants WHERE id=p_tenant_id AND status='active' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'TENANT_SUSPENDED' USING ERRCODE='42501'; END IF;
  PERFORM 1 FROM public.tenant_memberships WHERE tenant_id=p_tenant_id AND user_id=p_actor_id AND role='tenant_admin' AND status='active' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;

  IF p_role IS NULL OR p_role NOT IN ('tenant_admin','branch_manager','sales','cashier','collections','auditor','mdm_operator')
    OR (p_role='tenant_admin') <> (p_branch_id IS NULL) THEN
    RAISE EXCEPTION 'INVALID_USER_SCOPE' USING ERRCODE='22023';
  END IF;
  IF p_branch_id IS NOT NULL THEN
    PERFORM 1 FROM public.branches WHERE id=p_branch_id AND tenant_id=p_tenant_id AND active;
    IF NOT FOUND THEN RAISE EXCEPTION 'INVALID_BRANCH' USING ERRCODE='22023'; END IF;
  END IF;

  PERFORM 1 FROM auth.users WHERE id=p_user_id
    AND raw_app_meta_data->>'kredimax_created_for_tenant'=p_tenant_id::text
    AND raw_app_meta_data->>'kredimax_created_by'=p_actor_id::text FOR UPDATE;
  IF NOT FOUND OR EXISTS(SELECT 1 FROM public.tenant_memberships WHERE user_id=p_user_id) THEN
    RAISE EXCEPTION 'USER_NOT_PROVISIONED_FOR_TENANT' USING ERRCODE='42501';
  END IF;
  INSERT INTO public.tenant_memberships(tenant_id,user_id,branch_id,role,status)
    VALUES(p_tenant_id,p_user_id,p_branch_id,p_role,'active') RETURNING id INTO v_membership;
  INSERT INTO public.audit_logs(tenant_id,branch_id,actor_id,action,entity_type,entity_id,metadata)
    VALUES(p_tenant_id,p_branch_id,p_actor_id,'membership.created','tenant_membership',v_membership,
      jsonb_build_object('targetUser',p_user_id,'role',p_role,'branchId',p_branch_id));
  RETURN v_membership;
END $$;
