CREATE TABLE "credit_application_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"application_id" uuid NOT NULL,
	"actor_id" uuid NOT NULL,
	"event_type" varchar(48) NOT NULL,
	"from_status" varchar(24),
	"to_status" varchar(24),
	"notes" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "financing_settings" (
	"tenant_id" uuid PRIMARY KEY NOT NULL,
	"down_payment_percent" numeric(5, 2) DEFAULT '30.00' NOT NULL,
	"annual_rate_percent" numeric(6, 3) DEFAULT '48.000' NOT NULL,
	"legal_expenses" numeric(14, 2) DEFAULT '1000.00' NOT NULL,
	"allowed_terms" integer[] DEFAULT '{3,6,8,12,18,24}' NOT NULL,
	"recovery_target_percent" numeric(5, 2) DEFAULT '100.00' NOT NULL,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "credit_applications" ADD COLUMN "device_id" uuid;--> statement-breakpoint
ALTER TABLE "credit_applications" ADD COLUMN "quote_snapshot" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "credit_applications" ADD COLUMN "submission_key" uuid DEFAULT gen_random_uuid() NOT NULL;--> statement-breakpoint
ALTER TABLE "credit_applications" ADD COLUMN "review_notes" text;--> statement-breakpoint
ALTER TABLE "credit_applications" ADD COLUMN "additional_charge_category" varchar(100);--> statement-breakpoint
ALTER TABLE "credit_applications" ADD COLUMN "additional_charge_basis" text;--> statement-breakpoint
ALTER TABLE "credit_applications" ADD COLUMN "additional_charge_approved_by" uuid;--> statement-breakpoint
ALTER TABLE "credit_applications" ADD COLUMN "additional_charge_approved_at" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX "credit_applications_tenant_id_uidx" ON "credit_applications" USING btree ("tenant_id","id");--> statement-breakpoint
ALTER TABLE "credit_applications" ALTER COLUMN "quote_snapshot" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "credit_application_events" ADD CONSTRAINT "application_events_application_tenant_fk" FOREIGN KEY ("tenant_id","application_id") REFERENCES "public"."credit_applications"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financing_settings" ADD CONSTRAINT "financing_settings_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "credit_application_events_tenant_application_idx" ON "credit_application_events" USING btree ("tenant_id","application_id","created_at");--> statement-breakpoint
ALTER TABLE "credit_applications" ADD CONSTRAINT "applications_device_tenant_fk" FOREIGN KEY ("tenant_id","device_id") REFERENCES "public"."devices"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "credit_applications_submission_uidx" ON "credit_applications" USING btree ("tenant_id","created_by","submission_key");

--> statement-breakpoint
ALTER TABLE public.credit_applications
  ADD CONSTRAINT applications_additional_approval_user_fk FOREIGN KEY(additional_charge_approved_by) REFERENCES auth.users(id);
ALTER TABLE public.financing_settings
  ADD CONSTRAINT financing_settings_updated_user_fk FOREIGN KEY(updated_by) REFERENCES auth.users(id),
  ADD CONSTRAINT financing_settings_down_payment_valid CHECK(down_payment_percent > 0 AND down_payment_percent <= 100),
  ADD CONSTRAINT financing_settings_rate_valid CHECK(annual_rate_percent >= 0 AND annual_rate_percent <= 100),
  ADD CONSTRAINT financing_settings_legal_valid CHECK(legal_expenses >= 0),
  ADD CONSTRAINT financing_settings_recovery_fixed CHECK(recovery_target_percent = 100.00),
  ADD CONSTRAINT financing_settings_terms_valid CHECK(cardinality(allowed_terms) > 0 AND allowed_terms <@ ARRAY[3,6,8,12,18,24]);
ALTER TABLE public.credit_application_events
  ADD CONSTRAINT application_events_actor_fk FOREIGN KEY(actor_id) REFERENCES auth.users(id);

--> statement-breakpoint
ALTER TABLE public.credit_application_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financing_settings ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.credit_application_events TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.financing_settings TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.credit_applications FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.credit_application_events FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.credit_contracts, public.loans, public.installments FROM authenticated;

CREATE POLICY credit_application_events_read ON public.credit_application_events
  FOR SELECT TO authenticated USING(app_private.has_tenant_permission(tenant_id,'financing.read'));
CREATE POLICY financing_settings_read ON public.financing_settings
  FOR SELECT TO authenticated USING(app_private.has_tenant_permission(tenant_id,'financing.read'));
CREATE POLICY financing_settings_manage ON public.financing_settings
  FOR ALL TO authenticated
  USING(app_private.has_tenant_permission(tenant_id,'settings.manage'))
  WITH CHECK(app_private.has_tenant_permission(tenant_id,'settings.manage') AND (updated_by=(select auth.uid())));

--> statement-breakpoint
CREATE OR REPLACE FUNCTION app_private.prevent_credit_application_quote_change()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
     OR NEW.customer_id IS DISTINCT FROM OLD.customer_id
     OR NEW.device_id IS DISTINCT FROM OLD.device_id
     OR NEW.branch_id IS DISTINCT FROM OLD.branch_id
     OR NEW.requested_amount IS DISTINCT FROM OLD.requested_amount
     OR NEW.quote_snapshot IS DISTINCT FROM OLD.quote_snapshot
     OR NEW.submission_key IS DISTINCT FROM OLD.submission_key
     OR NEW.created_by IS DISTINCT FROM OLD.created_by
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'CREDIT_QUOTE_IMMUTABLE' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER credit_applications_quote_immutable
  BEFORE UPDATE ON public.credit_applications
  FOR EACH ROW EXECUTE FUNCTION app_private.prevent_credit_application_quote_change();

--> statement-breakpoint
CREATE OR REPLACE FUNCTION app_private.create_credit_application(
  p_tenant_id uuid,
  p_customer_id uuid,
  p_device_id uuid,
  p_branch_id uuid,
  p_requested_amount numeric,
  p_quote_snapshot jsonb,
  p_submission_key uuid
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_application_id uuid;
  v_rows integer;
  v_settings record;
  v_sale_price numeric;
  v_device_cost numeric;
  v_down_payment numeric;
  v_principal numeric;
  v_interest numeric;
  v_legal numeric;
  v_installment_count integer;
  v_base_installment numeric;
  v_recovery_installment numeric;
  v_fixed_installment numeric;
  v_total numeric;
  v_recovery_half numeric;
  v_adjustment numeric;
  v_schedule_count integer;
  v_schedule record;
  v_component_totals record;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE = '42501'; END IF;
  IF NOT app_private.has_tenant_permission(p_tenant_id,'financing.write') THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501'; END IF;
  IF p_submission_key IS NULL OR jsonb_typeof(p_quote_snapshot) <> 'object' THEN RAISE EXCEPTION 'INVALID_QUOTE' USING ERRCODE = '22023'; END IF;
  IF NOT (p_quote_snapshot ?& ARRAY['currency','salePrice','deviceCost','downPaymentPercent','downPayment','principal','annualRatePercent','baseInterest','legalExpenses','termMonths','frequency','installmentCount','baseInstallment','recoveryInstallment','fixedInstallment','proposedAdjustment','totalCustomerPays','recoveryAtHalf','recoveryTarget','recoveryTargetPercent','recoveryMet','firstInstallmentDate','finalDueDate','schedule','device']) THEN
    RAISE EXCEPTION 'INCOMPLETE_QUOTE' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.tenant_memberships m
    WHERE m.tenant_id=p_tenant_id AND m.user_id=v_user_id AND m.status='active'
      AND m.branch_id IS NOT DISTINCT FROM p_branch_id
  ) THEN RAISE EXCEPTION 'INVALID_BRANCH_SCOPE' USING ERRCODE = '42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.customers c WHERE c.tenant_id=p_tenant_id AND c.id=p_customer_id) THEN RAISE EXCEPTION 'CUSTOMER_NOT_FOUND' USING ERRCODE = '23503'; END IF;
  IF p_device_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.devices d WHERE d.tenant_id=p_tenant_id AND d.id=p_device_id) THEN RAISE EXCEPTION 'DEVICE_NOT_FOUND' USING ERRCODE = '23503'; END IF;
  IF p_branch_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.branches b WHERE b.tenant_id=p_tenant_id AND b.id=p_branch_id AND b.active) THEN RAISE EXCEPTION 'BRANCH_NOT_FOUND' USING ERRCODE = '23503'; END IF;

  SELECT
    coalesce((SELECT s.down_payment_percent FROM public.financing_settings s WHERE s.tenant_id=p_tenant_id),30.00) AS down_payment_percent,
    coalesce((SELECT s.annual_rate_percent FROM public.financing_settings s WHERE s.tenant_id=p_tenant_id),48.000) AS annual_rate_percent,
    coalesce((SELECT s.legal_expenses FROM public.financing_settings s WHERE s.tenant_id=p_tenant_id),1000.00) AS legal_expenses,
    coalesce((SELECT s.allowed_terms FROM public.financing_settings s WHERE s.tenant_id=p_tenant_id),ARRAY[3,6,8,12,18,24]) AS allowed_terms
  INTO v_settings;

  BEGIN
    v_sale_price := (p_quote_snapshot->>'salePrice')::numeric;
    v_device_cost := (p_quote_snapshot->>'deviceCost')::numeric;
    v_down_payment := (p_quote_snapshot->>'downPayment')::numeric;
    v_principal := (p_quote_snapshot->>'principal')::numeric;
    v_interest := (p_quote_snapshot->>'baseInterest')::numeric;
    v_legal := (p_quote_snapshot->>'legalExpenses')::numeric;
    v_installment_count := (p_quote_snapshot->>'installmentCount')::integer;
    v_total := (p_quote_snapshot->>'totalCustomerPays')::numeric;
    v_recovery_half := (p_quote_snapshot->>'recoveryAtHalf')::numeric;
    v_adjustment := (p_quote_snapshot->>'proposedAdjustment')::numeric;
  EXCEPTION WHEN others THEN RAISE EXCEPTION 'INVALID_QUOTE_AMOUNT' USING ERRCODE = '22023';
  END;

  IF p_quote_snapshot->>'currency' <> 'DOP'
     OR (p_quote_snapshot->>'frequency' NOT IN ('monthly','fortnightly'))
     OR v_sale_price <= 0 OR v_device_cost <= 0 OR v_principal <= 0 OR v_installment_count <= 0
     OR p_requested_amount IS NULL OR p_requested_amount <> v_principal
     OR (p_quote_snapshot->>'downPaymentPercent')::numeric <> v_settings.down_payment_percent
     OR (p_quote_snapshot->>'annualRatePercent')::numeric <> v_settings.annual_rate_percent
     OR v_legal <> v_settings.legal_expenses
     OR NOT ((p_quote_snapshot->>'termMonths')::integer = ANY(v_settings.allowed_terms))
     OR (p_quote_snapshot->>'recoveryTargetPercent')::numeric <> 100.00
     OR (p_quote_snapshot->>'firstInstallmentDate')::date < current_date THEN
    RAISE EXCEPTION 'INVALID_QUOTE_TERMS' USING ERRCODE = '22023';
  END IF;
  IF v_installment_count <> ((p_quote_snapshot->>'termMonths')::integer * (CASE WHEN p_quote_snapshot->>'frequency'='fortnightly' THEN 2 ELSE 1 END)) THEN
    RAISE EXCEPTION 'INVALID_INSTALLMENT_COUNT' USING ERRCODE = '22023';
  END IF;

  v_down_payment := round(v_sale_price * v_settings.down_payment_percent / 100,2);
  v_principal := v_sale_price - v_down_payment;
  v_interest := round(v_principal * v_settings.annual_rate_percent * (p_quote_snapshot->>'termMonths')::integer / 1200,2);
  v_legal := v_settings.legal_expenses;
  v_base_installment := ceil(((v_principal + v_interest + v_legal) / v_installment_count) * 100) / 100;
  v_recovery_installment := ceil(((v_principal * 2) / v_installment_count) * 100) / 100;
  v_fixed_installment := greatest(v_base_installment,v_recovery_installment);
  v_total := v_down_payment + v_fixed_installment * v_installment_count;
  v_recovery_half := v_down_payment + v_fixed_installment * floor(v_installment_count / 2.0);
  v_adjustment := greatest(0,v_total - v_sale_price - v_interest - v_legal);

  IF p_requested_amount <> v_principal
     OR (p_quote_snapshot->>'downPayment')::numeric <> v_down_payment
     OR (p_quote_snapshot->>'principal')::numeric <> v_principal
     OR (p_quote_snapshot->>'baseInterest')::numeric <> v_interest
     OR (p_quote_snapshot->>'baseInstallment')::numeric <> v_base_installment
     OR (p_quote_snapshot->>'recoveryInstallment')::numeric <> v_recovery_installment
     OR (p_quote_snapshot->>'fixedInstallment')::numeric <> v_fixed_installment
     OR (p_quote_snapshot->>'totalCustomerPays')::numeric <> v_total
     OR (p_quote_snapshot->>'recoveryAtHalf')::numeric <> v_recovery_half
     OR (p_quote_snapshot->>'recoveryTarget')::numeric <> v_device_cost
     OR (p_quote_snapshot->>'proposedAdjustment')::numeric <> v_adjustment
     OR (p_quote_snapshot->>'recoveryMet')::boolean <> (v_recovery_half >= v_device_cost) THEN
    RAISE EXCEPTION 'QUOTE_CALCULATION_MISMATCH' USING ERRCODE = '22023';
  END IF;

  IF jsonb_typeof(p_quote_snapshot->'schedule') <> 'array'
     OR jsonb_array_length(p_quote_snapshot->'schedule') <> v_installment_count THEN
    RAISE EXCEPTION 'INVALID_QUOTE_SCHEDULE' USING ERRCODE = '22023';
  END IF;
  FOR v_schedule IN SELECT value, ordinality FROM jsonb_array_elements(p_quote_snapshot->'schedule') WITH ORDINALITY LOOP
    IF (v_schedule.value->>'sequence')::integer <> v_schedule.ordinality
       OR (v_schedule.value->>'amount')::numeric <> v_fixed_installment
       OR (v_schedule.value->>'principal')::numeric + (v_schedule.value->>'interest')::numeric
          + (v_schedule.value->>'legalExpenses')::numeric + (v_schedule.value->>'proposedAdjustment')::numeric <> v_fixed_installment THEN
      RAISE EXCEPTION 'INVALID_SCHEDULE_ROW' USING ERRCODE = '22023';
    END IF;
  END LOOP;
  SELECT sum((value->>'principal')::numeric) AS principal, sum((value->>'interest')::numeric) AS interest,
         sum((value->>'legalExpenses')::numeric) AS legal, sum((value->>'proposedAdjustment')::numeric) AS adjustment
  INTO v_component_totals FROM jsonb_array_elements(p_quote_snapshot->'schedule');
  IF v_component_totals.principal <> v_principal OR v_component_totals.interest <> v_interest
     OR v_component_totals.legal <> v_legal OR v_component_totals.adjustment <> v_adjustment THEN
    RAISE EXCEPTION 'INVALID_SCHEDULE_ALLOCATION' USING ERRCODE = '22023';
  END IF;
  IF (SELECT value->>'dueDate' FROM jsonb_array_elements(p_quote_snapshot->'schedule') WITH ORDINALITY WHERE ordinality=1) <> p_quote_snapshot->>'firstInstallmentDate'
     OR (SELECT value->>'dueDate' FROM jsonb_array_elements(p_quote_snapshot->'schedule') WITH ORDINALITY ORDER BY ordinality DESC LIMIT 1) <> p_quote_snapshot->>'finalDueDate' THEN
    RAISE EXCEPTION 'INVALID_SCHEDULE_DATES' USING ERRCODE = '22023';
  END IF;
  IF p_device_id IS NOT NULL AND p_quote_snapshot->'device'->>'id' <> p_device_id::text THEN
    RAISE EXCEPTION 'DEVICE_SNAPSHOT_MISMATCH' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.credit_applications(tenant_id,customer_id,device_id,branch_id,requested_amount,status,quote_snapshot,submission_key,created_by)
  VALUES(p_tenant_id,p_customer_id,p_device_id,p_branch_id,v_principal,'pending',p_quote_snapshot,p_submission_key,v_user_id)
  ON CONFLICT(tenant_id,created_by,submission_key) DO NOTHING
  RETURNING id INTO v_application_id;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows = 0 THEN
    SELECT id INTO v_application_id FROM public.credit_applications
    WHERE tenant_id=p_tenant_id AND created_by=v_user_id AND submission_key=p_submission_key;
    RETURN v_application_id;
  END IF;

  INSERT INTO public.credit_application_events(tenant_id,application_id,actor_id,event_type,to_status,metadata)
  VALUES(p_tenant_id,v_application_id,v_user_id,'application_created','pending',jsonb_build_object('quoteVersion',1,'installmentCount',v_installment_count));
  RETURN v_application_id;
