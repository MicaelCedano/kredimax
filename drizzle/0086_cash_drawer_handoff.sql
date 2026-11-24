CREATE TABLE public.cash_drawer_sessions (
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  branch_id uuid NOT NULL,
  seller_id uuid NOT NULL,
  business_date date NOT NULL,
  opened_at timestamptz,
  opened_by uuid REFERENCES auth.users(id),
  opened_by_name text,
  delivered_at timestamptz,
  delivered_by uuid REFERENCES auth.users(id),
  delivered_by_name text,
  received_at timestamptz,
  received_by uuid REFERENCES auth.users(id),
  received_by_name text,
  received_cash numeric(15,2),
  received_transfer numeric(15,2),
  received_other numeric(15,2),
  receipt_notes text CHECK (length(receipt_notes)<=1000),
  PRIMARY KEY (tenant_id,business_date,branch_id,seller_id),
  FOREIGN KEY (tenant_id,branch_id) REFERENCES public.branches(tenant_id,id),
  FOREIGN KEY (tenant_id,seller_id) REFERENCES public.tenant_memberships(tenant_id,user_id),
  CHECK ((opened_at IS NOT NULL) = (opened_by IS NOT NULL)),
  CHECK ((delivered_at IS NOT NULL) = (delivered_by IS NOT NULL)),
  CHECK ((received_at IS NOT NULL) = (received_by IS NOT NULL)),
  CHECK (opened_at IS NOT NULL OR delivered_at IS NOT NULL),
  CHECK (delivered_at IS NULL OR opened_at IS NULL OR delivered_at >= opened_at),
  CHECK (received_at IS NULL OR (
    delivered_at IS NOT NULL AND received_at >= delivered_at
    AND received_by <> seller_id AND received_by <> delivered_by
    AND received_cash IS NOT NULL AND received_transfer IS NOT NULL AND received_other IS NOT NULL
  ))
);
ALTER TABLE public.cash_drawer_sessions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.cash_drawer_sessions FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.cash_drawer_sessions TO authenticated;
CREATE POLICY cash_drawer_sessions_read ON public.cash_drawer_sessions FOR SELECT TO authenticated USING (
  app_private.has_branch_permission(tenant_id,branch_id,'cash.read')
  AND (seller_id=(SELECT auth.uid()) OR app_private.has_branch_permission(tenant_id,branch_id,'cash.manage'))
);

INSERT INTO public.permissions(key,description) VALUES ('cash.receive','Confirmar recepción de un cuadre entregado');
INSERT INTO public.role_permissions(role_id,permission_id)
  SELECT r.id,p.id FROM public.roles r CROSS JOIN public.permissions p
  WHERE r.key IN ('tenant_admin','branch_manager') AND p.key='cash.receive';
--> statement-breakpoint
-- Names are display-only. Authorization and audit always use the authenticated UUID.
CREATE FUNCTION app_private.cash_operator_name(p_user uuid)
RETURNS text LANGUAGE sql STABLE SET search_path='' AS $$
  SELECT left(coalesce(nullif(btrim(u.raw_user_meta_data->>'full_name'),''),
    nullif(btrim(u.raw_user_meta_data->>'name'),''),u.email,'Usuario registrado'),200)
  FROM auth.users u WHERE u.id=p_user
