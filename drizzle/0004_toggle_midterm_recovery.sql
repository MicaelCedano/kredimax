ALTER TABLE "credit_applications" ALTER COLUMN "quote_snapshot" SET DEFAULT '{}'::jsonb;--> statement-breakpoint
ALTER TABLE "financing_settings" ADD COLUMN "recovery_enabled" boolean DEFAULT true NOT NULL;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION app_private.create_credit_application(
  p_tenant_id uuid,
  p_customer_id uuid,
  p_device_id uuid,
  p_branch_id uuid,
  p_requested_amount numeric,
  p_quote_snapshot jsonb,
  p_submission_key uuid
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_application_id uuid;
  v_rows integer;
  v_settings record;
  v_sale_price numeric;
  v_device_cost numeric;
  v_down_payment numeric;
  v_principal numeric;
  v_interest numeric;
  v_legal numeric;
  v_installment_count integer;
  v_base_installment numeric;
  v_recovery_installment numeric;
  v_fixed_installment numeric;
  v_total numeric;
  v_recovery_half numeric;
  v_adjustment numeric;
  v_schedule_count integer;
  v_schedule record;
  v_component_totals record;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE = '42501'; END IF;
  IF NOT app_private.has_tenant_permission(p_tenant_id,'financing.write') THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501'; END IF;
  IF p_submission_key IS NULL OR jsonb_typeof(p_quote_snapshot) <> 'object' THEN RAISE EXCEPTION 'INVALID_QUOTE' USING ERRCODE = '22023'; END IF;
  IF NOT (p_quote_snapshot ?& ARRAY['currency','salePrice','deviceCost','downPaymentPercent','downPayment','principal','annualRatePercent','baseInterest','legalExpenses','termMonths','frequency','installmentCount','baseInstallment','recoveryInstallment','fixedInstallment','proposedAdjustment','totalCustomerPays','recoveryAtHalf','recoveryTarget','recoveryTargetPercent','recoveryEnabled','recoveryMet','firstInstallmentDate','finalDueDate','schedule','device']) THEN
    RAISE EXCEPTION 'INCOMPLETE_QUOTE' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.tenant_memberships m
    WHERE m.tenant_id=p_tenant_id AND m.user_id=v_user_id AND m.status='active'
      AND m.branch_id IS NOT DISTINCT FROM p_branch_id
  ) THEN RAISE EXCEPTION 'INVALID_BRANCH_SCOPE' USING ERRCODE = '42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.customers c WHERE c.tenant_id=p_tenant_id AND c.id=p_customer_id) THEN RAISE EXCEPTION 'CUSTOMER_NOT_FOUND' USING ERRCODE = '23503'; END IF;
  IF p_device_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.devices d WHERE d.tenant_id=p_tenant_id AND d.id=p_device_id) THEN RAISE EXCEPTION 'DEVICE_NOT_FOUND' USING ERRCODE = '23503'; END IF;
  IF p_branch_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.branches b WHERE b.tenant_id=p_tenant_id AND b.id=p_branch_id AND b.active) THEN RAISE EXCEPTION 'BRANCH_NOT_FOUND' USING ERRCODE = '23503'; END IF;

  SELECT
    coalesce((SELECT s.down_payment_percent FROM public.financing_settings s WHERE s.tenant_id=p_tenant_id),30.00) AS down_payment_percent,
    coalesce((SELECT s.annual_rate_percent FROM public.financing_settings s WHERE s.tenant_id=p_tenant_id),48.000) AS annual_rate_percent,
    coalesce((SELECT s.legal_expenses FROM public.financing_settings s WHERE s.tenant_id=p_tenant_id),1000.00) AS legal_expenses,
    coalesce((SELECT s.allowed_terms FROM public.financing_settings s WHERE s.tenant_id=p_tenant_id),ARRAY[3,6,8,12,18,24]) AS allowed_terms,
    coalesce((SELECT s.recovery_enabled FROM public.financing_settings s WHERE s.tenant_id=p_tenant_id),true) AS recovery_enabled
  INTO v_settings;

  BEGIN
    v_sale_price := (p_quote_snapshot->>'salePrice')::numeric;
    v_device_cost := (p_quote_snapshot->>'deviceCost')::numeric;
    v_down_payment := (p_quote_snapshot->>'downPayment')::numeric;
    v_principal := (p_quote_snapshot->>'principal')::numeric;
    v_interest := (p_quote_snapshot->>'baseInterest')::numeric;
    v_legal := (p_quote_snapshot->>'legalExpenses')::numeric;
    v_installment_count := (p_quote_snapshot->>'installmentCount')::integer;
    v_total := (p_quote_snapshot->>'totalCustomerPays')::numeric;
    v_recovery_half := (p_quote_snapshot->>'recoveryAtHalf')::numeric;
    v_adjustment := (p_quote_snapshot->>'proposedAdjustment')::numeric;
  EXCEPTION WHEN others THEN RAISE EXCEPTION 'INVALID_QUOTE_AMOUNT' USING ERRCODE = '22023';
  END;

  IF p_quote_snapshot->>'currency' <> 'DOP'
     OR (p_quote_snapshot->>'frequency' NOT IN ('monthly','fortnightly'))
     OR v_sale_price <= 0 OR v_device_cost <> v_sale_price OR v_device_cost <= 0 OR v_principal <= 0 OR v_installment_count <= 0
     OR p_requested_amount IS NULL OR p_requested_amount <> v_principal
     OR (p_quote_snapshot->>'downPaymentPercent')::numeric <> v_settings.down_payment_percent
     OR (p_quote_snapshot->>'annualRatePercent')::numeric <> v_settings.annual_rate_percent
     OR v_legal <> v_settings.legal_expenses
     OR NOT ((p_quote_snapshot->>'termMonths')::integer = ANY(v_settings.allowed_terms))
     OR (p_quote_snapshot->>'recoveryTargetPercent')::numeric <> 100.00
     OR (p_quote_snapshot->>'recoveryEnabled')::boolean <> v_settings.recovery_enabled
     OR (p_quote_snapshot->>'firstInstallmentDate')::date < current_date THEN
    RAISE EXCEPTION 'INVALID_QUOTE_TERMS' USING ERRCODE = '22023';
  END IF;
  IF v_installment_count <> ((p_quote_snapshot->>'termMonths')::integer * (CASE WHEN p_quote_snapshot->>'frequency'='fortnightly' THEN 2 ELSE 1 END)) THEN
    RAISE EXCEPTION 'INVALID_INSTALLMENT_COUNT' USING ERRCODE = '22023';
  END IF;

  v_down_payment := round(v_sale_price * v_settings.down_payment_percent / 100,2);
  v_principal := v_sale_price - v_down_payment;
  v_interest := round(v_principal * v_settings.annual_rate_percent * (p_quote_snapshot->>'termMonths')::integer / 1200,2);
  v_legal := v_settings.legal_expenses;
  v_base_installment := ceil(((v_principal + v_interest + v_legal) / v_installment_count) * 100) / 100;
  v_recovery_installment := ceil(((v_principal * 2) / v_installment_count) * 100) / 100;
  v_fixed_installment := CASE WHEN v_settings.recovery_enabled THEN greatest(v_base_installment,v_recovery_installment) ELSE v_base_installment END;
  v_total := v_down_payment + v_fixed_installment * v_installment_count;
  v_recovery_half := v_down_payment + v_fixed_installment * floor(v_installment_count / 2.0);
  v_adjustment := greatest(0,v_total - v_sale_price - v_interest - v_legal);

  IF p_requested_amount <> v_principal
     OR (p_quote_snapshot->>'downPayment')::numeric <> v_down_payment
     OR (p_quote_snapshot->>'principal')::numeric <> v_principal
     OR (p_quote_snapshot->>'baseInterest')::numeric <> v_interest
     OR (p_quote_snapshot->>'baseInstallment')::numeric <> v_base_installment
     OR (p_quote_snapshot->>'recoveryInstallment')::numeric <> v_recovery_installment
     OR (p_quote_snapshot->>'fixedInstallment')::numeric <> v_fixed_installment
     OR (p_quote_snapshot->>'totalCustomerPays')::numeric <> v_total
     OR (p_quote_snapshot->>'recoveryAtHalf')::numeric <> v_recovery_half
     OR (p_quote_snapshot->>'recoveryTarget')::numeric <> v_device_cost
     OR (p_quote_snapshot->>'proposedAdjustment')::numeric <> v_adjustment
     OR (p_quote_snapshot->>'recoveryMet')::boolean <> (NOT v_settings.recovery_enabled OR v_recovery_half >= v_device_cost) THEN
    RAISE EXCEPTION 'QUOTE_CALCULATION_MISMATCH' USING ERRCODE = '22023';
  END IF;

  IF jsonb_typeof(p_quote_snapshot->'schedule') <> 'array'
     OR jsonb_array_length(p_quote_snapshot->'schedule') <> v_installment_count THEN
    RAISE EXCEPTION 'INVALID_QUOTE_SCHEDULE' USING ERRCODE = '22023';
  END IF;
  FOR v_schedule IN SELECT value, ordinality FROM jsonb_array_elements(p_quote_snapshot->'schedule') WITH ORDINALITY LOOP
    IF (v_schedule.value->>'sequence')::integer <> v_schedule.ordinality
       OR (v_schedule.value->>'amount')::numeric <> v_fixed_installment
       OR (v_schedule.value->>'principal')::numeric + (v_schedule.value->>'interest')::numeric
          + (v_schedule.value->>'legalExpenses')::numeric + (v_schedule.value->>'proposedAdjustment')::numeric <> v_fixed_installment THEN
      RAISE EXCEPTION 'INVALID_SCHEDULE_ROW' USING ERRCODE = '22023';
    END IF;
  END LOOP;
  SELECT sum((value->>'principal')::numeric) AS principal, sum((value->>'interest')::numeric) AS interest,
         sum((value->>'legalExpenses')::numeric) AS legal, sum((value->>'proposedAdjustment')::numeric) AS adjustment
  INTO v_component_totals FROM jsonb_array_elements(p_quote_snapshot->'schedule');
  IF v_component_totals.principal <> v_principal OR v_component_totals.interest <> v_interest
     OR v_component_totals.legal <> v_legal OR v_component_totals.adjustment <> v_adjustment THEN
    RAISE EXCEPTION 'INVALID_SCHEDULE_ALLOCATION' USING ERRCODE = '22023';
  END IF;
  IF (SELECT value->>'dueDate' FROM jsonb_array_elements(p_quote_snapshot->'schedule') WITH ORDINALITY WHERE ordinality=1) <> p_quote_snapshot->>'firstInstallmentDate'
     OR (SELECT value->>'dueDate' FROM jsonb_array_elements(p_quote_snapshot->'schedule') WITH ORDINALITY ORDER BY ordinality DESC LIMIT 1) <> p_quote_snapshot->>'finalDueDate' THEN
    RAISE EXCEPTION 'INVALID_SCHEDULE_DATES' USING ERRCODE = '22023';
  END IF;
  IF p_device_id IS NOT NULL AND p_quote_snapshot->'device'->>'id' <> p_device_id::text THEN
    RAISE EXCEPTION 'DEVICE_SNAPSHOT_MISMATCH' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.credit_applications(tenant_id,customer_id,device_id,branch_id,requested_amount,status,quote_snapshot,submission_key,created_by)
  VALUES(p_tenant_id,p_customer_id,p_device_id,p_branch_id,v_principal,'pending',p_quote_snapshot,p_submission_key,v_user_id)
  ON CONFLICT(tenant_id,created_by,submission_key) DO NOTHING
  RETURNING id INTO v_application_id;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows = 0 THEN
    SELECT id INTO v_application_id FROM public.credit_applications
    WHERE tenant_id=p_tenant_id AND created_by=v_user_id AND submission_key=p_submission_key;
    RETURN v_application_id;
  END IF;

  INSERT INTO public.credit_application_events(tenant_id,application_id,actor_id,event_type,to_status,metadata)
  VALUES(p_tenant_id,v_application_id,v_user_id,'application_created','pending',jsonb_build_object('quoteVersion',1,'installmentCount',v_installment_count));
  RETURN v_application_id;
END;
$$;
