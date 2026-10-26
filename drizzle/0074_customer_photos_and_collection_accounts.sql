-- Private, compact customer portraits. Works with the existing local database without a public bucket.
CREATE TABLE public.customer_photos (
  customer_id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  image_data bytea NOT NULL,
  content_type text NOT NULL DEFAULT 'image/webp' CHECK (content_type='image/webp'),
  updated_by uuid NOT NULL REFERENCES auth.users(id),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY (tenant_id,customer_id) REFERENCES public.customers(tenant_id,id),
  CHECK (octet_length(image_data) BETWEEN 12 AND 1048576),
  CHECK (substring(image_data FROM 1 FOR 4)=decode('52494646','hex') AND substring(image_data FROM 9 FOR 4)=decode('57454250','hex'))
);
CREATE INDEX customer_photos_tenant_idx ON public.customer_photos(tenant_id);
ALTER TABLE public.customer_photos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.customer_photos FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public.customer_photos TO authenticated;
CREATE POLICY customer_photos_read ON public.customer_photos FOR SELECT TO authenticated
  USING(EXISTS(SELECT 1 FROM public.customers c WHERE c.tenant_id=customer_photos.tenant_id AND c.id=customer_photos.customer_id
    AND app_private.has_branch_permission(c.tenant_id,c.branch_id,'customers.read')));
CREATE POLICY customer_photos_insert ON public.customer_photos FOR INSERT TO authenticated
  WITH CHECK(updated_by=(SELECT auth.uid()) AND EXISTS(SELECT 1 FROM public.customers c
    WHERE c.tenant_id=customer_photos.tenant_id AND c.id=customer_photos.customer_id
    AND app_private.has_branch_permission(c.tenant_id,c.branch_id,'customers.write')));
CREATE POLICY customer_photos_update ON public.customer_photos FOR UPDATE TO authenticated
  USING(EXISTS(SELECT 1 FROM public.customers c WHERE c.tenant_id=customer_photos.tenant_id AND c.id=customer_photos.customer_id
    AND app_private.has_branch_permission(c.tenant_id,c.branch_id,'customers.write')))
  WITH CHECK(updated_by=(SELECT auth.uid()) AND EXISTS(SELECT 1 FROM public.customers c
    WHERE c.tenant_id=customer_photos.tenant_id AND c.id=customer_photos.customer_id
    AND app_private.has_branch_permission(c.tenant_id,c.branch_id,'customers.write')));
--> statement-breakpoint
-- One account per visible customer; installment amounts remain authoritative and unchanged.
CREATE VIEW public.customer_collection_accounts WITH (security_invoker=true) AS
WITH loan_totals AS (
  SELECT l.tenant_id,l.customer_id,
    count(DISTINCT l.id) FILTER(WHERE l.status='active')::integer AS active_loans,
    count(DISTINCT l.id) FILTER(WHERE l.status='paid_off')::integer AS paid_loans,
    coalesce(sum(greatest(0,i.amount_due-i.amount_paid)) FILTER(WHERE l.status='active' AND i.status<>'waived'),0) AS balance,
    coalesce(sum(greatest(0,i.amount_due-i.amount_paid)) FILTER(WHERE l.status='active' AND i.status<>'waived' AND i.due_date<(now() AT TIME ZONE 'America/Santo_Domingo')::date),0) AS overdue_balance,
    coalesce(sum(greatest(0,i.amount_due-i.amount_paid)) FILTER(WHERE l.status='active' AND i.status<>'waived' AND i.due_date=(now() AT TIME ZONE 'America/Santo_Domingo')::date),0) AS today_balance,
    count(i.id) FILTER(WHERE l.status='active' AND i.status<>'waived' AND i.amount_paid<i.amount_due)::integer AS pending_installments,
    count(i.id) FILTER(WHERE l.status='active' AND i.status<>'waived' AND i.amount_paid<i.amount_due AND i.due_date<(now() AT TIME ZONE 'America/Santo_Domingo')::date)::integer AS overdue_installments,
    min(i.due_date) FILTER(WHERE l.status='active' AND i.status<>'waived' AND i.amount_paid<i.amount_due) AS next_due_date,
    coalesce(max((now() AT TIME ZONE 'America/Santo_Domingo')::date-i.due_date) FILTER(WHERE l.status='active' AND i.status<>'waived' AND i.amount_paid<i.amount_due AND i.due_date<(now() AT TIME ZONE 'America/Santo_Domingo')::date),0) AS overdue_days
  FROM public.loans l LEFT JOIN public.installments i ON i.tenant_id=l.tenant_id AND i.loan_id=l.id
  GROUP BY l.tenant_id,l.customer_id
)
SELECT c.id AS customer_id,c.tenant_id,c.branch_id,c.full_name,c.identity_number,c.phone,b.name AS branch_name,p.updated_at AS photo_updated_at,
  coalesce(t.active_loans,0) AS active_loans,coalesce(t.paid_loans,0) AS paid_loans,
  coalesce(t.balance,0) AS balance,coalesce(t.overdue_balance,0) AS overdue_balance,coalesce(t.today_balance,0) AS today_balance,
  coalesce(t.pending_installments,0) AS pending_installments,coalesce(t.overdue_installments,0) AS overdue_installments,
  t.next_due_date,coalesce(t.overdue_days,0) AS overdue_days,
  CASE WHEN t.overdue_balance>0 THEN 'overdue' WHEN t.today_balance>0 THEN 'due'
    WHEN t.balance>0 THEN 'current' WHEN t.paid_loans>0 OR t.active_loans>0 THEN 'settled' ELSE 'none' END AS collection_status
