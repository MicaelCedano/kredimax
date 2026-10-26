-- Evidence belongs to the original payment and is retained on reversal. Historical payments are untouched.
CREATE TABLE public.payment_evidence (
  payment_id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  image_data bytea NOT NULL,
  content_type text NOT NULL DEFAULT 'image/webp' CHECK(content_type='image/webp'),
  image_sha256 text GENERATED ALWAYS AS (encode(sha256(image_data),'hex')) STORED,
  evidence_kind text NOT NULL CHECK(evidence_kind IN ('bank_transfer_voucher','signed_cash_receipt','other')),
  signed_receipt_attested boolean NOT NULL DEFAULT false,
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY(tenant_id,payment_id) REFERENCES public.payments(tenant_id,id),
  CHECK(octet_length(image_data) BETWEEN 12 AND 2097152),
  CHECK(substring(image_data FROM 1 FOR 4)=decode('52494646','hex') AND substring(image_data FROM 9 FOR 4)=decode('57454250','hex')),
  CHECK(evidence_kind<>'signed_cash_receipt' OR signed_receipt_attested)
);
CREATE INDEX payment_evidence_tenant_idx ON public.payment_evidence(tenant_id);
ALTER TABLE public.payment_evidence ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.payment_evidence FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.payment_evidence TO authenticated;
CREATE POLICY payment_evidence_read ON public.payment_evidence FOR SELECT TO authenticated USING(
  app_private.has_tenant_permission(tenant_id,'payments.read') AND EXISTS(
    SELECT 1 FROM public.payments p WHERE p.tenant_id=payment_evidence.tenant_id AND p.id=payment_evidence.payment_id));
--> statement-breakpoint
CREATE FUNCTION app_private.validate_payment_evidence(p_method text,p_image bytea,p_attested boolean)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
  IF p_method IS NULL OR p_method NOT IN ('cash','bank_transfer','card','other') THEN RAISE EXCEPTION 'INVALID_PAYMENT_METHOD' USING ERRCODE='22023'; END IF;
  IF p_method IN ('cash','bank_transfer') AND p_image IS NULL THEN RAISE EXCEPTION 'PAYMENT_EVIDENCE_REQUIRED' USING ERRCODE='22023'; END IF;
  IF p_method='cash' AND p_attested IS DISTINCT FROM true THEN RAISE EXCEPTION 'SIGNED_CASH_RECEIPT_REQUIRED' USING ERRCODE='22023'; END IF;
  IF p_image IS NOT NULL AND (octet_length(p_image) NOT BETWEEN 12 AND 2097152
    OR substring(p_image FROM 1 FOR 4)<>decode('52494646','hex') OR substring(p_image FROM 9 FOR 4)<>decode('57454250','hex'))
    THEN RAISE EXCEPTION 'INVALID_PAYMENT_EVIDENCE_IMAGE' USING ERRCODE='22023'; END IF;
END $$;
REVOKE ALL ON FUNCTION app_private.validate_payment_evidence(text,bytea,boolean) FROM PUBLIC,anon,authenticated;
--> statement-breakpoint
CREATE FUNCTION app_private.attach_payment_evidence(p_payment_id uuid,p_image bytea,p_attested boolean)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE v_payment public.payments%ROWTYPE; v_existing public.payment_evidence%ROWTYPE; v_kind text; v_branch uuid;
BEGIN
  SELECT * INTO v_payment FROM public.payments WHERE id=p_payment_id FOR UPDATE;
  IF NOT FOUND OR auth.uid() IS NULL OR v_payment.received_by IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
  PERFORM app_private.validate_payment_evidence(v_payment.payment_method,p_image,p_attested);
  IF p_image IS NULL THEN RETURN; END IF;
  v_kind:=CASE v_payment.payment_method WHEN 'cash' THEN 'signed_cash_receipt' WHEN 'bank_transfer' THEN 'bank_transfer_voucher' ELSE 'other' END;
  SELECT * INTO v_existing FROM public.payment_evidence WHERE payment_id=p_payment_id;
  IF FOUND THEN
    IF v_existing.image_sha256<>encode(sha256(p_image),'hex') OR v_existing.evidence_kind<>v_kind THEN
      RAISE EXCEPTION 'IDEMPOTENCY_EVIDENCE_CONFLICT' USING ERRCODE='22023';
    END IF;
    RETURN;
  END IF;
  INSERT INTO public.payment_evidence(payment_id,tenant_id,image_data,evidence_kind,signed_receipt_attested,created_by)
    VALUES(p_payment_id,v_payment.tenant_id,p_image,v_kind,v_payment.payment_method='cash' AND p_attested,auth.uid());
  SELECT branch_id INTO v_branch FROM public.loans WHERE id=v_payment.loan_id AND tenant_id=v_payment.tenant_id;
  INSERT INTO public.audit_logs(tenant_id,branch_id,actor_id,action,entity_type,entity_id,metadata)
    VALUES(v_payment.tenant_id,v_branch,auth.uid(),'payment.evidence_recorded','payment',p_payment_id,
      jsonb_build_object('kind',v_kind,'sha256',encode(sha256(p_image),'hex'),'signedReceiptAttested',v_payment.payment_method='cash' AND p_attested));
