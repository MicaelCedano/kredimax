ALTER TABLE "credit_contracts" ADD COLUMN "contract_evidence_attested" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "credit_contracts" ADD COLUMN "contract_evidence_attested_by" uuid;--> statement-breakpoint
ALTER TABLE "credit_contracts" ADD COLUMN "contract_evidence_attested_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE public.credit_contracts ADD CONSTRAINT contract_evidence_attestation_complete CHECK (
  (contract_evidence_attested AND contract_evidence_attested_by IS NOT NULL AND contract_evidence_attested_at IS NOT NULL)
  OR (NOT contract_evidence_attested AND contract_evidence_attested_by IS NULL AND contract_evidence_attested_at IS NULL)
);--> statement-breakpoint
DROP FUNCTION public.activate_approved_loan(uuid,text,text,uuid,text,date);--> statement-breakpoint
DROP FUNCTION app_private.activate_approved_loan(uuid,text,text,uuid,text,date);--> statement-breakpoint
CREATE FUNCTION app_private.activate_approved_loan(
  p_loan_id uuid,p_payment_method text,p_reference text,p_idempotency_key uuid,
  p_signed_document_path text,p_contract_evidence_attested boolean,p_delivery_date date
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_user_id uuid:=(SELECT auth.uid()); v_loan public.loans%ROWTYPE; v_payment_id uuid;
        v_account_id uuid; v_reference text;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE='42501'; END IF;
  IF p_loan_id IS NULL OR p_idempotency_key IS NULL
    OR p_payment_method NOT IN ('cash','bank_transfer','card','other')
    OR (p_reference IS NOT NULL AND length(p_reference)>120)
    OR p_signed_document_path IS NULL OR length(btrim(p_signed_document_path))<3 OR length(p_signed_document_path)>1000
    OR p_contract_evidence_attested IS DISTINCT FROM TRUE
    OR p_delivery_date IS NULL OR p_delivery_date>(now() AT TIME ZONE 'America/Santo_Domingo')::date THEN
    RAISE EXCEPTION 'INVALID_ACTIVATION_EVIDENCE' USING ERRCODE='22023';
  END IF;
  SELECT * INTO v_loan FROM public.loans WHERE id=p_loan_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'LOAN_NOT_FOUND' USING ERRCODE='23503'; END IF;
  IF NOT app_private.has_branch_permission(v_loan.tenant_id,v_loan.branch_id,'financing.approve')
    OR NOT app_private.has_branch_permission(v_loan.tenant_id,v_loan.branch_id,'payments.record') THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501';
  END IF;
  v_reference:=nullif(btrim(p_reference),'');
  SELECT id INTO v_payment_id FROM public.payments WHERE tenant_id=v_loan.tenant_id AND idempotency_key=p_idempotency_key;
  IF FOUND THEN
    IF NOT EXISTS(SELECT 1 FROM public.payments WHERE id=v_payment_id AND loan_id=p_loan_id AND amount=v_loan.down_payment
      AND payment_type='down_payment' AND payment_method=p_payment_method AND reference IS NOT DISTINCT FROM v_reference
      AND received_by=v_user_id AND reversed_at IS NULL)
      OR v_loan.status<>'active'
      OR NOT EXISTS(SELECT 1 FROM public.credit_contracts c WHERE c.tenant_id=v_loan.tenant_id AND c.id=v_loan.contract_id
        AND c.document_path=p_signed_document_path AND c.signed_by=v_user_id
        AND c.contract_evidence_attested AND c.contract_evidence_attested_by=v_user_id AND c.contract_evidence_attested_at IS NOT NULL)
      OR v_loan.delivered_at<>p_delivery_date OR v_loan.delivered_by<>v_user_id THEN
      RAISE EXCEPTION 'IDEMPOTENCY_KEY_REUSED' USING ERRCODE='22023';
    END IF;
    RETURN v_payment_id;
  END IF;
  IF v_loan.status<>'approved' THEN RAISE EXCEPTION 'LOAN_NOT_APPROVED' USING ERRCODE='22023'; END IF;
  IF v_loan.down_payment<=0 THEN RAISE EXCEPTION 'INITIAL_PAYMENT_REQUIRED' USING ERRCODE='22023'; END IF;

  INSERT INTO public.ledger_accounts(tenant_id,code,name,currency)
    VALUES(v_loan.tenant_id,'CASH_RECEIPTS','Cobros recibidos','DOP') ON CONFLICT(tenant_id,code) DO NOTHING;
  SELECT id INTO v_account_id FROM public.ledger_accounts WHERE tenant_id=v_loan.tenant_id AND code='CASH_RECEIPTS';
  INSERT INTO public.payments(tenant_id,loan_id,idempotency_key,amount,received_by,payment_method,reference,payment_type)
    VALUES(v_loan.tenant_id,p_loan_id,p_idempotency_key,v_loan.down_payment,v_user_id,p_payment_method,v_reference,'down_payment')
    RETURNING id INTO v_payment_id;
  INSERT INTO public.ledger_entries(tenant_id,account_id,payment_id,amount,entry_type,description,created_by)
    VALUES(v_loan.tenant_id,v_account_id,v_payment_id,v_loan.down_payment,'payment_received','Pago inicial registrado para formalización',v_user_id);
  UPDATE public.credit_contracts SET signed_at=clock_timestamp(),signed_by=v_user_id,document_path=btrim(p_signed_document_path),
      contract_evidence_attested=true,contract_evidence_attested_by=v_user_id,contract_evidence_attested_at=clock_timestamp()
    WHERE tenant_id=v_loan.tenant_id AND id=v_loan.contract_id;
  UPDATE public.loans SET status='active',delivered_at=p_delivery_date,delivered_by=v_user_id,
      activated_at=clock_timestamp(),activated_by=v_user_id
    WHERE tenant_id=v_loan.tenant_id AND id=p_loan_id AND status='approved';
  IF NOT FOUND THEN RAISE EXCEPTION 'LOAN_ACTIVATION_CONFLICT' USING ERRCODE='40001'; END IF;
  INSERT INTO public.audit_logs(tenant_id,actor_id,action,entity_type,entity_id,metadata)
    VALUES(v_loan.tenant_id,v_user_id,'loan.activated','loan',p_loan_id,
      jsonb_build_object('initialPaymentId',v_payment_id,'initialAmount',v_loan.down_payment,'contractDocumentPath',btrim(p_signed_document_path),'contractEvidenceAttested',true,'deliveryDate',p_delivery_date));
  INSERT INTO public.audit_logs(tenant_id,actor_id,action,entity_type,entity_id,metadata)
    VALUES(v_loan.tenant_id,v_user_id,'payment.recorded','payment',v_payment_id,
      jsonb_build_object('loanId',p_loan_id,'amount',v_loan.down_payment,'currency','DOP','method',p_payment_method,'paymentType','down_payment','reference',v_reference));
  RETURN v_payment_id;
END $$;--> statement-breakpoint
REVOKE ALL ON FUNCTION app_private.activate_approved_loan(uuid,text,text,uuid,text,boolean,date) FROM PUBLIC,anon;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_private.activate_approved_loan(uuid,text,text,uuid,text,boolean,date) TO authenticated;--> statement-breakpoint
CREATE FUNCTION public.activate_approved_loan(
  p_loan_id uuid,p_payment_method text,p_reference text,p_idempotency_key uuid,
  p_signed_document_path text,p_contract_evidence_attested boolean,p_delivery_date date
) RETURNS uuid LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  SELECT app_private.activate_approved_loan(p_loan_id,p_payment_method,p_reference,p_idempotency_key,p_signed_document_path,p_contract_evidence_attested,p_delivery_date)
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.activate_approved_loan(uuid,text,text,uuid,text,boolean,date) FROM PUBLIC,anon;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.activate_approved_loan(uuid,text,text,uuid,text,boolean,date) TO authenticated;
