REVOKE INSERT,UPDATE,DELETE ON public.branches FROM PUBLIC,anon,authenticated;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION app_private.create_tenant_branch(p_tenant_id uuid,p_name text,p_code text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_user_id uuid:=(SELECT auth.uid()); v_branch_id uuid; v_actor_branch uuid; v_name text:=btrim(p_name); v_code text:=upper(btrim(p_code));
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE='42501'; END IF;
  IF p_tenant_id IS NULL OR v_name IS NULL OR length(v_name)<2 OR length(v_name)>120
    OR v_code IS NULL OR v_code !~ '^[A-Z0-9][A-Z0-9_-]{1,19}$' THEN
    RAISE EXCEPTION 'INVALID_BRANCH' USING ERRCODE='22023';
  END IF;
  SELECT branch_id INTO v_actor_branch FROM public.tenant_memberships
    WHERE tenant_id=p_tenant_id AND user_id=v_user_id AND status='active';
  IF NOT FOUND OR v_actor_branch IS NOT NULL OR NOT app_private.has_tenant_permission(p_tenant_id,'branches.manage') THEN
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
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_private.create_tenant_branch(uuid,text,text) TO authenticated;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.create_tenant_branch(p_tenant_id uuid,p_name text,p_code text)
RETURNS uuid LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  SELECT app_private.create_tenant_branch(p_tenant_id,p_name,p_code)
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.create_tenant_branch(uuid,text,text) FROM PUBLIC,anon;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.create_tenant_branch(uuid,text,text) TO authenticated;
