-- Daily reconciliation uses ledger movements on the day money was received or reversed.
-- Existing contracts and receipts retain their original identifiers.
CREATE TABLE public.cash_closings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  branch_id uuid NOT NULL,
  seller_id uuid NOT NULL,
  business_date date NOT NULL,
  payment_type varchar(24) NOT NULL CHECK(payment_type IN ('down_payment','installment')),
  expected_cash numeric(14,2) NOT NULL, expected_transfer numeric(14,2) NOT NULL, expected_other numeric(14,2) NOT NULL,
  declared_cash numeric(14,2) NOT NULL, declared_transfer numeric(14,2) NOT NULL, declared_other numeric(14,2) NOT NULL,
  notes text CHECK(length(notes)<=1000), closed_by uuid NOT NULL REFERENCES auth.users(id),
  closed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY(tenant_id,branch_id) REFERENCES public.branches(tenant_id,id),
  FOREIGN KEY(tenant_id,seller_id) REFERENCES public.tenant_memberships(tenant_id,user_id)
);
CREATE UNIQUE INDEX cash_closings_drawer_uidx ON public.cash_closings(tenant_id,branch_id,seller_id,business_date,payment_type);
ALTER TABLE public.cash_closings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.cash_closings FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.cash_closings TO authenticated;
INSERT INTO public.permissions(key,description) VALUES
 ('cash.read','Consultar cuadre diario de caja'),('cash.close','Cerrar caja diaria propia'),
 ('cash.manage','Consultar y cerrar todas las cajas de la sucursal'),('financing.activate','Entregar un financiamiento ya aprobado');
INSERT INTO public.role_permissions(role_id,permission_id)
 SELECT r.id,p.id FROM public.roles r CROSS JOIN public.permissions p
 WHERE (p.key='cash.read' AND r.key IN ('tenant_admin','branch_manager','sales','cashier','collections','auditor'))
 OR (p.key='cash.close' AND r.key IN ('tenant_admin','branch_manager','sales','cashier','collections'))
 OR (p.key='cash.manage' AND r.key IN ('tenant_admin','branch_manager','auditor'))
 OR (p.key='financing.activate' AND r.key IN ('tenant_admin','branch_manager','sales'))
 OR (p.key IN ('payments.read','payments.record') AND r.key='sales')
 ON CONFLICT DO NOTHING;
CREATE POLICY cash_closings_read ON public.cash_closings FOR SELECT TO authenticated USING(
 app_private.has_branch_permission(tenant_id,branch_id,'cash.read')
 AND (seller_id=auth.uid() OR app_private.has_branch_permission(tenant_id,branch_id,'cash.manage')));
--> statement-breakpoint
-- Private, atomic counters. The unique indexes remain the final duplicate guard.
CREATE TABLE app_private.document_counters(
 tenant_id uuid NOT NULL REFERENCES public.tenants(id), kind text NOT NULL, year integer NOT NULL,
 last_value bigint NOT NULL CHECK(last_value>0), PRIMARY KEY(tenant_id,kind,year));
REVOKE ALL ON app_private.document_counters FROM PUBLIC,anon,authenticated;
CREATE FUNCTION app_private.next_document_number(p_tenant uuid,p_kind text) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_year integer; v_next bigint; v_number text;
BEGIN
 IF p_kind NOT IN ('FIN','REC') THEN RAISE EXCEPTION 'INVALID_DOCUMENT_KIND'; END IF;
 SELECT extract(year FROM clock_timestamp() AT TIME ZONE timezone)::integer INTO v_year FROM public.tenants WHERE id=p_tenant;
 LOOP
  INSERT INTO app_private.document_counters(tenant_id,kind,year,last_value) VALUES(p_tenant,p_kind,v_year,1)
   ON CONFLICT(tenant_id,kind,year) DO UPDATE SET last_value=document_counters.last_value+1 RETURNING last_value INTO v_next;
  v_number:=p_kind||'-'||v_year||'-'||lpad(v_next::text,greatest(6,length(v_next::text)), '0');
  EXIT WHEN (p_kind='FIN' AND NOT EXISTS(SELECT 1 FROM public.credit_contracts WHERE tenant_id=p_tenant AND contract_number=v_number))
   OR (p_kind='REC' AND NOT EXISTS(SELECT 1 FROM public.payments WHERE tenant_id=p_tenant AND receipt_number=v_number));
 END LOOP;
 RETURN v_number;
