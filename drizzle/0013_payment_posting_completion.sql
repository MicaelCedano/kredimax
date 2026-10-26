ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS payment_method varchar(32) NOT NULL DEFAULT 'unspecified';
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS reference text;
ALTER TABLE public.payments ADD CONSTRAINT payments_method_valid_ck CHECK(payment_method IN ('unspecified','cash','bank_transfer','card','other'));
ALTER TABLE public.payments ADD CONSTRAINT payments_reference_length_ck CHECK(reference IS NULL OR length(reference)<=120);

CREATE OR REPLACE FUNCTION app_private.record_loan_payment(
  p_loan_id uuid,p_amount numeric,p_idempotency_key uuid,
  p_payment_method text DEFAULT 'unspecified',p_reference text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_user_id uuid:=(SELECT auth.uid()); v_tenant_id uuid; v_status public.financing_status;
        v_payment_id uuid; v_account_id uuid; v_remaining numeric(14,2); v_outstanding numeric(14,2);
        v_due record; v_apply numeric(14,2); v_new_paid numeric(14,2);
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE='42501'; END IF;
  IF p_loan_id IS NULL OR p_amount IS NULL OR p_amount<=0 OR p_amount<>round(p_amount,2)
      OR p_amount>999999999 OR p_idempotency_key IS NULL
      OR p_payment_method NOT IN ('unspecified','cash','bank_transfer','card','other')
      OR (p_reference IS NOT NULL AND length(p_reference)>120) THEN
    RAISE EXCEPTION 'INVALID_PAYMENT' USING ERRCODE='22023';
  END IF;
  SELECT tenant_id,status INTO v_tenant_id,v_status FROM public.loans WHERE id=p_loan_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'LOAN_NOT_FOUND' USING ERRCODE='23503'; END IF;
  IF NOT app_private.has_tenant_permission(v_tenant_id,'payments.record') THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;

  -- Idempotent retries are checked before loan status/balance, including after final payoff.
  SELECT id INTO v_payment_id FROM public.payments WHERE tenant_id=v_tenant_id AND idempotency_key=p_idempotency_key;
  IF FOUND THEN
    IF NOT EXISTS(SELECT 1 FROM public.payments WHERE id=v_payment_id AND loan_id=p_loan_id AND amount=p_amount
      AND received_by=v_user_id AND payment_method=p_payment_method AND reference IS NOT DISTINCT FROM p_reference AND reversed_at IS NULL) THEN
      RAISE EXCEPTION 'IDEMPOTENCY_KEY_REUSED' USING ERRCODE='22023';
    END IF;
    RETURN v_payment_id;
  END IF;
  IF v_status<>'active' THEN RAISE EXCEPTION 'LOAN_NOT_ACTIVE' USING ERRCODE='22023'; END IF;
  SELECT coalesce(sum(amount_due-amount_paid),0) INTO v_outstanding FROM public.installments
    WHERE tenant_id=v_tenant_id AND loan_id=p_loan_id AND status NOT IN ('paid','waived');
  IF p_amount>v_outstanding THEN RAISE EXCEPTION 'PAYMENT_EXCEEDS_BALANCE' USING ERRCODE='22023'; END IF;
  IF v_outstanding<=0 THEN RAISE EXCEPTION 'NO_BALANCE_DUE' USING ERRCODE='22023'; END IF;

  INSERT INTO public.payments(tenant_id,loan_id,idempotency_key,amount,received_by,payment_method,reference)
    VALUES(v_tenant_id,p_loan_id,p_idempotency_key,p_amount,v_user_id,p_payment_method,NULLIF(btrim(p_reference),''))
    ON CONFLICT(tenant_id,idempotency_key) DO NOTHING RETURNING id INTO v_payment_id;
  IF v_payment_id IS NULL THEN
    SELECT id INTO v_payment_id FROM public.payments WHERE tenant_id=v_tenant_id AND idempotency_key=p_idempotency_key;
    IF NOT EXISTS(SELECT 1 FROM public.payments WHERE id=v_payment_id AND loan_id=p_loan_id AND amount=p_amount
      AND received_by=v_user_id AND payment_method=p_payment_method AND reference IS NOT DISTINCT FROM NULLIF(btrim(p_reference),'') AND reversed_at IS NULL) THEN
      RAISE EXCEPTION 'IDEMPOTENCY_KEY_REUSED' USING ERRCODE='22023';
    END IF;
    RETURN v_payment_id;
  END IF;

  INSERT INTO public.ledger_accounts(tenant_id,code,name,currency) VALUES(v_tenant_id,'CASH_RECEIPTS','Cobros recibidos','DOP')
    ON CONFLICT(tenant_id,code) DO NOTHING;
  SELECT id INTO v_account_id FROM public.ledger_accounts WHERE tenant_id=v_tenant_id AND code='CASH_RECEIPTS';
  v_remaining:=p_amount;
  FOR v_due IN SELECT id,amount_due,amount_paid,due_date FROM public.installments
    WHERE tenant_id=v_tenant_id AND loan_id=p_loan_id AND status NOT IN ('paid','waived') AND amount_paid<amount_due
    ORDER BY due_date,sequence FOR UPDATE
  LOOP
    EXIT WHEN v_remaining<=0;
    v_apply:=least(v_remaining,v_due.amount_due-v_due.amount_paid);
    v_new_paid:=v_due.amount_paid+v_apply;
    INSERT INTO public.payment_allocations(tenant_id,payment_id,installment_id,loan_id,amount)
      VALUES(v_tenant_id,v_payment_id,v_due.id,p_loan_id,v_apply);
    UPDATE public.installments SET amount_paid=v_new_paid,
      status=CASE WHEN v_new_paid>=v_due.amount_due THEN 'paid'::public.installment_status
        WHEN v_due.due_date<(now() AT TIME ZONE 'America/Santo_Domingo')::date THEN 'overdue'::public.installment_status
        ELSE 'partial'::public.installment_status END
      WHERE id=v_due.id AND tenant_id=v_tenant_id;
    v_remaining:=v_remaining-v_apply;
  END LOOP;
  IF v_remaining<>0 THEN RAISE EXCEPTION 'PAYMENT_ALLOCATION_FAILED' USING ERRCODE='23514'; END IF;
  INSERT INTO public.ledger_entries(tenant_id,account_id,payment_id,amount,entry_type,description,created_by)
    VALUES(v_tenant_id,v_account_id,v_payment_id,p_amount,'payment_received','Pago recibido y aplicado a cuotas',v_user_id);
  UPDATE public.loans SET status='paid_off' WHERE id=p_loan_id AND tenant_id=v_tenant_id
    AND NOT EXISTS(SELECT 1 FROM public.installments WHERE tenant_id=v_tenant_id AND loan_id=p_loan_id
      AND status<>'waived' AND amount_paid<amount_due);
  INSERT INTO public.audit_logs(tenant_id,actor_id,action,entity_type,entity_id,metadata)
    VALUES(v_tenant_id,v_user_id,'payment.recorded','payment',v_payment_id,
      jsonb_build_object('loanId',p_loan_id,'amount',p_amount,'currency','DOP','method',p_payment_method,'reference',p_reference));
  RETURN v_payment_id;
END $$;
REVOKE ALL ON FUNCTION app_private.record_loan_payment(uuid,numeric,uuid,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION app_private.record_loan_payment(uuid,numeric,uuid,text,text) TO authenticated;
CREATE OR REPLACE FUNCTION public.record_loan_payment(
  p_loan_id uuid,p_amount numeric,p_idempotency_key uuid,p_payment_method text DEFAULT 'unspecified',p_reference text DEFAULT NULL
) RETURNS uuid LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  SELECT app_private.record_loan_payment(p_loan_id,p_amount,p_idempotency_key,p_payment_method,p_reference)
$$;
REVOKE ALL ON FUNCTION public.record_loan_payment(uuid,numeric,uuid,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.record_loan_payment(uuid,numeric,uuid,text,text) TO authenticated;
CREATE OR REPLACE FUNCTION public.record_loan_payment(p_loan_id uuid,p_amount numeric,p_idempotency_key uuid)
RETURNS uuid LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  SELECT app_private.record_loan_payment(p_loan_id,p_amount,p_idempotency_key,'unspecified',NULL)
$$;
REVOKE ALL ON FUNCTION public.record_loan_payment(uuid,numeric,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.record_loan_payment(uuid,numeric,uuid) TO authenticated;
