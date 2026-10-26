CREATE OR REPLACE FUNCTION public.tenant_collections_summary(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_today date := (now() AT TIME ZONE 'America/Santo_Domingo')::date;
  v_result jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE='42501';
  END IF;
  IF p_tenant_id IS NULL OR NOT app_private.has_tenant_permission(p_tenant_id,'payments.read') THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501';
  END IF;

  SELECT jsonb_build_object(
    'openInstallments', count(*) FILTER (WHERE i.amount_paid < i.amount_due),
    'openBalance', coalesce(sum(i.amount_due-i.amount_paid) FILTER (WHERE i.amount_paid < i.amount_due),0)::text,
    'overdueInstallments', count(*) FILTER (WHERE i.due_date < v_today AND i.amount_paid < i.amount_due),
    'overdueBalance', coalesce(sum(i.amount_due-i.amount_paid) FILTER (WHERE i.due_date < v_today AND i.amount_paid < i.amount_due),0)::text
  ) INTO v_result
  FROM public.installments i
  JOIN public.loans l ON l.tenant_id=i.tenant_id AND l.id=i.loan_id
  WHERE i.tenant_id=p_tenant_id AND l.status='active' AND i.status<>'waived';

  RETURN v_result;
END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.tenant_collections_summary(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.tenant_collections_summary(uuid) TO authenticated;
