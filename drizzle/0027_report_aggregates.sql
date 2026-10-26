CREATE OR REPLACE FUNCTION public.tenant_report_summary(p_tenant_id uuid,p_from_date date,p_to_date date)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = '' AS $$
DECLARE v_today date:=(now() AT TIME ZONE 'America/Santo_Domingo')::date; v_result jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE='42501'; END IF;
  IF p_tenant_id IS NULL OR p_from_date IS NULL OR p_to_date IS NULL OR p_to_date<p_from_date
    OR p_to_date-p_from_date>3660 THEN RAISE EXCEPTION 'INVALID_REPORT_RANGE' USING ERRCODE='22023'; END IF;
  IF NOT app_private.has_tenant_permission(p_tenant_id,'reports.read') THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;

  SELECT jsonb_build_object(
    'customers', (SELECT count(*) FROM public.customers WHERE tenant_id=p_tenant_id),
    'devices', (SELECT count(*) FROM public.devices WHERE tenant_id=p_tenant_id),
    'applications', (SELECT count(*) FROM public.credit_applications WHERE tenant_id=p_tenant_id
      AND (created_at AT TIME ZONE 'America/Santo_Domingo')::date BETWEEN p_from_date AND p_to_date),
    'activeLoans', (SELECT count(*) FROM public.loans WHERE tenant_id=p_tenant_id AND status='active'),
    'openReceivable', coalesce((SELECT sum(i.amount_due-i.amount_paid) FROM public.installments i JOIN public.loans l ON l.tenant_id=i.tenant_id AND l.id=i.loan_id
      WHERE i.tenant_id=p_tenant_id AND l.status='active' AND i.status<>'waived' AND i.due_date BETWEEN p_from_date AND p_to_date AND i.amount_paid<i.amount_due),0),
    'paymentsReceived', coalesce((SELECT sum(p.amount) FROM public.payments p WHERE p.tenant_id=p_tenant_id AND p.reversed_at IS NULL
      AND (p.received_at AT TIME ZONE 'America/Santo_Domingo')::date BETWEEN p_from_date AND p_to_date),0),
    'overdueInstallments', (SELECT count(*) FROM public.installments i JOIN public.loans l ON l.tenant_id=i.tenant_id AND l.id=i.loan_id
      WHERE i.tenant_id=p_tenant_id AND l.status='active' AND i.status<>'waived' AND i.due_date BETWEEN p_from_date AND p_to_date
        AND i.due_date<v_today AND i.amount_paid<i.amount_due),
    'overdueBalance', coalesce((SELECT sum(i.amount_due-i.amount_paid) FROM public.installments i JOIN public.loans l ON l.tenant_id=i.tenant_id AND l.id=i.loan_id
      WHERE i.tenant_id=p_tenant_id AND l.status='active' AND i.status<>'waived' AND i.due_date BETWEEN p_from_date AND p_to_date
        AND i.due_date<v_today AND i.amount_paid<i.amount_due),0),
    'asOfDate', v_today
  ) INTO v_result;
  RETURN v_result;
END $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.tenant_report_summary(uuid,date,date) FROM PUBLIC,anon;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.tenant_report_summary(uuid,date,date) TO authenticated;