$$;
REVOKE ALL ON FUNCTION app_private.cash_operator_name(uuid) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION app_private.cash_day_rows(p_tenant uuid,p_day date)
RETURNS TABLE(seller_id uuid,seller_name text,branch_id uuid,branch_name text,payment_type text,
 cash numeric,transfer numeric,other numeric,movements bigint,closing jsonb)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 WITH movements AS (
  SELECT p.received_by AS seller_id,l.branch_id,p.payment_type,sum(e.amount) FILTER(WHERE p.payment_method='cash') AS cash,
   sum(e.amount) FILTER(WHERE p.payment_method='bank_transfer') AS transfer,
   sum(e.amount) FILTER(WHERE p.payment_method NOT IN ('cash','bank_transfer')) AS other,count(*) AS movements
  FROM public.ledger_entries e JOIN public.payments p ON p.tenant_id=e.tenant_id AND p.id=e.payment_id
  JOIN public.loans l ON l.tenant_id=p.tenant_id AND l.id=p.loan_id JOIN public.tenants t ON t.id=p.tenant_id
  WHERE e.tenant_id=p_tenant AND e.entry_type IN ('payment_received','payment_reversal')
   AND e.created_at >= (p_day::timestamp AT TIME ZONE t.timezone)
   AND e.created_at < ((p_day+1)::timestamp AT TIME ZONE t.timezone)
  GROUP BY p.received_by,l.branch_id,p.payment_type
 ), drawers AS (
  SELECT m.user_id AS seller_id,m.branch_id,types.payment_type FROM public.tenant_memberships m
   CROSS JOIN (VALUES ('down_payment'),('installment')) types(payment_type)
   WHERE m.tenant_id=p_tenant AND m.status='active' AND m.branch_id IS NOT NULL AND m.role IN ('sales','cashier','collections')
  UNION SELECT seller_id,branch_id,payment_type FROM movements
  UNION SELECT seller_id,branch_id,payment_type FROM public.cash_closings WHERE tenant_id=p_tenant AND business_date=p_day
  UNION SELECT s.seller_id,s.branch_id,types.payment_type FROM public.cash_drawer_sessions s
   CROSS JOIN (VALUES ('down_payment'),('installment')) types(payment_type)
   WHERE s.tenant_id=p_tenant AND s.business_date=p_day AND s.opened_at IS NOT NULL
 )
 SELECT d.seller_id,coalesce(app_private.cash_operator_name(d.seller_id),'Usuario registrado') AS seller_name,
  d.branch_id,b.name::text,d.payment_type,coalesce(v.cash,0),coalesce(v.transfer,0),coalesce(v.other,0),coalesce(v.movements,0),
  CASE WHEN c.id IS NULL THEN NULL ELSE jsonb_build_object('id',c.id,'cash',c.declared_cash::text,'transfer',c.declared_transfer::text,
   'other',c.declared_other::text,'expectedCash',c.expected_cash::text,'expectedTransfer',c.expected_transfer::text,'expectedOther',c.expected_other::text,
   'notes',c.notes,'closedAt',c.closed_at,'closedBy',c.closed_by,'closedByName',app_private.cash_operator_name(c.closed_by),
   'difference',((c.declared_cash-c.expected_cash)+(c.declared_transfer-c.expected_transfer)+(c.declared_other-c.expected_other))::text) END
 FROM drawers d LEFT JOIN movements v ON v.seller_id=d.seller_id AND v.branch_id IS NOT DISTINCT FROM d.branch_id AND v.payment_type=d.payment_type
 LEFT JOIN public.branches b ON b.tenant_id=p_tenant AND b.id=d.branch_id
 LEFT JOIN public.cash_closings c ON c.tenant_id=p_tenant AND c.branch_id=d.branch_id AND c.seller_id=d.seller_id AND c.business_date=p_day AND c.payment_type=d.payment_type
 WHERE auth.uid() IS NOT NULL AND app_private.has_branch_permission(p_tenant,d.branch_id,'cash.read')
 AND (d.seller_id=auth.uid() OR app_private.has_branch_permission(p_tenant,d.branch_id,'cash.manage'))
 ORDER BY seller_name,d.seller_id,d.branch_id,d.payment_type
$$;

