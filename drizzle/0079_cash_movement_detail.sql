-- Same authorization as the daily report, with bounded pages for receipt-level verification.
CREATE FUNCTION app_private.cash_day_movements(p_tenant uuid,p_branch uuid,p_seller uuid,p_day date,p_type text,p_page integer)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_result jsonb;
BEGIN
 IF auth.uid() IS NULL OR NOT app_private.has_branch_permission(p_tenant,p_branch,'cash.read')
  OR (p_seller IS DISTINCT FROM auth.uid() AND NOT app_private.has_branch_permission(p_tenant,p_branch,'cash.manage')) THEN
  RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501';
 END IF;
 IF p_day IS NULL OR p_branch IS NULL OR p_seller IS NULL OR p_type IS NULL OR p_type NOT IN ('down_payment','installment')
  OR p_page IS NULL OR p_page NOT BETWEEN 1 AND 100000 THEN RAISE EXCEPTION 'INVALID_FILTER' USING ERRCODE='22023'; END IF;
 WITH filtered AS MATERIALIZED (
  SELECT e.id,e.created_at,e.entry_type,e.amount,p.id AS payment_id,p.receipt_number,p.payment_method,p.reference,
   c.full_name,ct.contract_number,l.id AS loan_id
  FROM public.ledger_entries e JOIN public.payments p ON p.tenant_id=e.tenant_id AND p.id=e.payment_id
  JOIN public.loans l ON l.tenant_id=p.tenant_id AND l.id=p.loan_id JOIN public.tenants t ON t.id=p.tenant_id
  JOIN public.customers c ON c.tenant_id=l.tenant_id AND c.id=l.customer_id
  JOIN public.credit_contracts ct ON ct.tenant_id=l.tenant_id AND ct.id=l.contract_id
  WHERE e.tenant_id=p_tenant AND l.branch_id=p_branch AND p.received_by=p_seller AND p.payment_type=p_type
   AND e.entry_type IN ('payment_received','payment_reversal')
   AND e.created_at >= (p_day::timestamp AT TIME ZONE t.timezone) AND e.created_at < ((p_day+1)::timestamp AT TIME ZONE t.timezone)
 ), page_rows AS (SELECT * FROM filtered ORDER BY created_at DESC,id DESC LIMIT 25 OFFSET (p_page-1)*25)
 SELECT jsonb_build_object('count',(SELECT count(*) FROM filtered),'total',(SELECT coalesce(sum(amount),0)::text FROM filtered),
  'rows',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'at',created_at,'kind',entry_type,'amount',amount::text,
   'paymentId',payment_id,'receipt',receipt_number,'method',payment_method,'reference',reference,'customer',full_name,
   'contract',contract_number,'loanId',loan_id) ORDER BY created_at DESC,id DESC),'[]'::jsonb) FROM page_rows)) INTO v_result;
 RETURN v_result;
END $$;
REVOKE ALL ON FUNCTION app_private.cash_day_movements(uuid,uuid,uuid,date,text,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION app_private.cash_day_movements(uuid,uuid,uuid,date,text,integer) TO authenticated;
CREATE FUNCTION public.cash_day_movements(p_tenant_id uuid,p_branch_id uuid,p_seller_id uuid,p_day date,p_type text,p_page integer DEFAULT 1)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT app_private.cash_day_movements(p_tenant_id,p_branch_id,p_seller_id,p_day,p_type,p_page)
$$;
REVOKE ALL ON FUNCTION public.cash_day_movements(uuid,uuid,uuid,date,text,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.cash_day_movements(uuid,uuid,uuid,date,text,integer) TO authenticated;
--> statement-breakpoint
DO $migration$
DECLARE v_source text;
BEGIN
 v_source:=pg_get_functiondef('public.tenant_receipt_page(uuid,text,text,text,text,uuid,uuid,date,date,integer,integer)'::regprocedure);
 IF position('SELECT p.id,p.amount' IN v_source)=0 OR position('''id'',id,''amount''' IN v_source)=0
  OR position('OR p.id::text ILIKE' IN v_source)=0 THEN RAISE EXCEPTION 'Unexpected receipt directory'; END IF;
 v_source:=replace(v_source,'SELECT p.id,p.amount','SELECT p.id,p.receipt_number,p.amount');
 v_source:=replace(v_source,'''id'',id,''amount''','''id'',id,''receiptNumber'',receipt_number,''amount''');
 v_source:=replace(v_source,'OR p.id::text ILIKE','OR p.receipt_number ILIKE ''%''||btrim(p_search)||''%'' OR p.id::text ILIKE');
 EXECUTE v_source;
END $migration$;
