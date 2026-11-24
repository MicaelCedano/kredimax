-- Operational confirmations are separate from the disabled provider command queue.
INSERT INTO public.roles(key,name) VALUES ('mdm_operator','Programador MDM');
INSERT INTO public.permissions(key,description) VALUES ('mdm.manual','Operar la cola manual de MDM');
INSERT INTO public.role_permissions(role_id,permission_id)
SELECT r.id,p.id FROM public.roles r CROSS JOIN public.permissions p
WHERE r.key IN ('tenant_admin','mdm_operator') AND p.key='mdm.manual';
--> statement-breakpoint
DO $$
DECLARE
  definition text := pg_get_functiondef('public.provision_tenant_user(uuid,uuid,uuid,public.member_role,uuid)'::regprocedure);
  old_scope text := 'p_role NOT IN (''branch_manager'',''sales'',''cashier'',''collections'',''auditor'')';
BEGIN
  IF position(old_scope IN definition)=0 THEN RAISE EXCEPTION 'Unexpected tenant provisioning role list'; END IF;
  EXECUTE replace(definition,old_scope,'p_role NOT IN (''branch_manager'',''sales'',''cashier'',''collections'',''auditor'',''mdm_operator'')');
END $$;
--> statement-breakpoint
CREATE TABLE app_private.mdm_manual_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  loan_id uuid NOT NULL REFERENCES public.loans(id),
  action text NOT NULL CHECK (action IN ('enroll','lock','unlock')),
  confirmed_by uuid NOT NULL,
  operator_name text NOT NULL,
  reference text CHECK (length(reference) <= 200),
  confirmed_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX mdm_manual_events_loan_latest_idx ON app_private.mdm_manual_events(loan_id,id DESC);
ALTER TABLE app_private.mdm_manual_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON app_private.mdm_manual_events FROM PUBLIC, anon, authenticated;
--> statement-breakpoint
CREATE VIEW app_private.mdm_loan_context AS
SELECT l.tenant_id,l.id AS loan_id,l.status AS loan_status,l.created_at,
  c.full_name AS customer,d.brand,d.model,d.imei,d.serial_number,b.name AS branch
FROM public.loans l
JOIN public.customers c ON c.id=l.customer_id AND c.tenant_id=l.tenant_id
JOIN public.devices d ON d.id=l.device_id AND d.tenant_id=l.tenant_id
LEFT JOIN public.branches b ON b.id=l.branch_id AND b.tenant_id=l.tenant_id
WHERE app_private.has_branch_permission(l.tenant_id,l.branch_id,'mdm.manual');
REVOKE ALL ON app_private.mdm_loan_context FROM PUBLIC, anon, authenticated;
--> statement-breakpoint
CREATE FUNCTION app_private.manual_mdm_list(p_tenant_id uuid,p_tab text,p_search text,p_page integer)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  WITH scoped AS (
    SELECT c.* FROM app_private.mdm_loan_context c
    WHERE auth.uid() IS NOT NULL AND c.tenant_id=p_tenant_id
      AND (p_tab='completed' OR c.loan_status IN ('approved','active','paid_off','cancelled'))
      AND (coalesce(trim(p_search),'')='' OR
        strpos(lower(concat_ws(' ',c.customer,c.brand,c.model,c.imei,c.serial_number,c.branch)),lower(left(trim(p_search),80)))>0)
  ), pending AS (
    SELECT c.loan_id,c.customer,c.brand,c.model,c.imei,c.serial_number,c.branch,
      c.loan_id::text AS id,last_event.id::text AS previous_event_id,
      CASE
        WHEN last_event.id IS NULL AND c.loan_status IN ('approved','active') THEN 'enroll'
        WHEN last_event.action IN ('enroll','unlock') AND arrears.oldest_due IS NOT NULL THEN 'lock'
        WHEN last_event.action='lock' AND arrears.oldest_due IS NULL THEN 'unlock'
      END AS action,
      c.loan_status::text AS loan_status,
      arrears.oldest_due,arrears.balance::text AS overdue_balance,
      NULL::text AS operator_name,NULL::text AS reference,NULL::timestamptz AS confirmed_at,c.created_at AS sort_at
    FROM scoped c
    LEFT JOIN LATERAL (
      SELECT e.id,e.action FROM app_private.mdm_manual_events e WHERE e.loan_id=c.loan_id ORDER BY e.id DESC LIMIT 1
    ) last_event ON true
    LEFT JOIN LATERAL (
      SELECT min(i.due_date) AS oldest_due,sum(i.amount_due-i.amount_paid) AS balance
      FROM public.installments i
      WHERE p_tab IN ('lock','unlock') AND last_event.id IS NOT NULL AND c.loan_status='active'
        AND i.loan_id=c.loan_id AND i.tenant_id=c.tenant_id
        AND i.status NOT IN ('paid','waived') AND i.amount_paid<i.amount_due
        AND i.due_date<(now() AT TIME ZONE 'America/Santo_Domingo')::date
    ) arrears ON true
    WHERE p_tab IN ('enroll','lock','unlock')
  ), filtered AS (
    SELECT * FROM pending WHERE action=p_tab
    UNION ALL
    SELECT c.loan_id,c.customer,c.brand,c.model,c.imei,c.serial_number,c.branch,
      e.id::text,NULL::text,e.action,c.loan_status::text,NULL::date,NULL::text,
      e.operator_name,e.reference,e.confirmed_at,e.confirmed_at
    FROM scoped c JOIN app_private.mdm_manual_events e ON e.loan_id=c.loan_id WHERE p_tab='completed'
  )
  SELECT jsonb_build_object(
    'count',(SELECT count(*) FROM filtered),
    'rows',coalesce((SELECT jsonb_agg(to_jsonb(r)-'sort_at' ORDER BY r.sort_at DESC,r.id DESC)
      FROM (SELECT * FROM filtered ORDER BY sort_at DESC,id DESC LIMIT 30
        OFFSET (greatest(1,least(coalesce(p_page,1),100000))-1)*30) r),'[]'::jsonb)
  );