CREATE OR REPLACE FUNCTION public.cash_day_report(p_tenant_id uuid,p_day date) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF auth.uid() IS NULL OR NOT app_private.has_tenant_permission(p_tenant_id,'cash.read') THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF p_day IS NULL THEN RAISE EXCEPTION 'INVALID_DAY' USING ERRCODE='22023'; END IF;
 RETURN (SELECT coalesce(jsonb_agg(jsonb_build_object(
  'sellerId',r.seller_id,'sellerName',r.seller_name,'branchId',r.branch_id,'branchName',r.branch_name,
  'type',r.payment_type,'cash',r.cash::text,'transfer',r.transfer::text,'other',r.other::text,'movements',r.movements,'closing',r.closing,
  'session',CASE WHEN s.seller_id IS NULL THEN NULL ELSE jsonb_build_object(
    'opened_at',s.opened_at,'opened_by_name',s.opened_by_name,
    'delivered_at',s.delivered_at,'delivered_by',s.delivered_by,'delivered_by_name',s.delivered_by_name,
    'received_at',s.received_at,'received_by_name',s.received_by_name,'received_cash',s.received_cash::text,
    'received_transfer',s.received_transfer::text,'received_other',s.received_other::text,'receipt_notes',s.receipt_notes
  ) END
 ) ORDER BY r.seller_name,r.seller_id,r.branch_id,r.payment_type),'[]'::jsonb)
 FROM app_private.cash_day_rows(p_tenant_id,p_day) r LEFT JOIN public.cash_drawer_sessions s
 ON s.tenant_id=p_tenant_id AND s.business_date=p_day AND s.branch_id=r.branch_id AND s.seller_id=r.seller_id);
END $$;

CREATE OR REPLACE FUNCTION app_private.guard_closed_cash() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_payment public.payments%ROWTYPE; v_day date; v_branch uuid; v_timezone text;
BEGIN
 IF NEW.payment_id IS NULL OR NEW.entry_type NOT IN ('payment_received','payment_reversal') THEN RETURN NEW; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('cash:'||NEW.tenant_id::text,0));
 SELECT * INTO v_payment FROM public.payments WHERE tenant_id=NEW.tenant_id AND id=NEW.payment_id;
 SELECT timezone INTO v_timezone FROM public.tenants WHERE id=NEW.tenant_id;
 SELECT branch_id INTO v_branch FROM public.loans WHERE tenant_id=NEW.tenant_id AND id=v_payment.loan_id;
 IF NEW.entry_type='payment_received' THEN NEW.created_at:=v_payment.received_at;
 ELSIF auth.uid() IS NOT NULL THEN NEW.created_at:=clock_timestamp(); END IF;
 v_day:=(NEW.created_at AT TIME ZONE v_timezone)::date;
 IF EXISTS(SELECT 1 FROM public.cash_closings WHERE tenant_id=NEW.tenant_id AND branch_id=v_branch
   AND seller_id=v_payment.received_by AND business_date=v_day AND payment_type=v_payment.payment_type)
 OR EXISTS(SELECT 1 FROM public.cash_drawer_sessions WHERE tenant_id=NEW.tenant_id AND branch_id=v_branch
   AND seller_id=v_payment.received_by AND business_date=v_day AND delivered_at IS NOT NULL) THEN
  RAISE EXCEPTION 'CASH_ALREADY_CLOSED' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;

-- Older clients may still call close_cash_day directly during rollout.
CREATE FUNCTION app_private.guard_delivered_cash_closing() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('cash:'||NEW.tenant_id::text,0));
 IF EXISTS(SELECT 1 FROM public.cash_drawer_sessions WHERE tenant_id=NEW.tenant_id AND branch_id=NEW.branch_id
  AND seller_id=NEW.seller_id AND business_date=NEW.business_date AND delivered_at IS NOT NULL) THEN
  RAISE EXCEPTION 'CASH_ALREADY_CLOSED' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION app_private.guard_delivered_cash_closing() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER cash_closings_guard_delivered BEFORE INSERT ON public.cash_closings
 FOR EACH ROW EXECUTE FUNCTION app_private.guard_delivered_cash_closing();
