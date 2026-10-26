CREATE OR REPLACE FUNCTION public.tenant_dashboard_summary(p_tenant_id uuid,p_from_date date,p_to_date date)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = '' AS $$
DECLARE v_today date:=(now() AT TIME ZONE 'America/Santo_Domingo')::date; v_result jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE='42501'; END IF;
  IF p_tenant_id IS NULL OR p_from_date IS NULL OR p_to_date IS NULL OR p_to_date<p_from_date
    OR p_to_date-p_from_date>3660 THEN RAISE EXCEPTION 'INVALID_REPORT_RANGE' USING ERRCODE='22023'; END IF;
  IF NOT app_private.has_tenant_permission(p_tenant_id,'reports.read') THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;

  SELECT jsonb_build_object(
    'customers',(SELECT count(*) FROM public.customers WHERE tenant_id=p_tenant_id),
    'devices',(SELECT count(*) FROM public.devices WHERE tenant_id=p_tenant_id),
    'applications',(SELECT count(*) FROM public.credit_applications WHERE tenant_id=p_tenant_id),
    'activeLoans',(SELECT count(*) FROM public.loans WHERE tenant_id=p_tenant_id AND status='active'),
    'activeBalance',coalesce((SELECT sum(i.amount_due-i.amount_paid) FROM public.installments i
      JOIN public.loans l ON l.tenant_id=i.tenant_id AND l.id=i.loan_id
      WHERE i.tenant_id=p_tenant_id AND l.status='active' AND i.status<>'waived' AND i.amount_paid<i.amount_due),0),
    'allTimePaymentsReceived',coalesce((SELECT sum(p.amount) FROM public.payments p
      WHERE p.tenant_id=p_tenant_id AND p.reversed_at IS NULL),0),
    'overdueInstallments',(SELECT count(*) FROM public.installments i
      JOIN public.loans l ON l.tenant_id=i.tenant_id AND l.id=i.loan_id
      WHERE i.tenant_id=p_tenant_id AND l.status='active' AND i.status<>'waived'
        AND i.due_date<v_today AND i.amount_paid<i.amount_due),
    'overdueBalance',coalesce((SELECT sum(i.amount_due-i.amount_paid) FROM public.installments i
      JOIN public.loans l ON l.tenant_id=i.tenant_id AND l.id=i.loan_id
      WHERE i.tenant_id=p_tenant_id AND l.status='active' AND i.status<>'waived'
        AND i.due_date<v_today AND i.amount_paid<i.amount_due),0),
    'collectionRate',coalesce((SELECT round(100.0*count(*) FILTER (WHERE i.status='paid')/nullif(count(*),0))
      FROM public.installments i JOIN public.loans l ON l.tenant_id=i.tenant_id AND l.id=i.loan_id
      WHERE i.tenant_id=p_tenant_id AND l.status='active' AND i.status<>'waived'
        AND i.due_date>=date_trunc('month',v_today)::date AND i.due_date<(date_trunc('month',v_today)+interval '1 month')::date),0),
    'chart',(SELECT coalesce(jsonb_agg(jsonb_build_object('month',to_char(m.month_start,'YYYY-MM'),
        'amount',coalesce(p.amount,0)) ORDER BY m.month_start),'[]'::jsonb)
      FROM generate_series(date_trunc('month',p_from_date)::date,date_trunc('month',p_to_date)::date,interval '1 month') AS m(month_start)
      LEFT JOIN LATERAL (SELECT sum(pay.amount) AS amount FROM public.payments pay
        WHERE pay.tenant_id=p_tenant_id AND pay.reversed_at IS NULL
          AND (pay.received_at AT TIME ZONE 'America/Santo_Domingo')::date>=m.month_start
          AND (pay.received_at AT TIME ZONE 'America/Santo_Domingo')::date<(m.month_start+interval '1 month')::date) p ON true),
    'upcoming',(SELECT coalesce(jsonb_agg(jsonb_build_object('customer',q.customer,'device',q.device,
        'dueDate',q.due_date,'amount',q.amount,'status',q.status) ORDER BY q.due_date),'[]'::jsonb)
      FROM (SELECT c.full_name AS customer,d.brand||' '||d.model AS device,i.due_date,
          i.amount_due-i.amount_paid AS amount,i.status
        FROM public.installments i JOIN public.loans l ON l.tenant_id=i.tenant_id AND l.id=i.loan_id
        JOIN public.customers c ON c.tenant_id=l.tenant_id AND c.id=l.customer_id
        JOIN public.devices d ON d.id=l.device_id
        WHERE i.tenant_id=p_tenant_id AND l.status='active' AND i.status<>'waived'
          AND i.amount_paid<i.amount_due AND i.due_date BETWEEN v_today AND v_today+7
        ORDER BY i.due_date,i.sequence LIMIT 8) q),
    'recent',(SELECT coalesce(jsonb_agg(jsonb_build_object('title',r.title,'detail',r.detail,
        'date',r.activity_at,'amount',r.amount) ORDER BY r.activity_at DESC),'[]'::jsonb)
      FROM (SELECT * FROM (
        SELECT 'Pago registrado'::text AS title,c.full_name AS detail,p.received_at AS activity_at,p.amount
        FROM public.payments p JOIN public.loans l ON l.tenant_id=p.tenant_id AND l.id=p.loan_id
        JOIN public.customers c ON c.tenant_id=l.tenant_id AND c.id=l.customer_id
        WHERE p.tenant_id=p_tenant_id AND p.reversed_at IS NULL
        UNION ALL
        SELECT 'Solicitud '||a.status,c.full_name,a.created_at,NULL::numeric
        FROM public.credit_applications a JOIN public.customers c ON c.tenant_id=a.tenant_id AND c.id=a.customer_id
        WHERE a.tenant_id=p_tenant_id
      ) activity ORDER BY activity_at DESC LIMIT 8) r)
  ) INTO v_result;
  RETURN v_result;
END $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.tenant_dashboard_summary(uuid,date,date) FROM PUBLIC,anon;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.tenant_dashboard_summary(uuid,date,date) TO authenticated;
