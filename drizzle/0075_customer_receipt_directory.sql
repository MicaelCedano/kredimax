-- Read-only directory of all existing payment receipts. No receipt or payment is recreated.
CREATE FUNCTION public.tenant_receipt_page(
  p_tenant_id uuid,p_search text DEFAULT '',p_status text DEFAULT '',p_type text DEFAULT '',p_method text DEFAULT '',
  p_branch_id uuid DEFAULT NULL,p_customer_id uuid DEFAULT NULL,p_from date DEFAULT NULL,p_to date DEFAULT NULL,
  p_page integer DEFAULT 1,p_page_size integer DEFAULT 25
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE v_result jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE='42501'; END IF;
  IF p_tenant_id IS NULL OR NOT app_private.has_tenant_permission(p_tenant_id,'payments.read') THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
  IF p_status IS NULL OR p_status NOT IN ('','registered','reversed') OR p_type IS NULL OR p_type NOT IN ('','down_payment','installment')
    OR p_method IS NULL OR p_method NOT IN ('','cash','bank_transfer','card','other','unspecified')
    OR p_page IS NULL OR p_page NOT BETWEEN 1 AND 100000 OR p_page_size IS NULL OR p_page_size NOT BETWEEN 1 AND 100
    OR length(coalesce(p_search,''))>100 OR (p_from IS NOT NULL AND p_to IS NOT NULL AND p_from>p_to)
    THEN RAISE EXCEPTION 'INVALID_RECEIPT_FILTER' USING ERRCODE='22023'; END IF;
  WITH filtered AS MATERIALIZED (
    SELECT p.id,p.amount,p.currency,p.received_at,p.payment_method,p.payment_type,p.reference,p.reversed_at,
      l.id AS loan_id,c.id AS customer_id,c.full_name,c.identity_number,c.phone,ct.contract_number,b.name AS branch_name,
      photo.updated_at AS photo_updated_at
    FROM public.payments p
    JOIN public.loans l ON l.tenant_id=p.tenant_id AND l.id=p.loan_id
    JOIN public.customers c ON c.tenant_id=l.tenant_id AND c.id=l.customer_id
    JOIN public.credit_contracts ct ON ct.tenant_id=l.tenant_id AND ct.id=l.contract_id
    LEFT JOIN public.branches b ON b.tenant_id=l.tenant_id AND b.id=l.branch_id
    LEFT JOIN public.customer_photos photo ON photo.tenant_id=c.tenant_id AND photo.customer_id=c.id
    WHERE p.tenant_id=p_tenant_id
      AND (p_branch_id IS NULL OR l.branch_id=p_branch_id) AND (p_customer_id IS NULL OR c.id=p_customer_id)
      AND (p_status='' OR (p_status='registered' AND p.reversed_at IS NULL) OR (p_status='reversed' AND p.reversed_at IS NOT NULL))
      AND (p_type='' OR p.payment_type=p_type) AND (p_method='' OR p.payment_method=p_method)
      AND (p_from IS NULL OR p.received_at >= (p_from::timestamp AT TIME ZONE 'America/Santo_Domingo'))
      AND (p_to IS NULL OR p.received_at < ((p_to+1)::timestamp AT TIME ZONE 'America/Santo_Domingo'))
      AND (coalesce(btrim(p_search),'')='' OR c.full_name ILIKE '%'||btrim(p_search)||'%'
        OR c.identity_number ILIKE '%'||btrim(p_search)||'%' OR c.phone ILIKE '%'||btrim(p_search)||'%'
        OR p.id::text ILIKE '%'||btrim(p_search)||'%' OR p.reference ILIKE '%'||btrim(p_search)||'%'
        OR ct.contract_number ILIKE '%'||btrim(p_search)||'%'
        OR (btrim(p_search) ~ '^[[:digit:][:space:]()+.-]+$' AND regexp_replace(p_search,'[^0-9]','','g')<>'' AND
          (regexp_replace(coalesce(c.identity_number,''),'[^0-9]','','g') LIKE '%'||regexp_replace(p_search,'[^0-9]','','g')||'%'
          OR regexp_replace(coalesce(c.phone,''),'[^0-9]','','g') LIKE '%'||regexp_replace(p_search,'[^0-9]','','g')||'%')))
  ), page_rows AS (
    SELECT * FROM filtered ORDER BY received_at DESC,id DESC LIMIT p_page_size OFFSET (p_page-1)*p_page_size
  )
  SELECT jsonb_build_object('count',(SELECT count(*) FROM filtered),'summary',
    (SELECT jsonb_build_object('registered',count(*) FILTER(WHERE reversed_at IS NULL),'reversed',count(*) FILTER(WHERE reversed_at IS NOT NULL),
      'registeredAmount',coalesce(sum(amount) FILTER(WHERE reversed_at IS NULL),0)::text,
      'reversedAmount',coalesce(sum(amount) FILTER(WHERE reversed_at IS NOT NULL),0)::text) FROM filtered),
    'rows',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'amount',amount::text,'currency',currency,'receivedAt',received_at,
      'method',payment_method,'type',payment_type,'reference',reference,'reversedAt',reversed_at,'loanId',loan_id,
      'customerId',customer_id,'customerName',full_name,'identity',identity_number,'phone',phone,'contract',contract_number,
      'branch',branch_name,'photoUpdatedAt',photo_updated_at) ORDER BY received_at DESC,id DESC),'[]'::jsonb) FROM page_rows)) INTO v_result;
  RETURN v_result;
END $$;
REVOKE ALL ON FUNCTION public.tenant_receipt_page(uuid,text,text,text,text,uuid,uuid,date,date,integer,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.tenant_receipt_page(uuid,text,text,text,text,uuid,uuid,date,date,integer,integer) TO authenticated;
