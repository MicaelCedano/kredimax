ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS employer text,
  ADD COLUMN IF NOT EXISTS monthly_income numeric(14, 2),
  ADD COLUMN IF NOT EXISTS reference_name text,
  ADD COLUMN IF NOT EXISTS reference_phone text;
--> statement-breakpoint
WITH latest_applicant AS (
  SELECT DISTINCT ON (ca.tenant_id, ca.customer_id)
    ca.tenant_id,
    ca.customer_id,
    NULLIF(btrim(ca.quote_snapshot #>> '{applicant,employer}'), '') AS employer,
    CASE
      WHEN NULLIF(btrim(ca.quote_snapshot #>> '{applicant,monthlyIncome}'), '') ~ '^\d+(?:\.\d{1,2})?$'
      THEN (ca.quote_snapshot #>> '{applicant,monthlyIncome}')::numeric(14, 2)
      ELSE NULL
    END AS monthly_income,
    NULLIF(btrim(ca.quote_snapshot #>> '{applicant,reference,name}'), '') AS reference_name,
    NULLIF(btrim(ca.quote_snapshot #>> '{applicant,reference,phone}'), '') AS reference_phone
  FROM public.credit_applications ca
  WHERE jsonb_typeof(ca.quote_snapshot -> 'applicant') = 'object'
  ORDER BY ca.tenant_id, ca.customer_id, ca.created_at DESC
)
UPDATE public.customers c
SET
  employer = COALESCE(c.employer, la.employer),
  monthly_income = COALESCE(c.monthly_income, la.monthly_income),
  reference_name = COALESCE(c.reference_name, la.reference_name),
  reference_phone = COALESCE(c.reference_phone, la.reference_phone)
FROM latest_applicant la
WHERE c.tenant_id = la.tenant_id
  AND c.id = la.customer_id;
