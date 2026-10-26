CREATE OR REPLACE FUNCTION app_private.record_loan_payment(
  p_loan_id uuid,
  p_amount numeric,
  p_idempotency_key uuid
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_tenant_id uuid;
  v_status public.financing_status;
  v_payment_id uuid;
  v_account_id uuid;
  v_remaining numeric(14,2);
  v_outstanding numeric(14,2);
  v_due record;
  v_apply numeric(14,2);
  v_new_paid numeric(14,2);
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE='42501'; END IF;
  IF p_amount IS NULL OR p_amount <= 0 OR p_amount <> round(p_amount,2) OR p_idempotency_key IS NULL THEN
    RAISE EXCEPTION 'INVALID_PAYMENT' USING ERRCODE='22023';
  END IF;
  SELECT l.tenant_id,l.status INTO v_tenant_id,v_status
  FROM public.loans l WHERE l.id=p_loan_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'LOAN_NOT_FOUND' USING ERRCODE='23503'; END IF;
  IF NOT app_private.has_tenant_permission(v_tenant_id,'payments.record') THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501';
  END IF;
  IF v_status <> 'active' THEN RAISE EXCEPTION 'LOAN_NOT_ACTIVE' USING ERRCODE='22023'; END IF;

  SELECT p.id INTO v_payment_id FROM public.payments p
  WHERE p.tenant_id=v_tenant_id AND p.idempotency_key=p_idempotency_key;
  IF FOUND THEN
    IF NOT EXISTS (SELECT 1 FROM public.payments p WHERE p.id=v_payment_id AND p.loan_id=p_loan_id AND p.amount=p_amount AND p.received_by=v_user_id) THEN
      RAISE EXCEPTION 'IDEMPOTENCY_KEY_REUSED' USING ERRCODE='22023';
    END IF;
    RETURN v_payment_id;
  END IF;

  SELECT coalesce(sum(i.amount_due-i.amount_paid),0) INTO v_outstanding
  FROM public.installments i WHERE i.tenant_id=v_tenant_id AND i.loan_id=p_loan_id
    AND i.status NOT IN ('paid','waived');
  IF p_amount > v_outstanding THEN RAISE EXCEPTION 'PAYMENT_EXCEEDS_BALANCE' USING ERRCODE='22023'; END IF;
  IF v_outstanding <= 0 THEN RAISE EXCEPTION 'NO_BALANCE_DUE' USING ERRCODE='22023'; END IF;

  INSERT INTO public.payments(tenant_id,loan_id,idempotency_key,amount,received_by)
  VALUES(v_tenant_id,p_loan_id,p_idempotency_key,p_amount,v_user_id) RETURNING id INTO v_payment_id;
  INSERT INTO public.ledger_accounts(tenant_id,code,name,currency)
  VALUES(v_tenant_id,'CASH_RECEIPTS','Cobros recibidos','DOP')
  ON CONFLICT(tenant_id,code) DO NOTHING;
  SELECT a.id INTO v_account_id FROM public.ledger_accounts a
  WHERE a.tenant_id=v_tenant_id AND a.code='CASH_RECEIPTS';
  v_remaining := p_amount;
  FOR v_due IN
    SELECT i.id,i.amount_due,i.amount_paid,i.due_date FROM public.installments i
    WHERE i.tenant_id=v_tenant_id AND i.loan_id=p_loan_id AND i.status NOT IN ('paid','waived')
      AND i.amount_paid < i.amount_due
    ORDER BY i.due_date,i.sequence FOR UPDATE
  LOOP
    EXIT WHEN v_remaining <= 0;
    v_apply := least(v_remaining,v_due.amount_due-v_due.amount_paid);
    v_new_paid := v_due.amount_paid+v_apply;
    INSERT INTO public.payment_allocations(tenant_id,payment_id,installment_id,amount)
    VALUES(v_tenant_id,v_payment_id,v_due.id,v_apply);
    UPDATE public.installments SET amount_paid=v_new_paid,
      status=CASE WHEN v_new_paid>=v_due.amount_due THEN 'paid'::public.installment_status
                  WHEN v_due.due_date<current_date THEN 'overdue'::public.installment_status
                  ELSE 'partial'::public.installment_status END
    WHERE id=v_due.id AND tenant_id=v_tenant_id;
    v_remaining := v_remaining-v_apply;
  END LOOP;
  IF v_remaining <> 0 THEN RAISE EXCEPTION 'PAYMENT_ALLOCATION_FAILED' USING ERRCODE='22023'; END IF;
  INSERT INTO public.ledger_entries(tenant_id,account_id,payment_id,amount,entry_type,description,created_by)
  VALUES(v_tenant_id,v_account_id,v_payment_id,p_amount,'payment_received','Pago recibido y aplicado a cuotas',v_user_id);
  INSERT INTO public.audit_logs(tenant_id,actor_id,action,entity_type,entity_id,metadata)
  VALUES(v_tenant_id,v_user_id,'payment.recorded','payment',v_payment_id,
    jsonb_build_object('loanId',p_loan_id,'amount',p_amount,'currency','DOP'));
  RETURN v_payment_id;
END;
$$;
REVOKE ALL ON FUNCTION app_private.record_loan_payment(uuid,numeric,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION app_private.record_loan_payment(uuid,numeric,uuid) TO authenticated;
CREATE OR REPLACE FUNCTION public.record_loan_payment(p_loan_id uuid,p_amount numeric,p_idempotency_key uuid)
RETURNS uuid LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  SELECT app_private.record_loan_payment(p_loan_id,p_amount,p_idempotency_key)
$$;
REVOKE ALL ON FUNCTION public.record_loan_payment(uuid,numeric,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.record_loan_payment(uuid,numeric,uuid) TO authenticated;
