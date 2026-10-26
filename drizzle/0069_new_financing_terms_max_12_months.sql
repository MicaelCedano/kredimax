-- Availability applies to new applications only. Existing loans, quotes and schedules are untouched.
ALTER TABLE public.financing_settings ALTER COLUMN allowed_terms SET DEFAULT ARRAY[3,5,6,8,12];
--> statement-breakpoint
DO $migration$
DECLARE
  v_signature regprocedure := 'app_private.create_credit_application(uuid,uuid,uuid,uuid,numeric,jsonb,uuid)'::regprocedure;
  v_source text := pg_get_functiondef(v_signature);
  v_guard text := 'OR NOT ((p_quote_snapshot->>''termMonths'')::integer = ANY(v_settings.allowed_terms))';
BEGIN
  IF position(v_guard IN v_source)=0 THEN RAISE EXCEPTION 'Missing new-application term guard'; END IF;
  v_source := replace(v_source, v_guard,
    'OR (p_quote_snapshot->>''termMonths'')::integer NOT IN (3,5,6,8,12) ' || v_guard);
  v_source := replace(v_source,'ARRAY[3,5,6,8,12,18,24]','ARRAY[3,5,6,8,12]');
  EXECUTE v_source;
END $migration$;
