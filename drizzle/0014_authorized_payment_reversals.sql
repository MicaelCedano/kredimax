INSERT INTO public.permissions(key,description) VALUES('payments.reverse','Revertir pagos con asiento compensatorio')
  ON CONFLICT(key) DO NOTHING;
INSERT INTO public.role_permissions(role_id,permission_id)
SELECT r.id,p.id FROM public.roles r CROSS JOIN public.permissions p
WHERE r.key='tenant_admin' AND p.key='payments.reverse' ON CONFLICT DO NOTHING;

ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS reversal_reason text;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS reversed_by uuid REFERENCES auth.users(id);
ALTER TABLE public.ledger_entries ADD CONSTRAINT ledger_reverses_entry_fk
  FOREIGN KEY(reverses_entry_id) REFERENCES public.ledger_entries(id);
CREATE UNIQUE INDEX ledger_one_reversal_per_entry_uidx ON public.ledger_entries(reverses_entry_id)
  WHERE reverses_entry_id IS NOT NULL;

CREATE OR REPLACE FUNCTION app_private.reverse_loan_payment(p_payment_id uuid,p_reason text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_user_id uuid:=(SELECT auth.uid()); v_tenant_id uuid; v_loan_id uuid;
        v_account_id uuid; v_reversal_id uuid; v_allocation record; v_entry_id uuid; v_amount numeric(14,2);
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE='42501'; END IF;
  IF p_payment_id IS NULL OR p_reason IS NULL OR length(btrim(p_reason))<5 OR length(p_reason)>500 THEN
    RAISE EXCEPTION 'INVALID_REVERSAL' USING ERRCODE='22023';
  END IF;
  SELECT tenant_id,loan_id,amount INTO v_tenant_id,v_loan_id,v_amount
    FROM public.payments WHERE id=p_payment_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PAYMENT_NOT_FOUND' USING ERRCODE='23503'; END IF;
  IF NOT app_private.has_tenant_permission(v_tenant_id,'payments.reverse') THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
  IF EXISTS(SELECT 1 FROM public.payments WHERE id=p_payment_id AND reversed_at IS NOT NULL) THEN
    RAISE EXCEPTION 'PAYMENT_ALREADY_REVERSED' USING ERRCODE='22023';
  END IF;
  SELECT id INTO v_account_id FROM public.ledger_accounts WHERE tenant_id=v_tenant_id AND code='CASH_RECEIPTS';
  SELECT id INTO v_entry_id FROM public.ledger_entries WHERE payment_id=p_payment_id AND entry_type='payment_received';
  IF v_account_id IS NULL OR v_entry_id IS NULL THEN RAISE EXCEPTION 'PAYMENT_LEDGER_ENTRY_MISSING' USING ERRCODE='23503'; END IF;
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
  UPDATE public.payments SET reversed_at=now(),reversed_by=v_user_id,reversal_reason=btrim(p_reason) WHERE id=p_payment_id;
  UPDATE public.loans SET status='active' WHERE id=v_loan_id AND tenant_id=v_tenant_id AND status='paid_off';
  INSERT INTO public.ledger_entries(tenant_id,account_id,payment_id,amount,entry_type,reverses_entry_id,description,created_by)
    VALUES(v_tenant_id,v_account_id,p_payment_id,-v_amount,'payment_reversal',v_entry_id,'Reverso: '||btrim(p_reason),v_user_id)
    RETURNING id INTO v_reversal_id;
  INSERT INTO public.audit_logs(tenant_id,actor_id,action,entity_type,entity_id,metadata)
    VALUES(v_tenant_id,v_user_id,'payment.reversed','payment',p_payment_id,
      jsonb_build_object('reason',btrim(p_reason),'reversalLedgerEntryId',v_reversal_id));
  RETURN v_reversal_id;
END $$;
REVOKE ALL ON FUNCTION app_private.reverse_loan_payment(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION app_private.reverse_loan_payment(uuid,text) TO authenticated;
CREATE OR REPLACE FUNCTION public.reverse_loan_payment(p_payment_id uuid,p_reason text)
RETURNS uuid LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  SELECT app_private.reverse_loan_payment(p_payment_id,p_reason)
$$;
REVOKE ALL ON FUNCTION public.reverse_loan_payment(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.reverse_loan_payment(uuid,text) TO authenticated;
