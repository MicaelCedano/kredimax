CREATE OR REPLACE FUNCTION app_private.record_loan_payment(
  p_loan_id uuid,p_amount numeric,p_idempotency_key uuid,
  p_payment_method text DEFAULT 'unspecified',p_reference text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_user_id uuid:=(SELECT auth.uid()); v_tenant_id uuid; v_status public.financing_status;
        v_payment_id uuid; v_account_id uuid; v_remaining numeric(14,2); v_outstanding numeric(14,2);
        v_due record; v_apply numeric(14,2); v_new_paid numeric(14,2); v_reference text;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE='42501'; END IF;
  IF p_loan_id IS NULL OR p_amount IS NULL OR p_amount<=0 OR p_amount<>round(p_amount,2)
      OR p_amount>999999999 OR p_idempotency_key IS NULL
      OR p_payment_method IS NULL OR p_payment_method NOT IN ('unspecified','cash','bank_transfer','card','other')
      OR (p_reference IS NOT NULL AND length(p_reference)>120) THEN
    RAISE EXCEPTION 'INVALID_PAYMENT' USING ERRCODE='22023';
  END IF;
  v_reference:=nullif(btrim(p_reference),'');
  SELECT tenant_id,status INTO v_tenant_id,v_status FROM public.loans WHERE id=p_loan_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'LOAN_NOT_FOUND' USING ERRCODE='23503'; END IF;
  IF NOT app_private.has_branch_permission(v_tenant_id,(SELECT branch_id FROM public.loans WHERE id=p_loan_id),'payments.record') THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501';
  END IF;
  SELECT id INTO v_payment_id FROM public.payments WHERE tenant_id=v_tenant_id AND idempotency_key=p_idempotency_key;
  IF FOUND THEN
    IF NOT EXISTS(SELECT 1 FROM public.payments WHERE id=v_payment_id AND loan_id=p_loan_id AND amount=p_amount
      AND received_by=v_user_id AND payment_method=p_payment_method AND reference IS NOT DISTINCT FROM v_reference
      AND payment_type='installment' AND reversed_at IS NULL) THEN
      RAISE EXCEPTION 'IDEMPOTENCY_KEY_REUSED' USING ERRCODE='22023';
    END IF;
    RETURN v_payment_id;
  END IF;
  IF v_status<>'active' THEN RAISE EXCEPTION 'LOAN_NOT_ACTIVE' USING ERRCODE='22023'; END IF;
  SELECT coalesce(sum(amount_due-amount_paid),0) INTO v_outstanding FROM public.installments
    WHERE tenant_id=v_tenant_id AND loan_id=p_loan_id AND status NOT IN ('paid','waived');
  IF p_amount>v_outstanding THEN RAISE EXCEPTION 'PAYMENT_EXCEEDS_BALANCE' USING ERRCODE='22023'; END IF;
  IF v_outstanding<=0 THEN RAISE EXCEPTION 'NO_BALANCE_DUE' USING ERRCODE='22023'; END IF;

  INSERT INTO public.payments(tenant_id,loan_id,idempotency_key,amount,received_by,payment_method,reference,payment_type)
    VALUES(v_tenant_id,p_loan_id,p_idempotency_key,p_amount,v_user_id,p_payment_method,v_reference,'installment')
    ON CONFLICT(tenant_id,idempotency_key) DO NOTHING RETURNING id INTO v_payment_id;
  IF v_payment_id IS NULL THEN
    SELECT id INTO v_payment_id FROM public.payments WHERE tenant_id=v_tenant_id AND idempotency_key=p_idempotency_key;
    IF NOT EXISTS(SELECT 1 FROM public.payments WHERE id=v_payment_id AND loan_id=p_loan_id AND amount=p_amount
      AND received_by=v_user_id AND payment_method=p_payment_method AND reference IS NOT DISTINCT FROM v_reference
      AND payment_type='installment' AND reversed_at IS NULL) THEN
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
      jsonb_build_object('loanId',p_loan_id,'amount',p_amount,'currency','DOP','method',p_payment_method,'reference',v_reference,'paymentType','installment'));
  RETURN v_payment_id;
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION app_private.reverse_loan_payment(p_payment_id uuid,p_reason text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_user_id uuid:=(SELECT auth.uid()); v_tenant_id uuid; v_loan_id uuid;
        v_account_id uuid; v_reversal_id uuid; v_allocation record; v_entry_id uuid; v_amount numeric(14,2); v_type text; v_branch_id uuid;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE='42501'; END IF;
  IF p_payment_id IS NULL OR p_reason IS NULL OR length(btrim(p_reason))<5 OR length(p_reason)>500 THEN
    RAISE EXCEPTION 'INVALID_REVERSAL' USING ERRCODE='22023';
  END IF;
  SELECT p.tenant_id,p.loan_id,p.amount,p.payment_type,l.branch_id INTO v_tenant_id,v_loan_id,v_amount,v_type,v_branch_id
    FROM public.payments p JOIN public.loans l ON l.tenant_id=p.tenant_id AND l.id=p.loan_id
    WHERE p.id=p_payment_id FOR UPDATE OF p,l;
  IF NOT FOUND THEN RAISE EXCEPTION 'PAYMENT_NOT_FOUND' USING ERRCODE='23503'; END IF;
  IF NOT app_private.has_branch_permission(v_tenant_id,v_branch_id,'payments.reverse') THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
  IF EXISTS(SELECT 1 FROM public.payments WHERE id=p_payment_id AND reversed_at IS NOT NULL) THEN
    RAISE EXCEPTION 'PAYMENT_ALREADY_REVERSED' USING ERRCODE='22023';
  END IF;
  SELECT id INTO v_account_id FROM public.ledger_accounts WHERE tenant_id=v_tenant_id AND code='CASH_RECEIPTS';
  SELECT id INTO v_entry_id FROM public.ledger_entries WHERE payment_id=p_payment_id AND entry_type='payment_received';
  IF v_account_id IS NULL OR v_entry_id IS NULL THEN RAISE EXCEPTION 'PAYMENT_LEDGER_ENTRY_MISSING' USING ERRCODE='23503'; END IF;

  IF v_type='down_payment' THEN
    IF EXISTS(SELECT 1 FROM public.payments WHERE tenant_id=v_tenant_id AND loan_id=v_loan_id AND payment_type='installment' AND reversed_at IS NULL) THEN
      RAISE EXCEPTION 'REVERSE_INSTALLMENT_PAYMENTS_FIRST' USING ERRCODE='23514';
    END IF;
    IF (SELECT status FROM public.loans WHERE id=v_loan_id) NOT IN ('active','approved') THEN
      RAISE EXCEPTION 'INITIAL_PAYMENT_REVERSAL_STATUS' USING ERRCODE='23514';
    END IF;
  ELSE
    IF (SELECT coalesce(sum(amount),0) FROM public.payment_allocations WHERE payment_id=p_payment_id)<>v_amount THEN
      RAISE EXCEPTION 'PAYMENT_ALLOCATION_MISMATCH' USING ERRCODE='23514';
    END IF;
    FOR v_allocation IN SELECT installment_id,amount FROM public.payment_allocations
      WHERE tenant_id=v_tenant_id AND payment_id=p_payment_id ORDER BY installment_id FOR UPDATE
    LOOP
      UPDATE public.installments SET amount_paid=amount_paid-v_allocation.amount,
        status=CASE WHEN amount_paid-v_allocation.amount=0 THEN
          CASE WHEN due_date<(now() AT TIME ZONE 'America/Santo_Domingo')::date
            THEN 'overdue'::public.installment_status ELSE 'pending'::public.installment_status END
          ELSE 'partial'::public.installment_status END
        WHERE id=v_allocation.installment_id AND tenant_id=v_tenant_id AND amount_paid>=v_allocation.amount;
      IF NOT FOUND THEN RAISE EXCEPTION 'REVERSAL_BALANCE_CONFLICT' USING ERRCODE='23514'; END IF;
    END LOOP;
    UPDATE public.loans SET status='active' WHERE id=v_loan_id AND tenant_id=v_tenant_id AND status='paid_off';
  END IF;

  UPDATE public.payments SET reversed_at=now(),reversed_by=v_user_id,reversal_reason=btrim(p_reason) WHERE id=p_payment_id;
  IF v_type='down_payment' THEN
    UPDATE public.loans SET status='approved' WHERE id=v_loan_id AND tenant_id=v_tenant_id;
  END IF;
  INSERT INTO public.ledger_entries(tenant_id,account_id,payment_id,amount,entry_type,reverses_entry_id,description,created_by)
    VALUES(v_tenant_id,v_account_id,p_payment_id,-v_amount,'payment_reversal',v_entry_id,'Reverso: '||btrim(p_reason),v_user_id)
    RETURNING id INTO v_reversal_id;
  INSERT INTO public.audit_logs(tenant_id,actor_id,action,entity_type,entity_id,metadata)
    VALUES(v_tenant_id,v_user_id,'payment.reversed','payment',p_payment_id,
      jsonb_build_object('reason',btrim(p_reason),'reversalLedgerEntryId',v_reversal_id,'paymentType',v_type));
  IF v_type='down_payment' THEN
    INSERT INTO public.audit_logs(tenant_id,actor_id,action,entity_type,entity_id,metadata)
      VALUES(v_tenant_id,v_user_id,'loan.activation_reversed','loan',v_loan_id,jsonb_build_object('reason',btrim(p_reason)));
  END IF;
  RETURN v_reversal_id;
END $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app_private.reverse_loan_payment(uuid,text) FROM PUBLIC,anon;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_private.reverse_loan_payment(uuid,text) TO authenticated;
