-- Redistribute new schedules in whole RD$50 units, preserving the level plan's total.
-- Earlier payments never exceed the smallest later payment by more than 20%.
-- Historical quotes, contracts and payments are not rewritten.
DO $migration$
DECLARE
  v_signature regprocedure := 'app_private.create_credit_application(uuid,uuid,uuid,uuid,numeric,jsonb,uuid)'::regprocedure;
  v_source text := pg_get_functiondef(v_signature);
  v_start integer;
  v_end integer;
BEGIN
  IF position('  v_unrounded_total numeric;' IN v_source)=0 THEN RAISE EXCEPTION 'Missing rounding declarations'; END IF;
  v_source := replace(v_source,'  v_unrounded_total numeric;',E'  v_unrounded_total numeric;\n  v_early_units numeric;\n  v_total_units numeric;\n  v_six_count integer;\n  v_six_amount numeric;');
  v_start := position('  v_base_installment := ceil(((v_principal' IN v_source);
  v_end := position('  IF p_requested_amount <> v_principal' IN v_source);
  IF v_start=0 OR v_end<=v_start THEN RAISE EXCEPTION 'Missing canonical calculation block'; END IF;
  v_source := substring(v_source FROM 1 FOR v_start-1) || $calculation$
  v_base_installment := ceil(((v_principal + v_interest + v_legal) / v_installment_count) * 100) / 100;
  v_unrounded_total := v_base_installment * v_installment_count;
  v_recovery_count := floor(v_installment_count / 2.0);
  v_later_count := v_installment_count - v_recovery_count;
  v_base_installment := ceil(v_base_installment / 50) * 50;
  v_total_units := v_base_installment * v_installment_count / 50;
  v_total := v_down_payment + v_total_units * 50;
  v_recovery_installment := CASE WHEN v_settings.recovery_enabled
    THEN ceil(greatest(0,v_device_cost - v_down_payment) / v_recovery_count / 50) * 50
    ELSE ceil((v_principal * 2) / v_installment_count / 50) * 50 END;
  v_fixed_installment := v_base_installment;
  IF v_settings.recovery_enabled THEN
    v_early_units := floor(6 * v_total_units / (5 * v_later_count + 6 * v_recovery_count));
    WHILE v_early_units > v_base_installment / 50
      AND v_early_units * 5 > 6 * floor((v_total_units - v_early_units * v_recovery_count) / v_later_count) LOOP
      v_early_units := v_early_units - 1;
    END LOOP;
    v_fixed_installment := greatest(v_base_installment,least(v_recovery_installment,v_early_units * 50));
  END IF;
  v_later_total := (v_total - v_down_payment) - v_fixed_installment * v_recovery_count;
  v_recovery_half := v_down_payment + v_fixed_installment * v_recovery_count;
  v_six_count := least(v_installment_count,6 * CASE WHEN p_quote_snapshot->>'frequency'='fortnightly' THEN 2 ELSE 1 END);
  v_six_amount := v_down_payment + v_fixed_installment * v_recovery_count
    + floor(v_later_total / 50 / v_later_count) * 50 * (v_six_count - v_recovery_count)
    + least(v_six_count - v_recovery_count,mod(v_later_total / 50,v_later_count)) * 50;
  v_adjustment := greatest(0,v_total - v_sale_price - v_interest - v_legal);
  IF p_quote_snapshot->>'paymentDistribution' IS DISTINCT FROM 'balanced_20_v1'
    OR p_quote_snapshot->>'recoveryMaximumDifferencePercent' IS DISTINCT FROM '20.00'
    OR p_quote_snapshot->>'installmentRounding' IS DISTINCT FROM 'up_50'
    OR jsonb_typeof(p_quote_snapshot->'recoveryAtSixMonths') IS DISTINCT FROM 'string'
    OR jsonb_typeof(p_quote_snapshot->'roundingAdjustment') IS DISTINCT FROM 'string'
    OR (p_quote_snapshot->>'recoveryAtSixMonths') !~ '^(0|[1-9][0-9]{0,11})(\.[0-9]{1,2})?$'
    OR (p_quote_snapshot->>'roundingAdjustment') !~ '^(0|[1-9][0-9]{0,11})(\.[0-9]{1,2})?$' THEN
    RAISE EXCEPTION 'INVALID_BALANCED_PAYMENT_POLICY' USING ERRCODE='22023';
  END IF;
  IF (p_quote_snapshot->>'recoveryAtSixMonths')::numeric <> v_six_amount
    OR (p_quote_snapshot->>'roundingAdjustment')::numeric <> v_total - v_down_payment - v_unrounded_total THEN
    RAISE EXCEPTION 'BALANCED_PAYMENT_REFERENCE_MISMATCH' USING ERRCODE='22023';
  END IF;

$calculation$ || substring(v_source FROM v_end);
  v_start := position('    v_expected_amount := CASE' IN v_source);
  v_end := position('    IF jsonb_typeof(v_schedule.value)' IN v_source);
  IF v_start=0 OR v_end<=v_start THEN RAISE EXCEPTION 'Missing installment amount guard'; END IF;
  v_source := substring(v_source FROM 1 FOR v_start-1) || $schedule$
    v_expected_amount := CASE WHEN v_schedule.ordinality <= v_recovery_count THEN v_fixed_installment
      ELSE floor(v_later_total / 50 / v_later_count) * 50
        + CASE WHEN v_schedule.ordinality - v_recovery_count <= mod(v_later_total / 50,v_later_count) THEN 50 ELSE 0 END END;
$schedule$ || substring(v_source FROM v_end);
  EXECUTE v_source;
END;
$migration$;
--> statement-breakpoint
DO $migration$
DECLARE
  v_signature regprocedure := 'app_private.review_credit_application(uuid,text,text,text,text,boolean)'::regprocedure;
  v_source text := pg_get_functiondef(v_signature);
  v_guard text := 'v_quote->>''paymentDistribution'' IS DISTINCT FROM ''level_v1''';
BEGIN
  IF position(v_guard IN v_source)=0 THEN RAISE EXCEPTION 'Missing advisory approval guard'; END IF;
  v_source := replace(v_source,v_guard,'coalesce(v_quote->>''paymentDistribution'',''legacy'') NOT IN (''level_v1'',''balanced_20_v1'')');
  EXECUTE v_source;
END;
$migration$;
