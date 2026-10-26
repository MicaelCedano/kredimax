-- Custom SQL migration file, put your code below! --
CREATE OR REPLACE FUNCTION public.tenant_payment_reconciliation(
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
  v_result jsonb;
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

  WITH scoped_payments AS (
    SELECT p.id,p.tenant_id,p.amount,p.payment_type,p.reversed_at
    FROM public.payments p
    WHERE p.tenant_id=p_tenant_id
      AND (p.received_at AT TIME ZONE 'America/Santo_Domingo')::date BETWEEN p_from_date AND p_to_date
  ), ledger AS (
    SELECT le.payment_id,
      coalesce(sum(le.amount),0)::numeric AS ledger_net,
      count(*) FILTER (WHERE le.entry_type='payment_received')::integer AS receipt_count,
      coalesce(sum(le.amount) FILTER (WHERE le.entry_type='payment_received'),0)::numeric AS receipt_amount,
      count(*) FILTER (WHERE le.entry_type='payment_reversal')::integer AS reversal_count,
      coalesce(sum(le.amount) FILTER (WHERE le.entry_type='payment_reversal'),0)::numeric AS reversal_amount,
      count(*) FILTER (WHERE le.entry_type='payment_reversal' AND le.reverses_entry_id IS NOT NULL)::integer AS linked_reversal_count
    FROM public.ledger_entries le
    JOIN scoped_payments p ON p.id=le.payment_id AND p.tenant_id=le.tenant_id
    GROUP BY le.payment_id
  ), allocations AS (
    SELECT a.payment_id,coalesce(sum(a.amount),0)::numeric AS allocated_amount
    FROM public.payment_allocations a
    JOIN scoped_payments p ON p.id=a.payment_id AND p.tenant_id=a.tenant_id
    GROUP BY a.payment_id
  ), checks AS (
    SELECT p.id,p.amount,p.payment_type,p.reversed_at,
      coalesce(l.ledger_net,0)::numeric AS ledger_net,
      coalesce(l.receipt_count,0)::integer AS receipt_count,
      coalesce(l.receipt_amount,0)::numeric AS receipt_amount,
      coalesce(l.reversal_count,0)::integer AS reversal_count,
      coalesce(l.reversal_amount,0)::numeric AS reversal_amount,
      coalesce(l.linked_reversal_count,0)::integer AS linked_reversal_count,
      coalesce(a.allocated_amount,0)::numeric AS allocated_amount
    FROM scoped_payments p
    LEFT JOIN ledger l ON l.payment_id=p.id
    LEFT JOIN allocations a ON a.payment_id=p.id
  )
  SELECT jsonb_build_object(
    'from',p_from_date,
    'to',p_to_date,
    'paymentCount',count(*),
    'activePaymentCount',count(*) FILTER (WHERE reversed_at IS NULL),
    'reversedPaymentCount',count(*) FILTER (WHERE reversed_at IS NOT NULL),
    'expectedLedgerNet',coalesce(sum(amount) FILTER (WHERE reversed_at IS NULL),0)::text,
    'actualLedgerNet',coalesce(sum(ledger_net),0)::text,
    'ledgerDifference',(coalesce(sum(ledger_net),0)-coalesce(sum(amount) FILTER (WHERE reversed_at IS NULL),0))::text,
    'receiptMismatchCount',count(*) FILTER (WHERE receipt_count<>1 OR receipt_amount<>amount),
    'allocationMismatchCount',count(*) FILTER (
      WHERE (payment_type='installment' AND allocated_amount<>amount)
        OR (payment_type='down_payment' AND allocated_amount<>0)
        OR payment_type NOT IN ('installment','down_payment')
    ),
    'reversalMismatchCount',count(*) FILTER (
      WHERE (reversed_at IS NOT NULL AND (reversal_count<>1 OR reversal_amount<>-amount OR linked_reversal_count<>1))
        OR (reversed_at IS NULL AND reversal_count<>0)
    ),
    'scope','Pagos visibles según los permisos RLS de la sucursal.',
    'interpretation','Conciliación interna del libro de pagos. No compara depósitos bancarios ni cierra caja.'
  ) INTO v_result
  FROM checks;

  RETURN v_result;
END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.tenant_payment_reconciliation(uuid,date,date) FROM PUBLIC,anon;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.tenant_payment_reconciliation(uuid,date,date) TO authenticated;
