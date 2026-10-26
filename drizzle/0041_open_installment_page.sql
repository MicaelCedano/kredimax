CREATE OR REPLACE FUNCTION public.tenant_open_installment_page(
  p_tenant_id uuid,
  p_page integer DEFAULT 1,
  p_page_size integer DEFAULT 50
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_total integer;
  v_rows jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE='42501';
  END IF;
  IF p_tenant_id IS NULL OR p_page IS NULL OR p_page < 1 OR p_page > 100000
    OR p_page_size IS NULL OR p_page_size < 1 OR p_page_size > 100 THEN
    RAISE EXCEPTION 'INVALID_PAGE' USING ERRCODE='22023';
  END IF;
  IF NOT app_private.has_tenant_permission(p_tenant_id,'payments.read') THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501';
  END IF;

  SELECT count(*) INTO v_total
  FROM public.installments i
  JOIN public.loans l ON l.tenant_id=i.tenant_id AND l.id=i.loan_id
  WHERE i.tenant_id=p_tenant_id AND l.status='active' AND i.status<>'waived'
    AND i.amount_paid<i.amount_due;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', q.id, 'loanId', q.loan_id, 'sequence', q.sequence, 'dueDate', q.due_date,
    'amountDue', q.amount_due::text, 'amountPaid', q.amount_paid::text,
    'status', q.status, 'customerId', q.customer_id, 'customerName', q.full_name,
    'branchId', q.branch_id, 'loanStatus', q.loan_status
  ) ORDER BY q.due_date,q.sequence,q.id),'[]'::jsonb)
  INTO v_rows
  FROM (
    SELECT i.id,i.loan_id,i.sequence,i.due_date,i.amount_due,i.amount_paid,i.status,
      l.customer_id,l.branch_id,l.status AS loan_status,c.full_name
    FROM public.installments i
    JOIN public.loans l ON l.tenant_id=i.tenant_id AND l.id=i.loan_id
    JOIN public.customers c ON c.tenant_id=l.tenant_id AND c.id=l.customer_id
    WHERE i.tenant_id=p_tenant_id AND l.status='active' AND i.status<>'waived'
      AND i.amount_paid<i.amount_due
    ORDER BY i.due_date,i.sequence,i.id
    LIMIT p_page_size OFFSET ((p_page-1)*p_page_size)
  ) q;

  RETURN jsonb_build_object('count',v_total,'page',p_page,'pageSize',p_page_size,'rows',v_rows);
END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.tenant_open_installment_page(uuid,integer,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.tenant_open_installment_page(uuid,integer,integer) TO authenticated;
