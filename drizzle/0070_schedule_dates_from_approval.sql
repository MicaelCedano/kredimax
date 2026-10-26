-- Change dates only when a pending application is approved. Never rewrite existing loans.
CREATE OR REPLACE FUNCTION app_private.quote_dates_from_approval(p_quote jsonb, p_approval_date date)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path = '' AS $$
DECLARE
  v_first date;
  v_due date;
  v_schedule jsonb := '[]'::jsonb;
  v_row jsonb;
BEGIN
  IF p_approval_date IS NULL OR p_quote->>'frequency' IS NULL
     OR p_quote->>'frequency' NOT IN ('monthly','fortnightly')
     OR jsonb_typeof(p_quote->'schedule') IS DISTINCT FROM 'array'
     OR jsonb_array_length(p_quote->'schedule')=0 THEN
    RAISE EXCEPTION 'INVALID_SCHEDULE' USING ERRCODE='22023';
  END IF;
  v_first := p_approval_date + CASE WHEN p_quote->>'frequency'='fortnightly' THEN 15 ELSE 30 END;
  FOR v_row IN SELECT value FROM jsonb_array_elements(p_quote->'schedule') ORDER BY (value->>'sequence')::integer LOOP
    IF p_quote->>'frequency'='fortnightly' THEN
      v_due := v_first + ((v_row->>'sequence')::integer - 1) * 15;
    ELSE
      -- Preserve the existing monthly calendar cadence, including month-end clamping.
      v_due := (v_first + make_interval(months => (v_row->>'sequence')::integer - 1))::date;
    END IF;
    v_schedule := v_schedule || jsonb_build_array(v_row || jsonb_build_object('dueDate',to_char(v_due,'YYYY-MM-DD')));
  END LOOP;
  RETURN p_quote || jsonb_build_object('firstInstallmentDate',to_char(v_first,'YYYY-MM-DD'),
    'finalDueDate',to_char(v_due,'YYYY-MM-DD'),'schedule',v_schedule,
    'scheduleBasis','approval','scheduleAnchorDate',to_char(p_approval_date,'YYYY-MM-DD'));
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app_private.quote_dates_from_approval(jsonb,date) FROM PUBLIC, anon, authenticated;
--> statement-breakpoint
-- Keep the current authorization, locking, audit trail, grants and function settings.
DO $migration$
DECLARE
  v_signature regprocedure := 'app_private.review_credit_application(uuid,text,text,text,text,boolean)'::regprocedure;
  v_source text := pg_get_functiondef(v_signature);
  v_anchor text := '    v_contract_number :=';
BEGIN
  IF position(v_anchor IN v_source)=0 OR position('quote_dates_from_approval' IN v_source)>0 THEN
    RAISE EXCEPTION 'Unexpected application review function';
  END IF;
  v_source := replace(v_source,v_anchor,
    '    v_quote := app_private.quote_dates_from_approval(v_quote, (clock_timestamp() AT TIME ZONE ''America/Santo_Domingo'')::date);' || chr(10) || chr(10) || v_anchor);
  EXECUTE v_source;
END;
$migration$;
