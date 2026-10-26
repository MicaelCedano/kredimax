CREATE OR REPLACE FUNCTION public.tenant_report_payment_details(
  p_tenant_id uuid,
  p_from_date date,
  p_to_date date
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_payments jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE='42501';
  END IF;
  IF p_tenant_id IS NULL OR p_from_date IS NULL OR p_to_date IS NULL
    OR p_to_date < p_from_date OR p_to_date - p_from_date > 3660 THEN
    RAISE EXCEPTION 'INVALID_REPORT_RANGE' USING ERRCODE='22023';
  END IF;
  IF NOT app_private.has_tenant_permission(p_tenant_id,'reports.read')
    OR NOT app_private.has_tenant_permission(p_tenant_id,'payments.read') THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501';
  END IF;

  SELECT coalesce(jsonb_agg(
    jsonb_build_object(
      'id', p.id,
      'loanId', p.loan_id,
      'amount', p.amount::text,
      'currency', p.currency,
      'receivedAt', p.received_at,
      'receivedBy', p.received_by,
      'paymentMethod', p.payment_method,
      'reference', p.reference,
      'paymentType', p.payment_type,
      'reversedAt', p.reversed_at,
      'reversedBy', p.reversed_by,
      'reversalReason', p.reversal_reason,
      'allocations', coalesce((
        SELECT jsonb_agg(jsonb_build_object(
          'installmentId', a.installment_id,
          'amount', a.amount::text
        ) ORDER BY a.installment_id)
        FROM public.payment_allocations a
        WHERE a.tenant_id=p.tenant_id AND a.payment_id=p.id
      ), '[]'::jsonb)
    ) ORDER BY p.received_at, p.id
  ), '[]'::jsonb)
  INTO v_payments
  FROM public.payments p
  WHERE p.tenant_id=p_tenant_id
    AND (p.received_at AT TIME ZONE 'America/Santo_Domingo')::date BETWEEN p_from_date AND p_to_date;

  RETURN v_payments;
END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.tenant_report_payment_details(uuid,date,date) FROM PUBLIC,anon;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.tenant_report_payment_details(uuid,date,date) TO authenticated;