END $$;
REVOKE ALL ON FUNCTION app_private.attach_payment_evidence(uuid,bytea,boolean) FROM PUBLIC,anon,authenticated;
--> statement-breakpoint
CREATE FUNCTION app_private.record_loan_payment_with_evidence(
  p_loan_id uuid,p_amount numeric,p_idempotency_key uuid,p_payment_method text,p_reference text,p_evidence_image bytea,p_signed_receipt_attested boolean
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_payment uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE='42501'; END IF;
  PERFORM app_private.validate_payment_evidence(p_payment_method,p_evidence_image,p_signed_receipt_attested);
  v_payment:=app_private.record_loan_payment(p_loan_id,p_amount,p_idempotency_key,p_payment_method,p_reference);
  PERFORM app_private.attach_payment_evidence(v_payment,p_evidence_image,p_signed_receipt_attested);
  RETURN v_payment;
END $$;
REVOKE ALL ON FUNCTION app_private.record_loan_payment_with_evidence(uuid,numeric,uuid,text,text,bytea,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION app_private.record_loan_payment_with_evidence(uuid,numeric,uuid,text,text,bytea,boolean) TO authenticated;
CREATE FUNCTION public.record_loan_payment_with_evidence(
  p_loan_id uuid,p_amount numeric,p_idempotency_key uuid,p_payment_method text,p_reference text,p_evidence_image bytea,p_signed_receipt_attested boolean
) RETURNS uuid LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$
  SELECT app_private.record_loan_payment_with_evidence(p_loan_id,p_amount,p_idempotency_key,p_payment_method,p_reference,p_evidence_image,p_signed_receipt_attested)
$$;
REVOKE ALL ON FUNCTION public.record_loan_payment_with_evidence(uuid,numeric,uuid,text,text,bytea,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.record_loan_payment_with_evidence(uuid,numeric,uuid,text,text,bytea,boolean) TO authenticated;
--> statement-breakpoint
CREATE FUNCTION app_private.activate_approved_loan_with_evidence(
  p_loan_id uuid,p_payment_method text,p_reference text,p_idempotency_key uuid,p_signed_document_path text,p_contract_evidence_attested boolean,p_delivery_date date,
  p_evidence_image bytea,p_signed_receipt_attested boolean
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_payment uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE='42501'; END IF;
  PERFORM app_private.validate_payment_evidence(p_payment_method,p_evidence_image,p_signed_receipt_attested);
  v_payment:=app_private.activate_approved_loan(p_loan_id,p_payment_method,p_reference,p_idempotency_key,p_signed_document_path,p_contract_evidence_attested,p_delivery_date);
  PERFORM app_private.attach_payment_evidence(v_payment,p_evidence_image,p_signed_receipt_attested);
  RETURN v_payment;
END $$;
REVOKE ALL ON FUNCTION app_private.activate_approved_loan_with_evidence(uuid,text,text,uuid,text,boolean,date,bytea,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION app_private.activate_approved_loan_with_evidence(uuid,text,text,uuid,text,boolean,date,bytea,boolean) TO authenticated;
CREATE FUNCTION public.activate_approved_loan_with_evidence(
  p_loan_id uuid,p_payment_method text,p_reference text,p_idempotency_key uuid,p_signed_document_path text,p_contract_evidence_attested boolean,p_delivery_date date,
  p_evidence_image bytea,p_signed_receipt_attested boolean
) RETURNS uuid LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$
  SELECT app_private.activate_approved_loan_with_evidence(p_loan_id,p_payment_method,p_reference,p_idempotency_key,p_signed_document_path,p_contract_evidence_attested,p_delivery_date,p_evidence_image,p_signed_receipt_attested)
$$;
REVOKE ALL ON FUNCTION public.activate_approved_loan_with_evidence(uuid,text,text,uuid,text,boolean,date,bytea,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.activate_approved_loan_with_evidence(uuid,text,text,uuid,text,boolean,date,bytea,boolean) TO authenticated;
--> statement-breakpoint
-- Old entry points remain available to their trusted owner for internal calls, not to API roles.
REVOKE ALL ON FUNCTION public.record_loan_payment(uuid,numeric,uuid,text,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION app_private.record_loan_payment(uuid,numeric,uuid,text,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.activate_approved_loan(uuid,text,text,uuid,text,boolean,date) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION app_private.activate_approved_loan(uuid,text,text,uuid,text,boolean,date) FROM PUBLIC,anon,authenticated;
--> statement-breakpoint
DO $$
DECLARE v_source text; v_old text;
BEGIN
  v_source:=pg_get_functiondef('public.tenant_receipt_page(uuid,text,text,text,text,uuid,uuid,date,date,integer,integer)'::regprocedure);
  v_old:='''branch'',branch_name,''photoUpdatedAt'',photo_updated_at)';
  IF position(v_old IN v_source)=0 THEN RAISE EXCEPTION 'Missing receipt directory metadata'; END IF;
  EXECUTE replace(v_source,v_old,'''branch'',branch_name,''photoUpdatedAt'',photo_updated_at,''hasEvidence'',EXISTS(SELECT 1 FROM public.payment_evidence e WHERE e.payment_id=page_rows.id))');
END $$;