FROM public.customers c
LEFT JOIN loan_totals t ON t.tenant_id=c.tenant_id AND t.customer_id=c.id
LEFT JOIN public.branches b ON b.tenant_id=c.tenant_id AND b.id=c.branch_id
LEFT JOIN public.customer_photos p ON p.tenant_id=c.tenant_id AND p.customer_id=c.id
WHERE app_private.has_branch_permission(c.tenant_id,c.branch_id,'payments.read');
REVOKE ALL ON public.customer_collection_accounts FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.customer_collection_accounts TO authenticated;
--> statement-breakpoint
CREATE FUNCTION public.customer_collection_page(
  p_tenant_id uuid,p_search text DEFAULT '',p_status text DEFAULT '',p_branch_id uuid DEFAULT NULL,
  p_from date DEFAULT NULL,p_to date DEFAULT NULL,p_page integer DEFAULT 1,p_page_size integer DEFAULT 25
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE v_result jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE='42501'; END IF;
  IF p_tenant_id IS NULL OR NOT app_private.has_tenant_permission(p_tenant_id,'payments.read') THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
  IF p_status IS NULL OR p_status NOT IN ('','balance','current','due','overdue','settled','none')
    OR p_page IS NULL OR p_page NOT BETWEEN 1 AND 100000 OR p_page_size IS NULL OR p_page_size NOT BETWEEN 1 AND 100
    OR length(coalesce(p_search,''))>100 OR (p_from IS NOT NULL AND p_to IS NOT NULL AND p_from>p_to)
    THEN RAISE EXCEPTION 'INVALID_FILTER' USING ERRCODE='22023'; END IF;
  WITH scope AS MATERIALIZED (
    SELECT a.* FROM public.customer_collection_accounts a WHERE a.tenant_id=p_tenant_id
      AND (p_branch_id IS NULL OR a.branch_id=p_branch_id)
      AND (p_from IS NULL OR a.next_due_date>=p_from) AND (p_to IS NULL OR a.next_due_date<=p_to)
      AND (coalesce(btrim(p_search),'')='' OR a.full_name ILIKE '%'||btrim(p_search)||'%'
        OR a.identity_number ILIKE '%'||btrim(p_search)||'%' OR a.phone ILIKE '%'||btrim(p_search)||'%'
        OR (regexp_replace(p_search,'[^0-9]','','g')<>'' AND
          (regexp_replace(coalesce(a.identity_number,''),'[^0-9]','','g') LIKE '%'||regexp_replace(p_search,'[^0-9]','','g')||'%'
          OR regexp_replace(coalesce(a.phone,''),'[^0-9]','','g') LIKE '%'||regexp_replace(p_search,'[^0-9]','','g')||'%')))
  ), filtered AS (
    SELECT * FROM scope WHERE p_status='' OR (p_status='balance' AND balance>0) OR collection_status=p_status
  ), page_rows AS (
    SELECT * FROM filtered ORDER BY overdue_days DESC,balance DESC,full_name,customer_id LIMIT p_page_size OFFSET (p_page-1)*p_page_size
  )
  SELECT jsonb_build_object('count',(SELECT count(*) FROM filtered),'counts',
    (SELECT jsonb_build_object('all',count(*),'balance',count(*) FILTER(WHERE balance>0),
      'current',count(*) FILTER(WHERE collection_status='current'),'due',count(*) FILTER(WHERE collection_status='due'),
      'overdue',count(*) FILTER(WHERE collection_status='overdue'),'settled',count(*) FILTER(WHERE collection_status='settled'),
      'none',count(*) FILTER(WHERE collection_status='none')) FROM scope),
    'rows',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',customer_id,'name',full_name,'identity',identity_number,'phone',phone,
      'branch',branch_name,'photoUpdatedAt',photo_updated_at,'status',collection_status,'activeLoans',active_loans,'paidLoans',paid_loans,
      'balance',balance::text,'overdueBalance',overdue_balance::text,'todayBalance',today_balance::text,
      'pendingInstallments',pending_installments,'overdueInstallments',overdue_installments,'overdueDays',overdue_days,'nextDueDate',next_due_date)
      ORDER BY overdue_days DESC,balance DESC,full_name,customer_id),'[]'::jsonb) FROM page_rows)) INTO v_result;
  RETURN v_result;
END $$;
REVOKE ALL ON FUNCTION public.customer_collection_page(uuid,text,text,uuid,date,date,integer,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.customer_collection_page(uuid,text,text,uuid,date,date,integer,integer) TO authenticated;
