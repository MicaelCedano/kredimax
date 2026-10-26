ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS occupation text,
  ADD COLUMN IF NOT EXISTS employment_type varchar(40),
  ADD COLUMN IF NOT EXISTS employment_tenure_months integer,
  ADD COLUMN IF NOT EXISTS verified_monthly_income numeric(14, 2),
  ADD COLUMN IF NOT EXISTS other_verifiable_income numeric(14, 2),
  ADD COLUMN IF NOT EXISTS essential_monthly_expenses numeric(14, 2),
  ADD COLUMN IF NOT EXISTS existing_monthly_debts numeric(14, 2),
  ADD COLUMN IF NOT EXISTS verified_monthly_debts numeric(14, 2),
  ADD COLUMN IF NOT EXISTS dependents_count integer,
  ADD COLUMN IF NOT EXISTS housing_type varchar(40),
  ADD COLUMN IF NOT EXISTS monthly_rent_expense numeric(14, 2),
  ADD COLUMN IF NOT EXISTS work_reference_name text,
  ADD COLUMN IF NOT EXISTS work_reference_phone text,
  ADD COLUMN IF NOT EXISTS income_verification_status varchar(24) NOT NULL DEFAULT 'declared',
  ADD COLUMN IF NOT EXISTS identity_verification_status varchar(24) NOT NULL DEFAULT 'declared',
  ADD COLUMN IF NOT EXISTS employment_verification_status varchar(24) NOT NULL DEFAULT 'declared',
  ADD COLUMN IF NOT EXISTS financial_data_consent boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS financial_data_consent_at timestamp with time zone;
--> statement-breakpoint
ALTER TABLE public.financing_settings
  ADD COLUMN IF NOT EXISTS credit_policy jsonb NOT NULL DEFAULT '{"weights":{"paymentCapacity":30,"paymentHistory":30,"incomeStability":15,"currentIndebtedness":15,"identityVerification":10},"thresholds":{"lowRiskMin":85,"moderateLowRiskMin":70,"reviewRequiredMin":50},"maxDebtToIncomePercent":"35.00","defaultEvaluationTermMonths":12,"evaluationValidityDays":30,"requireManualReviewOverLimit":true,"requireManualReviewForHighRisk":true,"requireManualReviewForUnverifiedIncome":true}'::jsonb;
--> statement-breakpoint
DROP POLICY IF EXISTS financing_settings_read ON public.financing_settings;
--> statement-breakpoint
CREATE POLICY financing_settings_read ON public.financing_settings
  FOR SELECT TO authenticated
  USING (
    app_private.has_tenant_permission(tenant_id, 'financing.read')
    OR app_private.has_tenant_permission(tenant_id, 'customers.read')
  );
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS public.customer_credit_evaluations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  branch_id uuid,
  customer_id uuid NOT NULL,
  algorithm_version varchar(32) NOT NULL DEFAULT 'kredimax-internal-v1',
  status varchar(24) NOT NULL DEFAULT 'incomplete',
  total_score integer,
  risk_level varchar(32) NOT NULL DEFAULT 'unrated',
  verification_state varchar(24) NOT NULL DEFAULT 'declared',
  monthly_payment_capacity numeric(14, 2) NOT NULL DEFAULT '0.00',
  recommended_max_principal numeric(14, 2) NOT NULL DEFAULT '0.00',
  recommended_max_sale_price numeric(14, 2) NOT NULL DEFAULT '0.00',
  recommended_down_payment numeric(14, 2) NOT NULL DEFAULT '0.00',
  recommended_term_months integer NOT NULL DEFAULT 12,
  trigger_event varchar(48) NOT NULL DEFAULT 'manual_recalculation',
  factors jsonb NOT NULL DEFAULT '{}'::jsonb,
  evaluated_by uuid REFERENCES auth.users(id),
  valid_until timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT customer_credit_evaluations_score_range CHECK (total_score IS NULL OR (total_score >= 0 AND total_score <= 100)),
  CONSTRAINT customer_credit_evaluations_amounts_nonnegative CHECK (
    monthly_payment_capacity >= 0
    AND recommended_max_principal >= 0
    AND recommended_max_sale_price >= 0
    AND recommended_down_payment >= 0
    AND recommended_term_months > 0
  ),
  CONSTRAINT customer_credit_evaluations_customer_tenant_fk
    FOREIGN KEY (tenant_id, customer_id) REFERENCES public.customers(tenant_id, id),
  CONSTRAINT customer_credit_evaluations_branch_tenant_fk
    FOREIGN KEY (tenant_id, branch_id) REFERENCES public.branches(tenant_id, id)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS customer_credit_evaluations_customer_created_idx
  ON public.customer_credit_evaluations (tenant_id, customer_id, created_at DESC);
--> statement-breakpoint
ALTER TABLE public.customer_credit_evaluations ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE ALL ON TABLE public.customer_credit_evaluations FROM PUBLIC, anon, authenticated;
--> statement-breakpoint
GRANT SELECT, INSERT ON TABLE public.customer_credit_evaluations TO authenticated;
--> statement-breakpoint
DROP POLICY IF EXISTS customer_credit_evaluations_select ON public.customer_credit_evaluations;
--> statement-breakpoint
CREATE POLICY customer_credit_evaluations_select ON public.customer_credit_evaluations
  FOR SELECT TO authenticated
  USING (
    app_private.has_branch_permission(tenant_id, branch_id, 'customers.read')
    OR app_private.has_branch_permission(tenant_id, branch_id, 'financing.read')
  );
--> statement-breakpoint
DROP POLICY IF EXISTS customer_credit_evaluations_insert ON public.customer_credit_evaluations;
--> statement-breakpoint
CREATE POLICY customer_credit_evaluations_insert ON public.customer_credit_evaluations
  FOR INSERT TO authenticated
  WITH CHECK (
    (evaluated_by IS NULL OR evaluated_by = (SELECT auth.uid()))
    AND (
      app_private.has_branch_permission(tenant_id, branch_id, 'customers.write')
      OR app_private.has_branch_permission(tenant_id, branch_id, 'financing.write')
      OR app_private.has_branch_permission(tenant_id, branch_id, 'financing.approve')
      OR app_private.has_branch_permission(tenant_id, branch_id, 'payments.record')
    )
  );
