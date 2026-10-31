-- Extend new-application choices without changing existing snapshots or tenant defaults.
DO $migration$
DECLARE
  v_signature regprocedure := 'app_private.create_credit_application(uuid,uuid,uuid,uuid,numeric,jsonb,uuid)'::regprocedure;
  v_source text := pg_get_functiondef(v_signature);
  v_old text := '(p_quote_snapshot->>''downPaymentPercent'')::numeric NOT IN (30.00,35.00,40.00,45.00,50.00,v_settings.down_payment_percent)';
BEGIN
  IF position(v_old IN v_source) = 0 THEN
    RAISE EXCEPTION 'Missing down payment policy guard';
  END IF;
  EXECUTE replace(v_source, v_old,
    '(p_quote_snapshot->>''downPaymentPercent'')::numeric NOT IN (30.00,35.00,40.00,45.00,50.00,55.00,60.00,65.00,70.00,75.00,80.00,v_settings.down_payment_percent)');
END $migration$;
