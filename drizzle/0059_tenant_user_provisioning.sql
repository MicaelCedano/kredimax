-- These entry points are server-only. Browsers cannot supply an administrator identity.
CREATE FUNCTION public.provision_tenant_user(p_tenant_id uuid,p_actor_id uuid,p_user_id uuid,p_role public.member_role,p_branch_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_membership uuid;
BEGIN
  PERFORM 1 FROM public.tenants WHERE id=p_tenant_id AND status='active' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'TENANT_SUSPENDED' USING ERRCODE='42501'; END IF;
  PERFORM 1 FROM public.tenant_memberships WHERE tenant_id=p_tenant_id AND user_id=p_actor_id AND role='tenant_admin' AND status='active' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
  IF p_role IS NULL OR p_role NOT IN ('branch_manager','sales','cashier','collections','auditor') OR p_branch_id IS NULL THEN
    RAISE EXCEPTION 'INVALID_USER_SCOPE' USING ERRCODE='22023';
  END IF;
  PERFORM 1 FROM public.branches WHERE id=p_branch_id AND tenant_id=p_tenant_id AND active;
  IF NOT FOUND THEN RAISE EXCEPTION 'INVALID_BRANCH' USING ERRCODE='22023'; END IF;
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
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.provision_tenant_user(uuid,uuid,uuid,public.member_role,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.provision_tenant_user(uuid,uuid,uuid,public.member_role,uuid) TO service_role;
--> statement-breakpoint
CREATE FUNCTION public.tenant_user_directory(p_tenant_id uuid,p_actor_id uuid,p_page integer DEFAULT 1,p_page_size integer DEFAULT 50)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_rows jsonb; v_count bigint; v_page integer:=greatest(1,least(coalesce(p_page,1),100000)); v_size integer:=greatest(1,least(coalesce(p_page_size,50),50));
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.tenants t JOIN public.tenant_memberships m ON m.tenant_id=t.id
    WHERE t.id=p_tenant_id AND t.status='active' AND m.user_id=p_actor_id AND m.role='tenant_admin' AND m.status='active') THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501';
  END IF;
  SELECT count(*) INTO v_count FROM public.tenant_memberships WHERE tenant_id=p_tenant_id;
  SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY r.created_at DESC,r.id DESC),'[]'::jsonb) INTO v_rows FROM (
    SELECT m.id,m.user_id,m.branch_id,m.role,m.status,m.created_at,u.email,
      coalesce(nullif(u.raw_user_meta_data->>'full_name',''),nullif(u.raw_user_meta_data->>'name',''),u.email,'Usuario') AS full_name
    FROM public.tenant_memberships m LEFT JOIN auth.users u ON u.id=m.user_id
    WHERE m.tenant_id=p_tenant_id ORDER BY m.created_at DESC,m.id DESC LIMIT v_size OFFSET (v_page-1)*v_size
  ) r;
  RETURN jsonb_build_object('count',v_count,'rows',v_rows);
END $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.tenant_user_directory(uuid,uuid,integer,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.tenant_user_directory(uuid,uuid,integer,integer) TO service_role;
