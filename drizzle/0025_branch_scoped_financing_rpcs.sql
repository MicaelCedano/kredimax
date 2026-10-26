DO $$
DECLARE v_signature regprocedure; v_source text; v_updated text;
BEGIN
  FOREACH v_signature IN ARRAY ARRAY[
    'app_private.create_credit_application(uuid,uuid,uuid,uuid,numeric,jsonb,uuid)'::regprocedure,
    'app_private.create_customer_and_credit_application(uuid,uuid,text,text,text,text,uuid,numeric,jsonb,uuid)'::regprocedure
  ] LOOP
    v_source:=pg_get_functiondef(v_signature);
    v_updated:=replace(v_source,'m.branch_id IS NOT DISTINCT FROM p_branch_id','(m.branch_id IS NULL OR m.branch_id IS NOT DISTINCT FROM p_branch_id)');
    IF v_updated=v_source THEN RAISE EXCEPTION 'Branch scope pattern not found in %',v_signature; END IF;
    EXECUTE v_updated;
  END LOOP;

  v_signature:='app_private.attach_application_device_from_snapshot()'::regprocedure;
  v_source:=pg_get_functiondef(v_signature);
  v_updated:=replace(v_source,'m.branch_id IS NOT DISTINCT FROM NEW.branch_id','(m.branch_id IS NULL OR m.branch_id IS NOT DISTINCT FROM NEW.branch_id)');
  v_updated:=regexp_replace(v_updated,
    'INSERT INTO public\.devices\(tenant_id, imei, brand, model\)[[:space:]]+VALUES \(NEW\.tenant_id, v_imei, v_brand, v_model\)',
    'INSERT INTO public.devices(tenant_id, branch_id, imei, brand, model) VALUES (NEW.tenant_id, NEW.branch_id, v_imei, v_brand, v_model)', 'g');
  IF v_updated=v_source OR position('NEW.branch_id, v_imei, v_brand, v_model' in v_updated)=0 THEN
    RAISE EXCEPTION 'Could not make application-created devices branch-aware';
  END IF;
  EXECUTE v_updated;
END $$;
--> statement-breakpoint
DROP FUNCTION public.lookup_customer_by_identity(uuid,text);
--> statement-breakpoint
CREATE FUNCTION public.lookup_customer_by_identity(p_tenant_id uuid,p_identity_number text)
RETURNS TABLE(id uuid,branch_id uuid,full_name varchar,identity_number text,phone text,address text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_normalized text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE='42501'; END IF;
  IF p_identity_number IS NULL OR length(btrim(p_identity_number))<6 OR length(p_identity_number)>40 THEN
    RAISE EXCEPTION 'INVALID_IDENTITY' USING ERRCODE='22023';
  END IF;
  v_normalized:=upper(regexp_replace(btrim(p_identity_number),'[^A-Za-z0-9]','','g'));
  IF length(v_normalized)<6 THEN RAISE EXCEPTION 'INVALID_IDENTITY' USING ERRCODE='22023'; END IF;
  RETURN QUERY SELECT c.id,c.branch_id,c.full_name,c.identity_number,c.phone,c.address
    FROM public.customers c WHERE c.tenant_id=p_tenant_id
      AND app_private.has_branch_permission(c.tenant_id,c.branch_id,'customers.read')
      AND upper(regexp_replace(btrim(c.identity_number),'[^A-Za-z0-9]','','g'))=v_normalized LIMIT 2;
END $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.lookup_customer_by_identity(uuid,text) FROM PUBLIC,anon;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.lookup_customer_by_identity(uuid,text) TO authenticated;