END;
$$;

--> statement-breakpoint
CREATE OR REPLACE FUNCTION app_private.review_credit_application(
  p_application_id uuid,
  p_decision text,
  p_notes text,
  p_additional_charge_category text,
  p_additional_charge_basis text,
  p_additional_charge_attested boolean
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_application public.credit_applications%ROWTYPE;
  v_quote jsonb;
  v_adjustment numeric;
  v_contract_id uuid;
  v_loan_id uuid;
  v_contract_number text;
  v_schedule record;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE = '42501'; END IF;
  IF p_decision NOT IN ('approved','rejected','documents_requested') THEN RAISE EXCEPTION 'INVALID_DECISION' USING ERRCODE = '22023'; END IF;

  SELECT * INTO v_application FROM public.credit_applications WHERE id=p_application_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'APPLICATION_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;
  IF NOT app_private.has_tenant_permission(v_application.tenant_id,'financing.approve') THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501'; END IF;
  IF v_application.status NOT IN ('pending','documents_requested') THEN RAISE EXCEPTION 'APPLICATION_ALREADY_REVIEWED' USING ERRCODE = '55000'; END IF;
  IF p_decision IN ('rejected','documents_requested') AND coalesce(length(trim(p_notes)),0)=0 THEN RAISE EXCEPTION 'REVIEW_NOTE_REQUIRED' USING ERRCODE = '22023'; END IF;

  v_quote := v_application.quote_snapshot;
  v_adjustment := (v_quote->>'proposedAdjustment')::numeric;
  IF p_decision='approved' THEN
    IF (v_quote->>'recoveryMet')::boolean IS NOT TRUE THEN RAISE EXCEPTION 'RECOVERY_REVIEW_REQUIRED' USING ERRCODE = '22023'; END IF;
    IF v_application.device_id IS NULL THEN RAISE EXCEPTION 'DEVICE_NOT_IN_INVENTORY' USING ERRCODE = '23503'; END IF;
    IF v_adjustment > 0 AND (coalesce(length(trim(p_additional_charge_category)),0)=0 OR coalesce(length(trim(p_additional_charge_basis)),0)=0 OR p_additional_charge_attested IS NOT TRUE) THEN
      RAISE EXCEPTION 'ADDITIONAL_CHARGE_APPROVAL_REQUIRED' USING ERRCODE = '42501';
    END IF;

    v_contract_number := 'KM-' || to_char(current_date,'YYYY') || '-' || upper(substr(replace(v_application.id::text,'-',''),1,8));
    INSERT INTO public.credit_contracts(tenant_id,customer_id,contract_number,terms)
    VALUES(v_application.tenant_id,v_application.customer_id,v_contract_number,
      v_quote || jsonb_build_object('review',jsonb_build_object('approvedBy',v_user_id,'approvedAt',clock_timestamp(),'additionalChargeCategory',p_additional_charge_category,'additionalChargeBasis',p_additional_charge_basis)))
    RETURNING id INTO v_contract_id;

    INSERT INTO public.loans(tenant_id,customer_id,contract_id,device_id,status,sale_price,down_payment,principal,interest_rate,installment_count,calculation_strategy)
    VALUES(v_application.tenant_id,v_application.customer_id,v_contract_id,v_application.device_id,'approved',
      (v_quote->>'salePrice')::numeric,(v_quote->>'downPayment')::numeric,(v_quote->>'principal')::numeric,
      (v_quote->>'annualRatePercent')::numeric,(v_quote->>'installmentCount')::integer,'simple_fixed_recovery_target')
    RETURNING id INTO v_loan_id;

    FOR v_schedule IN SELECT value FROM jsonb_array_elements(v_quote->'schedule') LOOP
      INSERT INTO public.installments(tenant_id,loan_id,sequence,due_date,amount_due)
      VALUES(v_application.tenant_id,v_loan_id,(v_schedule.value->>'sequence')::integer,(v_schedule.value->>'dueDate')::date,(v_schedule.value->>'amount')::numeric);
    END LOOP;
  END IF;

  UPDATE public.credit_applications SET status=p_decision,review_notes=nullif(trim(p_notes),''),
    additional_charge_category=CASE WHEN p_decision='approved' AND v_adjustment>0 THEN trim(p_additional_charge_category) ELSE additional_charge_category END,
    additional_charge_basis=CASE WHEN p_decision='approved' AND v_adjustment>0 THEN trim(p_additional_charge_basis) ELSE additional_charge_basis END,
    additional_charge_approved_by=CASE WHEN p_decision='approved' AND v_adjustment>0 THEN v_user_id ELSE additional_charge_approved_by END,
    additional_charge_approved_at=CASE WHEN p_decision='approved' AND v_adjustment>0 THEN clock_timestamp() ELSE additional_charge_approved_at END
  WHERE id=p_application_id;

  INSERT INTO public.credit_application_events(tenant_id,application_id,actor_id,event_type,from_status,to_status,notes,metadata)
  VALUES(v_application.tenant_id,p_application_id,v_user_id,p_decision,v_application.status,p_decision,nullif(trim(p_notes),''),
    jsonb_build_object('contractId',v_contract_id,'loanId',v_loan_id,'additionalChargeCategory',CASE WHEN v_adjustment>0 AND p_decision='approved' THEN trim(p_additional_charge_category) ELSE null END));
  RETURN coalesce(v_loan_id,p_application_id);
END;
$$;

--> statement-breakpoint
REVOKE ALL ON FUNCTION app_private.create_credit_application(uuid,uuid,uuid,uuid,numeric,jsonb,uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION app_private.review_credit_application(uuid,text,text,text,text,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION app_private.create_credit_application(uuid,uuid,uuid,uuid,numeric,jsonb,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION app_private.review_credit_application(uuid,text,text,text,text,boolean) TO authenticated;
CREATE OR REPLACE FUNCTION public.create_credit_application(
  p_tenant_id uuid,p_customer_id uuid,p_device_id uuid,p_branch_id uuid,p_requested_amount numeric,p_quote_snapshot jsonb,p_submission_key uuid
) RETURNS uuid LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  SELECT app_private.create_credit_application(p_tenant_id,p_customer_id,p_device_id,p_branch_id,p_requested_amount,p_quote_snapshot,p_submission_key)
$$;
CREATE OR REPLACE FUNCTION public.review_credit_application(
  p_application_id uuid,p_decision text,p_notes text,p_additional_charge_category text,p_additional_charge_basis text,p_additional_charge_attested boolean
) RETURNS uuid LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  SELECT app_private.review_credit_application(p_application_id,p_decision,p_notes,p_additional_charge_category,p_additional_charge_basis,p_additional_charge_attested)
$$;
REVOKE ALL ON FUNCTION public.create_credit_application(uuid,uuid,uuid,uuid,numeric,jsonb,uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.review_credit_application(uuid,text,text,text,text,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_credit_application(uuid,uuid,uuid,uuid,numeric,jsonb,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.review_credit_application(uuid,text,text,text,text,boolean) TO authenticated;
