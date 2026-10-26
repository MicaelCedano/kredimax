-- Reviews are financial workflow writes and must honor the application's branch.
-- tenant_admin retains tenant-wide operation through has_branch_permission.
CREATE OR REPLACE FUNCTION app_private.review_credit_application(
  p_application_id uuid,
  p_decision text,
  p_notes text,
  p_additional_charge_category text,
  p_additional_charge_basis text,
  p_additional_charge_attested boolean
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_application public.credit_applications%ROWTYPE;
  v_quote jsonb;
  v_adjustment numeric;
  v_contract_id uuid;
  v_loan_id uuid;
  v_contract_number text;
  v_schedule record;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE = '42501'; END IF;
  IF p_decision NOT IN ('approved','rejected','documents_requested') THEN RAISE EXCEPTION 'INVALID_DECISION' USING ERRCODE = '22023'; END IF;

  SELECT * INTO v_application FROM public.credit_applications WHERE id=p_application_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'APPLICATION_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;
  IF NOT app_private.has_branch_permission(v_application.tenant_id,v_application.branch_id,'financing.approve') THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501';
  END IF;
  IF v_application.status NOT IN ('pending','documents_requested') THEN RAISE EXCEPTION 'APPLICATION_ALREADY_REVIEWED' USING ERRCODE = '55000'; END IF;
  IF p_decision IN ('rejected','documents_requested') AND coalesce(length(trim(p_notes)),0)=0 THEN RAISE EXCEPTION 'REVIEW_NOTE_REQUIRED' USING ERRCODE = '22023'; END IF;

  v_quote := v_application.quote_snapshot;
  v_adjustment := (v_quote->>'proposedAdjustment')::numeric;
  IF p_decision='approved' THEN
    IF (v_quote->>'recoveryMet')::boolean IS NOT TRUE THEN RAISE EXCEPTION 'RECOVERY_REVIEW_REQUIRED' USING ERRCODE = '22023'; END IF;
    IF v_application.device_id IS NULL THEN RAISE EXCEPTION 'DEVICE_NOT_IN_INVENTORY' USING ERRCODE = '23503'; END IF;
    IF v_adjustment > 0 AND (coalesce(length(trim(p_additional_charge_category)),0)=0 OR coalesce(length(trim(p_additional_charge_basis)),0)=0 OR p_additional_charge_attested IS NOT TRUE) THEN
      RAISE EXCEPTION 'ADDITIONAL_CHARGE_APPROVAL_REQUIRED' USING ERRCODE = '42501';
    END IF;

    v_contract_number := 'KM-' || to_char(current_date,'YYYY') || '-' || upper(substr(replace(v_application.id::text,'-',''),1,8));
    INSERT INTO public.credit_contracts(tenant_id,customer_id,contract_number,terms)
    VALUES(v_application.tenant_id,v_application.customer_id,v_contract_number,
      v_quote || jsonb_build_object('review',jsonb_build_object('approvedBy',v_user_id,'approvedAt',clock_timestamp(),'additionalChargeCategory',p_additional_charge_category,'additionalChargeBasis',p_additional_charge_basis)))
    RETURNING id INTO v_contract_id;

    INSERT INTO public.loans(tenant_id,customer_id,contract_id,device_id,status,sale_price,down_payment,principal,interest_rate,installment_count,calculation_strategy)
    VALUES(v_application.tenant_id,v_application.customer_id,v_contract_id,v_application.device_id,'approved',
      (v_quote->>'salePrice')::numeric,(v_quote->>'downPayment')::numeric,(v_quote->>'principal')::numeric,
      (v_quote->>'annualRatePercent')::numeric,(v_quote->>'installmentCount')::integer,'simple_fixed_recovery_target')
    RETURNING id INTO v_loan_id;

    FOR v_schedule IN SELECT value FROM jsonb_array_elements(v_quote->'schedule') LOOP
      INSERT INTO public.installments(tenant_id,loan_id,sequence,due_date,amount_due)
      VALUES(v_application.tenant_id,v_loan_id,(v_schedule.value->>'sequence')::integer,(v_schedule.value->>'dueDate')::date,(v_schedule.value->>'amount')::numeric);
    END LOOP;
  END IF;

  UPDATE public.credit_applications SET status=p_decision,review_notes=nullif(trim(p_notes),''),
    additional_charge_category=CASE WHEN p_decision='approved' AND v_adjustment>0 THEN trim(p_additional_charge_category) ELSE additional_charge_category END,
    additional_charge_basis=CASE WHEN p_decision='approved' AND v_adjustment>0 THEN trim(p_additional_charge_basis) ELSE additional_charge_basis END,
    additional_charge_approved_by=CASE WHEN p_decision='approved' AND v_adjustment>0 THEN v_user_id ELSE additional_charge_approved_by END,
    additional_charge_approved_at=CASE WHEN p_decision='approved' AND v_adjustment>0 THEN clock_timestamp() ELSE additional_charge_approved_at END
  WHERE id=p_application_id;

  INSERT INTO public.credit_application_events(tenant_id,application_id,actor_id,event_type,from_status,to_status,notes,metadata)
  VALUES(v_application.tenant_id,p_application_id,v_user_id,p_decision,v_application.status,p_decision,nullif(trim(p_notes),''),
    jsonb_build_object('contractId',v_contract_id,'loanId',v_loan_id,'additionalChargeCategory',CASE WHEN v_adjustment>0 AND p_decision='approved' THEN trim(p_additional_charge_category) ELSE null END));
  RETURN coalesce(v_loan_id,p_application_id);
END;
$$;