--> statement-breakpoint
CREATE FUNCTION app_private.open_cash_drawer(p_tenant uuid,p_branch uuid,p_day date)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_actor uuid:=auth.uid(); v_today date;
BEGIN
 IF v_actor IS NULL OR p_branch IS NULL OR NOT app_private.has_branch_permission(p_tenant,p_branch,'cash.close') THEN
  RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501';
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('cash:'||p_tenant::text,0));
 SELECT (clock_timestamp() AT TIME ZONE timezone)::date INTO v_today FROM public.tenants WHERE id=p_tenant;
 IF p_day IS DISTINCT FROM v_today THEN RAISE EXCEPTION 'INVALID_DAY' USING ERRCODE='22023'; END IF;
 IF EXISTS(SELECT 1 FROM public.cash_drawer_sessions WHERE tenant_id=p_tenant AND branch_id=p_branch AND seller_id=v_actor
  AND business_date=p_day AND delivered_at IS NOT NULL)
 OR EXISTS(SELECT 1 FROM public.cash_closings WHERE tenant_id=p_tenant AND branch_id=p_branch AND seller_id=v_actor AND business_date=p_day) THEN
  RAISE EXCEPTION 'CASH_ALREADY_CLOSED' USING ERRCODE='23514';
 END IF;
 INSERT INTO public.cash_drawer_sessions(tenant_id,branch_id,seller_id,business_date,opened_at,opened_by,opened_by_name)
 VALUES(p_tenant,p_branch,v_actor,p_day,clock_timestamp(),v_actor,app_private.cash_operator_name(v_actor))
 ON CONFLICT (tenant_id,business_date,branch_id,seller_id) DO NOTHING;
 IF FOUND THEN
  INSERT INTO public.audit_logs(tenant_id,branch_id,actor_id,action,entity_type,entity_id,metadata)
  VALUES(p_tenant,p_branch,v_actor,'cash.opened','cash_drawer',v_actor,jsonb_build_object('sellerId',v_actor,'day',p_day));
 END IF;
END $$;

CREATE FUNCTION app_private.deliver_cash_drawer(p_tenant uuid,p_branch uuid,p_seller uuid,p_day date,p_counts jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_actor uuid:=auth.uid(); v_today date; v_row record; v_count jsonb; v_drawers int:=0; v_pending int:=0;
BEGIN
 IF v_actor IS NULL OR p_branch IS NULL OR p_seller IS NULL OR NOT app_private.has_branch_permission(p_tenant,p_branch,'cash.close')
  OR (p_seller<>v_actor AND NOT app_private.has_branch_permission(p_tenant,p_branch,'cash.manage')) THEN
  RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501';
 END IF;
 SELECT (clock_timestamp() AT TIME ZONE timezone)::date INTO v_today FROM public.tenants WHERE id=p_tenant;
 IF p_day IS NULL OR p_day>v_today OR jsonb_typeof(p_counts) IS DISTINCT FROM 'object' THEN
  RAISE EXCEPTION 'INVALID_CLOSING' USING ERRCODE='22023';
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('cash:'||p_tenant::text,0));
 IF EXISTS(SELECT 1 FROM public.cash_drawer_sessions WHERE tenant_id=p_tenant AND branch_id=p_branch AND seller_id=p_seller
  AND business_date=p_day AND delivered_at IS NOT NULL) THEN
  RAISE EXCEPTION 'CASH_ALREADY_DELIVERED' USING ERRCODE='23514';
 END IF;
 IF p_seller=v_actor AND p_day=v_today
  AND NOT EXISTS(SELECT 1 FROM public.cash_drawer_sessions WHERE tenant_id=p_tenant AND branch_id=p_branch AND seller_id=p_seller AND business_date=p_day)
  AND NOT EXISTS(SELECT 1 FROM public.cash_closings WHERE tenant_id=p_tenant AND branch_id=p_branch AND seller_id=p_seller AND business_date=p_day) THEN
  RAISE EXCEPTION 'CASH_OPEN_REQUIRED' USING ERRCODE='23514';
 END IF;
 FOR v_row IN SELECT r.payment_type,r.closing FROM app_private.cash_day_rows(p_tenant,p_day) r
  WHERE r.branch_id=p_branch AND r.seller_id=p_seller AND r.payment_type IN ('down_payment','installment') LOOP
  v_drawers:=v_drawers+1;
  IF v_row.closing IS NULL THEN
   v_pending:=v_pending+1;
   v_count:=p_counts->v_row.payment_type;
   IF jsonb_typeof(v_count) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'CASH_REVIEW_REQUIRED' USING ERRCODE='23514'; END IF;
   PERFORM app_private.close_cash_day(p_tenant,p_branch,p_seller,p_day,v_row.payment_type,
    (v_count->>'cash')::numeric,(v_count->>'transfer')::numeric,(v_count->>'other')::numeric,v_count->>'notes');
  END IF;
 END LOOP;
 IF v_drawers=0 THEN RAISE EXCEPTION 'DRAWER_NOT_FOUND' USING ERRCODE='23514'; END IF;
 IF v_pending<>(SELECT count(*) FROM jsonb_object_keys(p_counts)) THEN
  RAISE EXCEPTION 'CASH_REVIEW_REQUIRED' USING ERRCODE='23514';
 END IF;
 INSERT INTO public.cash_drawer_sessions(tenant_id,branch_id,seller_id,business_date,delivered_at,delivered_by,delivered_by_name)
 VALUES(p_tenant,p_branch,p_seller,p_day,clock_timestamp(),v_actor,app_private.cash_operator_name(v_actor))
 ON CONFLICT (tenant_id,business_date,branch_id,seller_id) DO UPDATE SET
  delivered_at=excluded.delivered_at,delivered_by=excluded.delivered_by,delivered_by_name=excluded.delivered_by_name;
 INSERT INTO public.audit_logs(tenant_id,branch_id,actor_id,action,entity_type,entity_id,metadata)
 VALUES(p_tenant,p_branch,v_actor,'cash.delivered','cash_drawer',p_seller,jsonb_build_object('sellerId',p_seller,'day',p_day));
