-- Initial percentage belongs to each new quote. Preserve historical contracts and tenant defaults.
DO $migration$
DECLARE
  v_signature regprocedure := 'app_private.create_credit_application(uuid,uuid,uuid,uuid,numeric,jsonb,uuid)'::regprocedure;
  v_source text := pg_get_functiondef(v_signature);
  v_old text;
BEGIN
  v_old := '(p_quote_snapshot->>''downPaymentPercent'')::numeric <> v_settings.down_payment_percent';
  IF position(v_old IN v_source)=0 THEN RAISE EXCEPTION 'Missing down payment policy guard'; END IF;
  v_source := replace(v_source,v_old,
    '(p_quote_snapshot->>''downPaymentPercent'')::numeric NOT IN (30.00,35.00,40.00,45.00,50.00,v_settings.down_payment_percent)');

  v_old := 'v_down_payment := round(v_sale_price * v_settings.down_payment_percent / 100,2);';
  IF position(v_old IN v_source)=0 THEN RAISE EXCEPTION 'Missing down payment calculation'; END IF;
  v_source := replace(v_source,v_old,
    'v_down_payment := round(v_sale_price * (p_quote_snapshot->>''downPaymentPercent'')::numeric / 100,2);');
  EXECUTE v_source;
END $migration$;
