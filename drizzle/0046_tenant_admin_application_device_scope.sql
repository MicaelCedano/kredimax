-- Device snapshots created by an application follow the same company-wide
-- administrator scope as the application RPC; other roles remain branch-bound.
DO $$
DECLARE
  v_function regprocedure:=to_regprocedure('app_private.attach_application_device_from_snapshot()');
  v_definition text;
  v_old text:='AND (m.branch_id IS NULL OR m.branch_id IS NOT DISTINCT FROM NEW.branch_id)';
  v_new text:='AND (m.role = ''tenant_admin'' OR m.branch_id IS NULL OR m.branch_id IS NOT DISTINCT FROM NEW.branch_id)';
BEGIN
  IF v_function IS NULL THEN RAISE EXCEPTION 'Missing application device snapshot trigger'; END IF;
  v_definition:=pg_get_functiondef(v_function);
  IF position(v_old IN v_definition)=0 THEN RAISE EXCEPTION 'Unexpected application device branch guard'; END IF;
  EXECUTE replace(v_definition,v_old,v_new);
END $$;
