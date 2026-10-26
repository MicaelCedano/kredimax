CREATE OR REPLACE FUNCTION app_private.validate_quote_snapshot()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE v_quote jsonb:=NEW.quote_snapshot; v_first date; v_expected date; v_month_start date; v_last date;
        v_term integer; v_count integer; v_frequency text; v_row record; v_sequence integer; v_quote_key text;
BEGIN
  IF v_quote IS NULL OR jsonb_typeof(v_quote) IS DISTINCT FROM 'object'
    OR NOT (v_quote ?& ARRAY['currency','salePrice','deviceCost','downPaymentPercent','downPayment','principal','annualRatePercent','baseInterest','legalExpenses','termMonths','frequency','installmentCount','baseInstallment','recoveryInstallment','fixedInstallment','proposedAdjustment','totalCustomerPays','recoveryAtHalf','recoveryTarget','recoveryTargetPercent','recoveryMet','firstInstallmentDate','finalDueDate','schedule','device'])
    OR jsonb_typeof(v_quote->'schedule') IS DISTINCT FROM 'array'
    OR jsonb_typeof(v_quote->'device') IS DISTINCT FROM 'object'
    OR jsonb_typeof(v_quote->'currency') IS DISTINCT FROM 'string'
    OR jsonb_typeof(v_quote->'frequency') IS DISTINCT FROM 'string'
    OR jsonb_typeof(v_quote->'recoveryMet') IS DISTINCT FROM 'boolean'
    OR jsonb_typeof(v_quote->'termMonths') IS DISTINCT FROM 'number'
    OR jsonb_typeof(v_quote->'installmentCount') IS DISTINCT FROM 'number'
    OR jsonb_typeof(v_quote->'firstInstallmentDate') IS DISTINCT FROM 'string'
    OR jsonb_typeof(v_quote->'finalDueDate') IS DISTINCT FROM 'string' THEN
    RAISE EXCEPTION 'INVALID_QUOTE_JSON_SHAPE' USING ERRCODE='22023';
  END IF;
  FOREACH v_quote_key IN ARRAY ARRAY['salePrice','deviceCost','downPayment','principal','baseInterest','legalExpenses','baseInstallment','recoveryInstallment','fixedInstallment','proposedAdjustment','totalCustomerPays','recoveryAtHalf','recoveryTarget'] LOOP
    IF jsonb_typeof(v_quote->v_quote_key) IS DISTINCT FROM 'string'
      OR (v_quote->>v_quote_key) !~ '^(0|[1-9][0-9]{0,11})(\.[0-9]{1,2})?$' THEN
      RAISE EXCEPTION 'INVALID_QUOTE_AMOUNT' USING ERRCODE='22023';
    END IF;
  END LOOP;
  FOREACH v_quote_key IN ARRAY ARRAY['downPaymentPercent','annualRatePercent','recoveryTargetPercent'] LOOP
    IF jsonb_typeof(v_quote->v_quote_key) IS DISTINCT FROM 'string'
      OR (v_quote->>v_quote_key) !~ '^(0|[1-9][0-9]{0,2})(\.[0-9]{1,3})?$' THEN
      RAISE EXCEPTION 'INVALID_QUOTE_RATE' USING ERRCODE='22023';
    END IF;
  END LOOP;
  IF v_quote->>'currency'<>'DOP' OR v_quote->>'frequency' NOT IN ('monthly','fortnightly')
    OR (v_quote->>'termMonths') !~ '^[0-9]{1,2}$' OR (v_quote->>'installmentCount') !~ '^[0-9]{1,3}$'
    OR v_quote->>'firstInstallmentDate' !~ '^\d{4}-\d{2}-\d{2}$'
    OR v_quote->>'finalDueDate' !~ '^\d{4}-\d{2}-\d{2}$' THEN
    RAISE EXCEPTION 'INVALID_QUOTE_TERMS' USING ERRCODE='22023';
  END IF;
  BEGIN
    v_first:=(v_quote->>'firstInstallmentDate')::date;
    IF to_char(v_first,'YYYY-MM-DD')<>v_quote->>'firstInstallmentDate' THEN RAISE EXCEPTION 'invalid date'; END IF;
    v_term:=(v_quote->>'termMonths')::integer;
    v_count:=(v_quote->>'installmentCount')::integer;
  EXCEPTION WHEN others THEN RAISE EXCEPTION 'INVALID_QUOTE_TERMS' USING ERRCODE='22023'; END;
  v_frequency:=v_quote->>'frequency';
  IF v_term NOT IN (3,5,6,8,12,18,24) OR v_count<>v_term*(CASE WHEN v_frequency='fortnightly' THEN 2 ELSE 1 END)
    OR jsonb_array_length(v_quote->'schedule')<>v_count THEN
    RAISE EXCEPTION 'INVALID_QUOTE_SCHEDULE_LENGTH' USING ERRCODE='22023';
  END IF;
  IF jsonb_typeof(v_quote->'device'->'brand') IS DISTINCT FROM 'string'
    OR jsonb_typeof(v_quote->'device'->'model') IS DISTINCT FROM 'string'
    OR jsonb_typeof(v_quote->'device'->'imei') IS DISTINCT FROM 'string'
    OR length(btrim(v_quote->'device'->>'brand'))=0 OR length(v_quote->'device'->>'brand')>80
    OR length(btrim(v_quote->'device'->>'model'))=0 OR length(v_quote->'device'->>'model')>120
    OR NOT app_private.imei_is_valid(v_quote->'device'->>'imei') THEN
    RAISE EXCEPTION 'INVALID_DEVICE_SNAPSHOT' USING ERRCODE='22023';
  END IF;
  FOR v_row IN SELECT value,ordinality FROM jsonb_array_elements(v_quote->'schedule') WITH ORDINALITY LOOP
    IF jsonb_typeof(v_row.value) IS DISTINCT FROM 'object'
      OR NOT (v_row.value ?& ARRAY['sequence','dueDate','amount','principal','interest','legalExpenses','proposedAdjustment'])
      OR jsonb_typeof(v_row.value->'sequence') IS DISTINCT FROM 'number'
      OR jsonb_typeof(v_row.value->'dueDate') IS DISTINCT FROM 'string'
      OR (v_row.value->>'sequence') !~ '^[0-9]{1,3}$'
      OR (v_row.value->>'dueDate') !~ '^\d{4}-\d{2}-\d{2}$' THEN
      RAISE EXCEPTION 'INVALID_SCHEDULE_ROW_SHAPE' USING ERRCODE='22023';
    END IF;
    FOREACH v_quote_key IN ARRAY ARRAY['amount','principal','interest','legalExpenses','proposedAdjustment'] LOOP
      IF jsonb_typeof(v_row.value->v_quote_key) IS DISTINCT FROM 'string'
        OR (v_row.value->>v_quote_key) !~ '^(0|[1-9][0-9]{0,11})(\.[0-9]{1,2})?$' THEN
        RAISE EXCEPTION 'INVALID_SCHEDULE_AMOUNT' USING ERRCODE='22023';
      END IF;
    END LOOP;
    BEGIN
      v_sequence:=(v_row.value->>'sequence')::integer;
      v_expected:=(v_row.value->>'dueDate')::date;
      IF to_char(v_expected,'YYYY-MM-DD')<>v_row.value->>'dueDate' THEN RAISE EXCEPTION 'invalid date'; END IF;
    EXCEPTION WHEN others THEN RAISE EXCEPTION 'INVALID_SCHEDULE_ROW' USING ERRCODE='22023'; END;
    IF v_sequence<>v_row.ordinality THEN RAISE EXCEPTION 'INVALID_SCHEDULE_SEQUENCE' USING ERRCODE='22023'; END IF;
    IF v_frequency='fortnightly' THEN
      v_expected:=v_first+((v_sequence-1)*15);
    ELSE
      v_month_start:=(date_trunc('month',v_first)::date+((v_sequence-1)*interval '1 month'))::date;
      v_last:=(v_month_start+interval '1 month - 1 day')::date;
      v_expected:=v_month_start+(least(extract(day from v_first)::integer,extract(day from v_last)::integer)-1);
    END IF;
    IF (v_row.value->>'dueDate')::date<>v_expected THEN RAISE EXCEPTION 'INVALID_SCHEDULE_DATE_SEQUENCE' USING ERRCODE='22023'; END IF;
  END LOOP;
  RETURN NEW;
END $$;

CREATE TRIGGER credit_applications_quote_snapshot_validate
  BEFORE INSERT ON public.credit_applications
  FOR EACH ROW EXECUTE FUNCTION app_private.validate_quote_snapshot();
