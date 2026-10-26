-- Future applications have level payments. Recovery is a six-month reference, not an approval gate.
-- Preserve all saved applications, contracts, installments and payments.
DO $migration$
DECLARE
  v_signature regprocedure := 'app_private.create_credit_application(uuid,uuid,uuid,uuid,numeric,jsonb,uuid)'::regprocedure;
  v_source text := pg_get_functiondef(v_signature);
  v_old text;
BEGIN
  v_old := $old$  v_recovery_installment := CASE WHEN v_settings.recovery_enabled
    THEN ceil(greatest(0,v_device_cost - v_down_payment) * 100 / v_recovery_count) / 100
    ELSE ceil(((v_principal * 2) / v_installment_count) * 100) / 100 END;$old$;
  IF position(v_old IN v_source)=0 THEN RAISE EXCEPTION 'Missing recovery reference calculation'; END IF;
  v_source := replace(v_source,v_old,$new$  v_recovery_installment := ceil(greatest(0,v_device_cost - v_down_payment) * 100
    / least(v_installment_count,6 * CASE WHEN p_quote_snapshot->>'frequency'='fortnightly' THEN 2 ELSE 1 END)) / 100;$new$);

  v_old := $old$  v_fixed_installment := CASE WHEN v_settings.recovery_enabled THEN greatest(v_base_installment,
    least(v_recovery_installment, floor((v_base_installment * v_installment_count * 100 - v_later_count) / v_recovery_count) / 100))
    ELSE v_base_installment END;$old$;
  IF position(v_old IN v_source)=0 THEN RAISE EXCEPTION 'Missing frontloaded installment policy'; END IF;
  v_source := replace(v_source,v_old,'  v_fixed_installment := v_base_installment;');

  v_old := '  IF p_quote_snapshot->>''installmentRounding'' IS DISTINCT FROM ''up_50''';
  IF position(v_old IN v_source)=0 THEN RAISE EXCEPTION 'Missing rounding policy guard'; END IF;
  v_source := replace(v_source,v_old,$new$  IF p_quote_snapshot->>'paymentDistribution' IS DISTINCT FROM 'level_v1'
    OR jsonb_typeof(p_quote_snapshot->'recoveryAtSixMonths') IS DISTINCT FROM 'string'
    OR (p_quote_snapshot->>'recoveryAtSixMonths') !~ '^(0|[1-9][0-9]{0,11})(\.[0-9]{1,2})?$' THEN
    RAISE EXCEPTION 'INVALID_LEVEL_PAYMENT_POLICY' USING ERRCODE='22023';
  END IF;
  IF (p_quote_snapshot->>'recoveryAtSixMonths')::numeric <> v_down_payment + v_fixed_installment
    * least(v_installment_count,6 * CASE WHEN p_quote_snapshot->>'frequency'='fortnightly' THEN 2 ELSE 1 END) THEN
    RAISE EXCEPTION 'RECOVERY_REFERENCE_MISMATCH' USING ERRCODE='22023';
  END IF;
$new$ || v_old);

  v_old := '(NOT v_settings.recovery_enabled OR v_recovery_half >= v_device_cost)';
  IF position(v_old IN v_source)=0 THEN RAISE EXCEPTION 'Missing recovery result validation'; END IF;
  v_source := replace(v_source,v_old,'((p_quote_snapshot->>''recoveryAtSixMonths'')::numeric >= v_device_cost)');
  EXECUTE v_source;
END;
$migration$;
--> statement-breakpoint
DO $migration$
DECLARE
  v_signature regprocedure := 'app_private.review_credit_application(uuid,text,text,text,text,boolean)'::regprocedure;
  v_source text := pg_get_functiondef(v_signature);
  v_old text := 'IF (v_quote->>''recoveryMet'')::boolean IS NOT TRUE THEN';
BEGIN
  IF position(v_old IN v_source)=0 THEN RAISE EXCEPTION 'Missing legacy recovery approval guard'; END IF;
  v_source := replace(v_source,v_old,
    'IF v_quote->>''paymentDistribution'' IS DISTINCT FROM ''level_v1'' AND (v_quote->>''recoveryMet'')::boolean IS NOT TRUE THEN');
  EXECUTE v_source;
END;
$migration$;