$$;
--> statement-breakpoint
CREATE FUNCTION app_private.manual_mdm_confirm(p_tenant_id uuid,p_loan_id uuid,p_action text,p_previous_event_id bigint,p_reference text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  actor uuid := auth.uid();
  loan_state public.financing_status;
  last_event app_private.mdm_manual_events%ROWTYPE;
  actor_name text;
BEGIN
  IF actor IS NULL THEN RETURN 'forbidden'; END IF;
  IF p_action IS NULL OR p_action NOT IN ('enroll','lock','unlock') OR length(p_reference)>200 THEN
    RETURN 'invalid';
  END IF;
  SELECT l.status INTO loan_state FROM public.loans l
  WHERE l.tenant_id=p_tenant_id AND l.id=p_loan_id
    AND app_private.has_branch_permission(l.tenant_id,l.branch_id,'mdm.manual')
  FOR UPDATE;
  IF NOT FOUND THEN RETURN 'forbidden'; END IF;

  SELECT * INTO last_event FROM app_private.mdm_manual_events e
  WHERE e.loan_id=p_loan_id ORDER BY e.id DESC LIMIT 1;
  IF last_event.id IS DISTINCT FROM p_previous_event_id THEN RETURN 'stale'; END IF;

  -- Record the action already performed in the provider. If a payment arrived meanwhile,
  -- the queue can now show the inverse action instead of losing the real device state.
  IF NOT coalesce(CASE p_action
    WHEN 'enroll' THEN last_event.id IS NULL AND loan_state IN ('approved','active')
    WHEN 'lock' THEN last_event.action IN ('enroll','unlock') AND loan_state IN ('active','paid_off')
    WHEN 'unlock' THEN last_event.action='lock'
  END,false) THEN RETURN 'stale'; END IF;

  SELECT left(coalesce(nullif(trim(u.raw_user_meta_data->>'full_name'),''),nullif(trim(u.raw_user_meta_data->>'name'),''),
    nullif(split_part(u.email,'@',1),''),'Usuario MDM'),200)
  INTO actor_name FROM auth.users u WHERE u.id=actor;
  INSERT INTO app_private.mdm_manual_events(loan_id,action,confirmed_by,operator_name,reference)
  VALUES (p_loan_id,p_action,actor,coalesce(actor_name,'Usuario MDM'),nullif(trim(p_reference),''));
  RETURN 'completed';
END;
$$;
--> statement-breakpoint
CREATE FUNCTION public.manual_mdm_list(p_tenant_id uuid,p_tab text,p_search text,p_page integer)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
  SELECT app_private.manual_mdm_list(p_tenant_id,p_tab,p_search,p_page);
$$;
CREATE FUNCTION public.manual_mdm_confirm(p_tenant_id uuid,p_loan_id uuid,p_action text,p_previous_event_id bigint,p_reference text)
RETURNS text LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$
  SELECT app_private.manual_mdm_confirm(p_tenant_id,p_loan_id,p_action,p_previous_event_id,p_reference);
$$;
REVOKE ALL ON FUNCTION app_private.manual_mdm_list(uuid,text,text,integer),public.manual_mdm_list(uuid,text,text,integer),
  app_private.manual_mdm_confirm(uuid,uuid,text,bigint,text),public.manual_mdm_confirm(uuid,uuid,text,bigint,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION app_private.manual_mdm_list(uuid,text,text,integer),public.manual_mdm_list(uuid,text,text,integer),
  app_private.manual_mdm_confirm(uuid,uuid,text,bigint,text),public.manual_mdm_confirm(uuid,uuid,text,bigint,text) TO authenticated;
