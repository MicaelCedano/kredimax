-- Administrators with a branch context retain company-wide operation rights.
-- Ordinary roles must still match their assigned branch exactly.
DO $$
DECLARE
  v_function regprocedure;
  v_definition text;
  v_old text;
  v_new text;
BEGIN
  v_function:=to_regprocedure('app_private.create_credit_application(uuid,uuid,uuid,uuid,numeric,jsonb,uuid)');
  IF v_function IS NULL THEN RAISE EXCEPTION 'Missing create_credit_application RPC'; END IF;
  v_definition:=pg_get_functiondef(v_function);
  v_old:='AND m.branch_id IS NOT DISTINCT FROM p_branch_id';
  v_new:='AND (m.role = ''tenant_admin'' OR m.branch_id IS NULL OR m.branch_id IS NOT DISTINCT FROM p_branch_id)';
  IF position(v_old IN v_definition)=0 THEN RAISE EXCEPTION 'Unexpected create_credit_application branch guard'; END IF;
  EXECUTE replace(v_definition,v_old,v_new);

  v_function:=to_regprocedure('app_private.create_customer_and_credit_application(uuid,uuid,text,text,text,text,uuid,numeric,jsonb,uuid)');
  IF v_function IS NULL THEN RAISE EXCEPTION 'Missing create_customer_and_credit_application RPC'; END IF;
  v_definition:=pg_get_functiondef(v_function);
  v_old:='AND (m.branch_id IS NULL OR m.branch_id IS NOT DISTINCT FROM p_branch_id)';
  v_new:='AND (m.role = ''tenant_admin'' OR m.branch_id IS NULL OR m.branch_id IS NOT DISTINCT FROM p_branch_id)';
  IF position(v_old IN v_definition)=0 THEN RAISE EXCEPTION 'Unexpected create_customer_and_credit_application branch guard'; END IF;
  EXECUTE replace(v_definition,v_old,v_new);

END $$;
