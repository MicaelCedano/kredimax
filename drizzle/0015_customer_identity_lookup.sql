CREATE OR REPLACE FUNCTION public.lookup_customer_by_identity(p_tenant_id uuid,p_identity_number text)
RETURNS TABLE(id uuid,full_name varchar,identity_number text,phone text,address text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_normalized text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE='42501'; END IF;
  IF p_identity_number IS NULL OR length(btrim(p_identity_number))<6 OR length(p_identity_number)>40 THEN
    RAISE EXCEPTION 'INVALID_IDENTITY' USING ERRCODE='22023';
  END IF;
  v_normalized:=upper(regexp_replace(btrim(p_identity_number),'[^A-Za-z0-9]','','g'));
  IF length(v_normalized)<6 THEN RAISE EXCEPTION 'INVALID_IDENTITY' USING ERRCODE='22023'; END IF;
  IF p_tenant_id IS NULL OR NOT app_private.has_tenant_permission(p_tenant_id,'customers.read') THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501';
  END IF;
  RETURN QUERY SELECT c.id,c.full_name,c.identity_number,c.phone,c.address
    FROM public.customers c WHERE c.tenant_id=p_tenant_id
      AND upper(regexp_replace(btrim(c.identity_number),'[^A-Za-z0-9]','','g'))=v_normalized LIMIT 2;
END $$;
REVOKE ALL ON FUNCTION public.lookup_customer_by_identity(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.lookup_customer_by_identity(uuid,text) TO authenticated;