END $$;

CREATE FUNCTION app_private.receive_cash_drawer(p_tenant uuid,p_branch uuid,p_seller uuid,p_day date,
 p_cash numeric,p_transfer numeric,p_other numeric,p_notes text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_actor uuid:=auth.uid(); v_drawer public.cash_drawer_sessions%ROWTYPE; v_totals record;
 v_notes text:=nullif(btrim(p_notes),'');
BEGIN
 IF v_actor IS NULL OR p_branch IS NULL OR p_seller IS NULL OR v_actor=p_seller
  OR NOT app_private.has_branch_permission(p_tenant,p_branch,'cash.receive') THEN
  RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501';
 END IF;
 IF p_day IS NULL OR EXISTS (SELECT 1 FROM unnest(ARRAY[p_cash,p_transfer,p_other]) AS a(amount)
  WHERE amount IS NULL OR amount::text IN ('NaN','Infinity','-Infinity')
    OR abs(amount)>9999999999999.99 OR amount<>round(amount,2)) OR length(v_notes)>1000 THEN
  RAISE EXCEPTION 'INVALID_RECEIPT' USING ERRCODE='22023';
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('cash:'||p_tenant::text,0));
 SELECT * INTO v_drawer FROM public.cash_drawer_sessions WHERE tenant_id=p_tenant AND branch_id=p_branch
  AND seller_id=p_seller AND business_date=p_day;
 IF v_drawer.delivered_at IS NULL THEN RAISE EXCEPTION 'CASH_NOT_DELIVERED' USING ERRCODE='23514'; END IF;
 IF v_drawer.delivered_by=v_actor THEN RAISE EXCEPTION 'CASH_SELF_RECEIPT' USING ERRCODE='42501'; END IF;
 IF v_drawer.received_at IS NOT NULL THEN
  IF v_drawer.received_by=v_actor AND v_drawer.received_cash=p_cash AND v_drawer.received_transfer=p_transfer
   AND v_drawer.received_other=p_other AND v_drawer.receipt_notes IS NOT DISTINCT FROM v_notes THEN RETURN; END IF;
  RAISE EXCEPTION 'CASH_ALREADY_RECEIVED' USING ERRCODE='23514';
 END IF;
 SELECT sum(declared_cash) AS cash,sum(declared_transfer) AS transfer,sum(declared_other) AS other
  INTO v_totals FROM public.cash_closings WHERE tenant_id=p_tenant AND branch_id=p_branch AND seller_id=p_seller AND business_date=p_day;
 IF (p_cash<>v_totals.cash OR p_transfer<>v_totals.transfer OR p_other<>v_totals.other) AND coalesce(length(v_notes),0)<5 THEN
  RAISE EXCEPTION 'RECEIPT_DIFFERENCE_REASON_REQUIRED' USING ERRCODE='22023';
 END IF;
 UPDATE public.cash_drawer_sessions SET received_at=clock_timestamp(),received_by=v_actor,
  received_by_name=app_private.cash_operator_name(v_actor),received_cash=p_cash,received_transfer=p_transfer,received_other=p_other,receipt_notes=v_notes
  WHERE tenant_id=p_tenant AND branch_id=p_branch AND seller_id=p_seller AND business_date=p_day;
 INSERT INTO public.audit_logs(tenant_id,branch_id,actor_id,action,entity_type,entity_id,metadata)
 VALUES(p_tenant,p_branch,v_actor,'cash.received','cash_drawer',p_seller,jsonb_build_object(
  'sellerId',p_seller,'day',p_day,'receivedCash',p_cash,'receivedTransfer',p_transfer,'receivedOther',p_other,
  'differenceCash',p_cash-v_totals.cash,'differenceTransfer',p_transfer-v_totals.transfer,'differenceOther',p_other-v_totals.other,'notes',v_notes));
