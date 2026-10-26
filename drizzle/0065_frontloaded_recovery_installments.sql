-- Only future applications use the new timing. Existing snapshots and contracts are untouched.
-- Patch the current definition to preserve all authorization, timezone and idempotency guards.
DO $migration$
DECLARE
  v_signature regprocedure := 'app_private.create_credit_application(uuid,uuid,uuid,uuid,numeric,jsonb,uuid)'::regprocedure;
  v_source text := pg_get_functiondef(v_signature);
  v_old text;
  v_new text;
BEGIN
  v_old := '  v_quote_key text;';
  v_new := v_old || E'\n  v_recovery_count integer;\n  v_later_count integer;\n  v_later_total numeric;\n  v_expected_amount numeric;';
  IF position(v_old IN v_source)=0 THEN RAISE EXCEPTION 'Missing quote declarations'; END IF;
  v_source := replace(v_source,v_old,v_new);

  v_old := $old$  v_recovery_installment := ceil(((v_principal * 2) / v_installment_count) * 100) / 100;
  v_fixed_installment := CASE WHEN v_settings.recovery_enabled THEN greatest(v_base_installment,v_recovery_installment) ELSE v_base_installment END;
  v_total := v_down_payment + v_fixed_installment * v_installment_count;
  v_recovery_half := v_down_payment + v_fixed_installment * floor(v_installment_count / 2.0);$old$;
  v_new := $new$  v_recovery_count := floor(v_installment_count / 2.0);
  v_later_count := v_installment_count - v_recovery_count;
  v_recovery_installment := CASE WHEN v_settings.recovery_enabled
    THEN ceil(greatest(0,v_device_cost - v_down_payment) * 100 / v_recovery_count) / 100
    ELSE ceil(((v_principal * 2) / v_installment_count) * 100) / 100 END;
  v_fixed_installment := CASE WHEN v_settings.recovery_enabled THEN greatest(v_base_installment,
    least(v_recovery_installment, floor((v_base_installment * v_installment_count * 100 - v_later_count) / v_recovery_count) / 100))
    ELSE v_base_installment END;
  v_total := v_down_payment + v_base_installment * v_installment_count;
  v_recovery_half := v_down_payment + v_fixed_installment * v_recovery_count;
  v_later_total := v_base_installment * v_installment_count - v_fixed_installment * v_recovery_count;$new$;
  IF position(v_old IN v_source)=0 THEN RAISE EXCEPTION 'Missing fixed recovery calculation'; END IF;
  v_source := replace(v_source,v_old,v_new);

  v_old := '  FOR v_schedule IN SELECT value, ordinality FROM jsonb_array_elements(p_quote_snapshot->''schedule'') WITH ORDINALITY LOOP';
  v_new := v_old || $new$
    v_expected_amount := CASE WHEN v_schedule.ordinality <= v_recovery_count THEN v_fixed_installment
      ELSE floor(v_later_total * 100 / v_later_count) / 100
        + CASE WHEN v_schedule.ordinality - v_recovery_count <= mod(v_later_total * 100,v_later_count) THEN 0.01 ELSE 0 END END;$new$;
  IF position(v_old IN v_source)=0 THEN RAISE EXCEPTION 'Missing schedule validation'; END IF;
  v_source := replace(v_source,v_old,v_new);

  v_old := '(v_schedule.value->>''amount'')::numeric <> v_fixed_installment';
  IF position(v_old IN v_source)=0 THEN RAISE EXCEPTION 'Missing fixed schedule amount guard'; END IF;
  v_source := replace(v_source,v_old,'(v_schedule.value->>''amount'')::numeric <> v_expected_amount');
  v_old := '(v_schedule.value->>''proposedAdjustment'')::numeric <> v_fixed_installment';
  IF position(v_old IN v_source)=0 THEN RAISE EXCEPTION 'Missing fixed component sum guard'; END IF;
  v_source := replace(v_source,v_old,'(v_schedule.value->>''proposedAdjustment'')::numeric <> v_expected_amount');
  EXECUTE v_source;
END $migration$;
