-- New applications only. Existing quotes, contracts, installments and payments are untouched.
-- Match the shared calculator: compute the original schedule, then ceil each amount to RD$50.
DO $migration$
DECLARE
  v_signature regprocedure := 'app_private.create_credit_application(uuid,uuid,uuid,uuid,numeric,jsonb,uuid)'::regprocedure;
  v_source text := pg_get_functiondef(v_signature);
  v_old text;
BEGIN
  v_old := '  v_expected_amount numeric;';
  IF position(v_old IN v_source)=0 THEN RAISE EXCEPTION 'Missing schedule declarations'; END IF;
  v_source := replace(v_source,v_old,v_old || E'\n  v_unrounded_total numeric;');

  v_old := '  v_later_total := v_base_installment * v_installment_count - v_fixed_installment * v_recovery_count;';
  IF position(v_old IN v_source)=0 THEN RAISE EXCEPTION 'Missing raw schedule calculation'; END IF;
  v_source := replace(v_source,v_old,v_old || $rounding$
  v_unrounded_total := v_base_installment * v_installment_count;
  v_total := v_down_payment + ceil(v_fixed_installment / 50) * 50 * v_recovery_count
    + ceil((floor(v_later_total * 100 / v_later_count) / 100) / 50) * 50
      * (v_later_count - mod(v_later_total * 100,v_later_count))
    + ceil((floor(v_later_total * 100 / v_later_count) / 100 + 0.01) / 50) * 50
      * mod(v_later_total * 100,v_later_count);
  v_base_installment := ceil(v_base_installment / 50) * 50;
  v_recovery_installment := ceil(v_recovery_installment / 50) * 50;
  v_fixed_installment := ceil(v_fixed_installment / 50) * 50;
  v_recovery_half := v_down_payment + v_fixed_installment * v_recovery_count;
  IF p_quote_snapshot->>'installmentRounding' IS DISTINCT FROM 'up_50'
    OR jsonb_typeof(p_quote_snapshot->'roundingAdjustment') IS DISTINCT FROM 'string'
    OR (p_quote_snapshot->>'roundingAdjustment') !~ '^(0|[1-9][0-9]{0,11})(\.[0-9]{1,2})?$' THEN
    RAISE EXCEPTION 'INVALID_INSTALLMENT_ROUNDING' USING ERRCODE='22023';
  END IF;
  IF (p_quote_snapshot->>'roundingAdjustment')::numeric <> v_total - v_down_payment - v_unrounded_total THEN
    RAISE EXCEPTION 'ROUNDING_ADJUSTMENT_MISMATCH' USING ERRCODE='22023';
  END IF;
$rounding$);

  v_old := 'THEN 0.01 ELSE 0 END END;';
  IF position(v_old IN v_source)=0 THEN RAISE EXCEPTION 'Missing original installment distribution'; END IF;
  v_source := replace(v_source,v_old,v_old || E'\n    v_expected_amount := ceil(v_expected_amount / 50) * 50;');
  EXECUTE v_source;
END;
$migration$;