END $$;
--> statement-breakpoint
CREATE FUNCTION public.open_cash_drawer(p_tenant_id uuid,p_branch_id uuid,p_day date)
RETURNS void LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$
 SELECT app_private.open_cash_drawer(p_tenant_id,p_branch_id,p_day)
$$;
CREATE FUNCTION public.deliver_cash_drawer(p_tenant_id uuid,p_branch_id uuid,p_seller_id uuid,p_day date,p_counts jsonb)
RETURNS void LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$
 SELECT app_private.deliver_cash_drawer(p_tenant_id,p_branch_id,p_seller_id,p_day,p_counts)
$$;
CREATE FUNCTION public.receive_cash_drawer(p_tenant_id uuid,p_branch_id uuid,p_seller_id uuid,p_day date,
 p_cash numeric,p_transfer numeric,p_other numeric,p_notes text)
RETURNS void LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$
 SELECT app_private.receive_cash_drawer(p_tenant_id,p_branch_id,p_seller_id,p_day,p_cash,p_transfer,p_other,p_notes)
$$;

REVOKE ALL ON FUNCTION app_private.open_cash_drawer(uuid,uuid,date),public.open_cash_drawer(uuid,uuid,date),
 app_private.deliver_cash_drawer(uuid,uuid,uuid,date,jsonb),public.deliver_cash_drawer(uuid,uuid,uuid,date,jsonb),
 app_private.receive_cash_drawer(uuid,uuid,uuid,date,numeric,numeric,numeric,text),public.receive_cash_drawer(uuid,uuid,uuid,date,numeric,numeric,numeric,text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION app_private.open_cash_drawer(uuid,uuid,date),public.open_cash_drawer(uuid,uuid,date),
 app_private.deliver_cash_drawer(uuid,uuid,uuid,date,jsonb),public.deliver_cash_drawer(uuid,uuid,uuid,date,jsonb),
 app_private.receive_cash_drawer(uuid,uuid,uuid,date,numeric,numeric,numeric,text),public.receive_cash_drawer(uuid,uuid,uuid,date,numeric,numeric,numeric,text)
 TO authenticated;
