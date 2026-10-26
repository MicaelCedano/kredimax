CREATE OR REPLACE FUNCTION app_private.create_customer_and_credit_application(
  p_tenant_id uuid,
  p_branch_id uuid,
  p_customer_full_name text,
  p_customer_identity_number text,
  p_customer_phone text,
  p_customer_address text,
  p_device_id uuid,
  p_requested_amount numeric,
  p_quote_snapshot jsonb,
  p_submission_key uuid
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_customer_id uuid;
  v_application_id uuid;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE = '42501'; END IF;
  IF NOT app_private.has_tenant_permission(p_tenant_id,'customers.write')
     OR NOT app_private.has_tenant_permission(p_tenant_id,'financing.write') THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501';
  END IF;
  IF p_submission_key IS NULL OR nullif(trim(p_customer_full_name),'') IS NULL THEN
    RAISE EXCEPTION 'INVALID_CUSTOMER' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.tenant_memberships m
    WHERE m.tenant_id=p_tenant_id AND m.user_id=v_user_id AND m.status='active'
      AND m.branch_id IS NOT DISTINCT FROM p_branch_id
  ) THEN RAISE EXCEPTION 'INVALID_BRANCH_SCOPE' USING ERRCODE = '42501'; END IF;

  -- A repeated submission returns its original application without inserting a second customer.
  SELECT id INTO v_application_id FROM public.credit_applications
  WHERE tenant_id=p_tenant_id AND created_by=v_user_id AND submission_key=p_submission_key;
  IF v_application_id IS NOT NULL THEN RETURN v_application_id; END IF;

  IF nullif(trim(p_customer_identity_number),'') IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.customers c
    WHERE c.tenant_id=p_tenant_id AND lower(trim(c.identity_number))=lower(trim(p_customer_identity_number))
  ) THEN RAISE EXCEPTION 'CUSTOMER_ALREADY_EXISTS' USING ERRCODE = '23505'; END IF;

  INSERT INTO public.customers(tenant_id,branch_id,full_name,identity_number,phone,address)
  VALUES(p_tenant_id,p_branch_id,trim(p_customer_full_name),nullif(trim(p_customer_identity_number),''),nullif(trim(p_customer_phone),''),nullif(trim(p_customer_address),''))
  RETURNING id INTO v_customer_id;

  RETURN app_private.create_credit_application(
    p_tenant_id,v_customer_id,p_device_id,p_branch_id,p_requested_amount,p_quote_snapshot,p_submission_key
  );
END;
$$;

REVOKE ALL ON FUNCTION app_private.create_customer_and_credit_application(uuid,uuid,text,text,text,text,uuid,numeric,jsonb,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION app_private.create_customer_and_credit_application(uuid,uuid,text,text,text,text,uuid,numeric,jsonb,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.create_customer_and_credit_application(
  p_tenant_id uuid,p_branch_id uuid,p_customer_full_name text,p_customer_identity_number text,
  p_customer_phone text,p_customer_address text,p_device_id uuid,p_requested_amount numeric,
  p_quote_snapshot jsonb,p_submission_key uuid
) RETURNS uuid LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  SELECT app_private.create_customer_and_credit_application(
    p_tenant_id,p_branch_id,p_customer_full_name,p_customer_identity_number,
    p_customer_phone,p_customer_address,p_device_id,p_requested_amount,p_quote_snapshot,p_submission_key
  )
$$;
REVOKE ALL ON FUNCTION public.create_customer_and_credit_application(uuid,uuid,text,text,text,text,uuid,numeric,jsonb,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_customer_and_credit_application(uuid,uuid,text,text,text,text,uuid,numeric,jsonb,uuid) TO authenticated;