END $$;
REVOKE ALL ON FUNCTION app_private.next_document_number(uuid,text) FROM PUBLIC,anon,authenticated;
ALTER TABLE public.payments ADD COLUMN receipt_number varchar(64);
CREATE UNIQUE INDEX payments_tenant_receipt_uidx ON public.payments(tenant_id,receipt_number);
CREATE FUNCTION app_private.number_payment() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF TG_OP='UPDATE' THEN
  IF NEW.receipt_number IS DISTINCT FROM OLD.receipt_number THEN RAISE EXCEPTION 'RECEIPT_NUMBER_IMMUTABLE' USING ERRCODE='42501'; END IF;
 ELSE
  PERFORM pg_advisory_xact_lock(hashtextextended('cash:'||NEW.tenant_id::text,0));
  NEW.receipt_number:=app_private.next_document_number(NEW.tenant_id,'REC');
  IF auth.uid() IS NOT NULL THEN NEW.received_at:=clock_timestamp(); END IF;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION app_private.number_payment() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER payments_number BEFORE INSERT OR UPDATE ON public.payments FOR EACH ROW EXECUTE FUNCTION app_private.number_payment();
DO $migration$
DECLARE v_source text; v_old text;
BEGIN
 v_source:=pg_get_functiondef('app_private.review_credit_application(uuid,text,text,text,text,boolean)'::regprocedure);
 v_old:='v_contract_number := ''KM-'' || to_char(current_date,''YYYY'') || ''-'' || upper(substr(replace(v_application.id::text,''-'',''''),1,8));';
 IF position(v_old IN v_source)=0 THEN RAISE EXCEPTION 'Unexpected contract numbering function'; END IF;
 EXECUTE replace(v_source,v_old,'v_contract_number := app_private.next_document_number(v_application.tenant_id,''FIN'');');
 v_source:=pg_get_functiondef('app_private.activate_approved_loan(uuid,text,text,uuid,text,boolean,date)'::regprocedure);
 v_old:='app_private.has_branch_permission(v_loan.tenant_id,v_loan.branch_id,''financing.approve'')';
 IF position(v_old IN v_source)=0 THEN RAISE EXCEPTION 'Unexpected activation authorization'; END IF;
 EXECUTE replace(v_source,v_old,'app_private.has_branch_permission(v_loan.tenant_id,v_loan.branch_id,''financing.activate'')');
END $migration$;
--> statement-breakpoint
-- Both close and posting take the same tenant lock. No late movement can silently change a signed close.
CREATE FUNCTION app_private.guard_closed_cash() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_payment public.payments%ROWTYPE; v_day date; v_branch uuid; v_timezone text;
BEGIN
 IF NEW.payment_id IS NULL OR NEW.entry_type NOT IN ('payment_received','payment_reversal') THEN RETURN NEW; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('cash:'||NEW.tenant_id::text,0));
 SELECT * INTO v_payment FROM public.payments WHERE tenant_id=NEW.tenant_id AND id=NEW.payment_id;
 SELECT timezone INTO v_timezone FROM public.tenants WHERE id=NEW.tenant_id;
 SELECT branch_id INTO v_branch FROM public.loans WHERE tenant_id=NEW.tenant_id AND id=v_payment.loan_id;
 -- A receipt belongs to its actual received date; a compensating reversal belongs to today's drawer.
 IF NEW.entry_type='payment_received' THEN NEW.created_at:=v_payment.received_at;
 ELSIF auth.uid() IS NOT NULL THEN NEW.created_at:=clock_timestamp(); END IF;
 v_day:=(NEW.created_at AT TIME ZONE v_timezone)::date;
 IF EXISTS(SELECT 1 FROM public.cash_closings WHERE tenant_id=NEW.tenant_id AND branch_id=v_branch
   AND seller_id=v_payment.received_by AND business_date=v_day AND payment_type=v_payment.payment_type) THEN
  RAISE EXCEPTION 'CASH_ALREADY_CLOSED' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION app_private.guard_closed_cash() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER ledger_closed_cash BEFORE INSERT ON public.ledger_entries FOR EACH ROW EXECUTE FUNCTION app_private.guard_closed_cash();
--> statement-breakpoint
-- Definer is needed for names from Auth and to include sellers with zero collections.
-- Scope is verified explicitly for every returned branch and drawer.
CREATE FUNCTION app_private.cash_day_rows(p_tenant uuid,p_day date)
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
   WHERE m.tenant_id=p_tenant AND m.status='active' AND m.role IN ('sales','cashier','collections') AND m.branch_id IS NOT NULL
  UNION SELECT seller_id,branch_id,payment_type FROM movements
  UNION SELECT seller_id,branch_id,payment_type FROM public.cash_closings WHERE tenant_id=p_tenant AND business_date=p_day
 )
 SELECT d.seller_id,coalesce(nullif(u.raw_user_meta_data->>'full_name',''),u.email,'Usuario')::text AS seller_name,
  d.branch_id,b.name::text,d.payment_type,coalesce(v.cash,0),coalesce(v.transfer,0),coalesce(v.other,0),coalesce(v.movements,0),
  CASE WHEN c.id IS NULL THEN NULL ELSE jsonb_build_object('id',c.id,'cash',c.declared_cash::text,'transfer',c.declared_transfer::text,
   'other',c.declared_other::text,'expectedCash',c.expected_cash::text,'expectedTransfer',c.expected_transfer::text,'expectedOther',c.expected_other::text,
   'notes',c.notes,'closedAt',c.closed_at,'closedBy',c.closed_by,
   'difference',((c.declared_cash-c.expected_cash)+(c.declared_transfer-c.expected_transfer)+(c.declared_other-c.expected_other))::text) END
 FROM drawers d LEFT JOIN movements v ON v.seller_id=d.seller_id AND v.branch_id IS NOT DISTINCT FROM d.branch_id AND v.payment_type=d.payment_type
 LEFT JOIN auth.users u ON u.id=d.seller_id LEFT JOIN public.branches b ON b.tenant_id=p_tenant AND b.id=d.branch_id
 LEFT JOIN public.cash_closings c ON c.tenant_id=p_tenant AND c.branch_id=d.branch_id AND c.seller_id=d.seller_id AND c.business_date=p_day AND c.payment_type=d.payment_type
 WHERE auth.uid() IS NOT NULL AND app_private.has_branch_permission(p_tenant,d.branch_id,'cash.read')
 AND (d.seller_id=auth.uid() OR app_private.has_branch_permission(p_tenant,d.branch_id,'cash.manage'))
 ORDER BY seller_name,d.seller_id,d.branch_id,d.payment_type
$$;
REVOKE ALL ON FUNCTION app_private.cash_day_rows(uuid,date) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION app_private.cash_day_rows(uuid,date) TO authenticated;
CREATE FUNCTION public.cash_day_report(p_tenant_id uuid,p_day date) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF auth.uid() IS NULL OR NOT app_private.has_tenant_permission(p_tenant_id,'cash.read') THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF p_day IS NULL THEN RAISE EXCEPTION 'INVALID_DAY' USING ERRCODE='22023'; END IF;
 RETURN (SELECT coalesce(jsonb_agg(jsonb_build_object('sellerId',r.seller_id,'sellerName',r.seller_name,'branchId',r.branch_id,'branchName',r.branch_name,
  'type',r.payment_type,'cash',r.cash::text,'transfer',r.transfer::text,'other',r.other::text,'movements',r.movements,'closing',r.closing)), '[]'::jsonb)
  FROM app_private.cash_day_rows(p_tenant_id,p_day) r);
END $$;
REVOKE ALL ON FUNCTION public.cash_day_report(uuid,date) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.cash_day_report(uuid,date) TO authenticated;
--> statement-breakpoint
CREATE FUNCTION app_private.close_cash_day(p_tenant uuid,p_branch uuid,p_seller uuid,p_day date,p_type text,
 p_cash numeric,p_transfer numeric,p_other numeric,p_notes text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_row record; v_id uuid; v_today date; v_existing public.cash_closings%ROWTYPE;
BEGIN
 IF auth.uid() IS NULL OR NOT app_private.has_branch_permission(p_tenant,p_branch,'cash.close')
  OR (p_seller IS DISTINCT FROM auth.uid() AND NOT app_private.has_branch_permission(p_tenant,p_branch,'cash.manage')) THEN
  RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501';
 END IF;
 SELECT (clock_timestamp() AT TIME ZONE timezone)::date INTO v_today FROM public.tenants WHERE id=p_tenant;
 IF p_day IS NULL OR p_day>v_today OR p_type IS NULL OR p_type NOT IN ('down_payment','installment')
  OR p_cash IS NULL OR p_transfer IS NULL OR p_other IS NULL
  OR p_cash::text IN ('NaN','Infinity','-Infinity') OR p_transfer::text IN ('NaN','Infinity','-Infinity') OR p_other::text IN ('NaN','Infinity','-Infinity')
  OR abs(p_cash)>999999999999.99 OR abs(p_transfer)>999999999999.99 OR abs(p_other)>999999999999.99
  OR p_cash<>round(p_cash,2) OR p_transfer<>round(p_transfer,2) OR p_other<>round(p_other,2)
  OR length(coalesce(p_notes,''))>1000 THEN RAISE EXCEPTION 'INVALID_CLOSING' USING ERRCODE='22023'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('cash:'||p_tenant::text,0));
 SELECT * INTO v_existing FROM public.cash_closings WHERE tenant_id=p_tenant AND branch_id=p_branch AND seller_id=p_seller AND business_date=p_day AND payment_type=p_type;
 IF FOUND THEN
  IF v_existing.declared_cash=p_cash AND v_existing.declared_transfer=p_transfer AND v_existing.declared_other=p_other
   AND coalesce(v_existing.notes,'')=coalesce(nullif(btrim(p_notes),''),'') THEN RETURN v_existing.id; END IF;
  RAISE EXCEPTION 'CASH_ALREADY_CLOSED' USING ERRCODE='23514';
 END IF;
 SELECT * INTO v_row FROM app_private.cash_day_rows(p_tenant,p_day) r WHERE r.seller_id=p_seller AND r.branch_id=p_branch AND r.payment_type=p_type;
 IF NOT FOUND THEN RAISE EXCEPTION 'DRAWER_NOT_FOUND' USING ERRCODE='22023'; END IF;
 IF (p_cash<>v_row.cash OR p_transfer<>v_row.transfer OR p_other<>v_row.other) AND length(btrim(coalesce(p_notes,'')))<5 THEN
  RAISE EXCEPTION 'CLOSING_DIFFERENCE_REASON_REQUIRED' USING ERRCODE='22023';
 END IF;
 INSERT INTO public.cash_closings(tenant_id,branch_id,seller_id,business_date,payment_type,expected_cash,expected_transfer,expected_other,
  declared_cash,declared_transfer,declared_other,notes,closed_by)
 VALUES(p_tenant,p_branch,p_seller,p_day,p_type,v_row.cash,v_row.transfer,v_row.other,p_cash,p_transfer,p_other,nullif(btrim(p_notes),''),auth.uid()) RETURNING id INTO v_id;
 INSERT INTO public.audit_logs(tenant_id,branch_id,actor_id,action,entity_type,entity_id,metadata)
 VALUES(p_tenant,p_branch,auth.uid(),'cash.closed','cash_closing',v_id,jsonb_build_object('sellerId',p_seller,'day',p_day,'type',p_type,
  'expectedCash',v_row.cash,'expectedTransfer',v_row.transfer,'expectedOther',v_row.other,'declaredCash',p_cash,'declaredTransfer',p_transfer,'declaredOther',p_other,'notes',nullif(btrim(p_notes),'')));
 RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION app_private.close_cash_day(uuid,uuid,uuid,date,text,numeric,numeric,numeric,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION app_private.close_cash_day(uuid,uuid,uuid,date,text,numeric,numeric,numeric,text) TO authenticated;
CREATE FUNCTION public.close_cash_day(p_tenant_id uuid,p_branch_id uuid,p_seller_id uuid,p_day date,p_type text,
 p_cash numeric,p_transfer numeric,p_other numeric,p_notes text) RETURNS uuid
LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$
 SELECT app_private.close_cash_day(p_tenant_id,p_branch_id,p_seller_id,p_day,p_type,p_cash,p_transfer,p_other,p_notes)
$$;
REVOKE ALL ON FUNCTION public.close_cash_day(uuid,uuid,uuid,date,text,numeric,numeric,numeric,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.close_cash_day(uuid,uuid,uuid,date,text,numeric,numeric,numeric,text) TO authenticated;
