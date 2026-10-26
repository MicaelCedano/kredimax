-- Preserve existing records while closing direct table writes and adding relational guards.
CREATE OR REPLACE FUNCTION app_private.has_tenant_permission(p_tenant_id uuid,p_permission_key text)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.tenant_memberships m
    JOIN public.tenants t ON t.id=m.tenant_id
    JOIN public.roles r ON r.key=m.role
    JOIN public.role_permissions rp ON rp.role_id=r.id
    JOIN public.permissions p ON p.id=rp.permission_id
    WHERE m.tenant_id=p_tenant_id AND m.user_id=(SELECT auth.uid())
      AND m.status='active' AND t.status='active' AND p.key=p_permission_key
  )
$$;

DROP POLICY IF EXISTS tenants_select_members ON public.tenants;
CREATE POLICY tenants_select_members ON public.tenants FOR SELECT TO authenticated USING (
  status='active' AND EXISTS(SELECT 1 FROM public.tenant_memberships m
    WHERE m.tenant_id=tenants.id AND m.user_id=(SELECT auth.uid()) AND m.status='active')
);
DROP POLICY IF EXISTS notifications_own ON public.notifications;
CREATE POLICY notifications_own ON public.notifications FOR ALL TO authenticated
  USING(user_id=(SELECT auth.uid()) AND app_private.has_tenant_permission(notifications.tenant_id,'customers.read'))
  WITH CHECK(user_id=(SELECT auth.uid()) AND app_private.has_tenant_permission(notifications.tenant_id,'customers.read'));

-- User sessions cannot create, edit, truncate, or delete financial/audit evidence directly.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.payments,public.payment_allocations,
  public.ledger_entries,public.audit_logs FROM PUBLIC,authenticated,anon;
REVOKE DELETE ON public.branches,public.customers,public.customer_documents,public.devices,
  public.mdm_providers,public.credit_applications,public.credit_contracts,public.loans,
  public.installments,public.ledger_accounts,public.tenant_settings,public.mdm_commands FROM PUBLIC,authenticated,anon;

ALTER TABLE public.payment_allocations ADD COLUMN IF NOT EXISTS loan_id uuid;
UPDATE public.payment_allocations a SET loan_id=i.loan_id FROM public.installments i
  WHERE i.id=a.installment_id AND i.tenant_id=a.tenant_id AND a.loan_id IS NULL;
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM public.payment_allocations a
    LEFT JOIN public.payments p ON p.id=a.payment_id AND p.tenant_id=a.tenant_id
    LEFT JOIN public.installments i ON i.id=a.installment_id AND i.tenant_id=a.tenant_id
    WHERE a.loan_id IS NULL OR p.id IS NULL OR i.id IS NULL OR p.loan_id<>i.loan_id OR a.loan_id<>p.loan_id)
  THEN RAISE EXCEPTION 'Existing allocations cross loan or tenant boundary; inspect rows before migration'; END IF;
END $$;
ALTER TABLE public.payments ADD CONSTRAINT payments_tenant_id_loan_uidx UNIQUE(tenant_id,id,loan_id);
ALTER TABLE public.installments ADD CONSTRAINT installments_tenant_id_loan_uidx UNIQUE(tenant_id,id,loan_id);
ALTER TABLE public.payment_allocations ALTER COLUMN loan_id SET NOT NULL;
ALTER TABLE public.payment_allocations ADD CONSTRAINT allocations_payment_loan_fk
  FOREIGN KEY(tenant_id,payment_id,loan_id) REFERENCES public.payments(tenant_id,id,loan_id);
ALTER TABLE public.payment_allocations ADD CONSTRAINT allocations_installment_loan_fk
  FOREIGN KEY(tenant_id,installment_id,loan_id) REFERENCES public.installments(tenant_id,id,loan_id);

CREATE OR REPLACE FUNCTION app_private.guard_payment_allocation()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE v_payment public.payments%ROWTYPE; v_installment public.installments%ROWTYPE;
        v_allocated numeric(14,2); v_installment_paid numeric(14,2);
BEGIN
  SELECT * INTO v_payment FROM public.payments WHERE id=NEW.payment_id AND tenant_id=NEW.tenant_id FOR UPDATE;
  IF NOT FOUND OR v_payment.loan_id<>NEW.loan_id OR v_payment.reversed_at IS NOT NULL THEN
    RAISE EXCEPTION 'ALLOCATION_PAYMENT_MISMATCH' USING ERRCODE='23514';
  END IF;
  SELECT * INTO v_installment FROM public.installments WHERE id=NEW.installment_id AND tenant_id=NEW.tenant_id FOR UPDATE;
  IF NOT FOUND OR v_installment.loan_id<>NEW.loan_id OR v_installment.status='waived' THEN
    RAISE EXCEPTION 'ALLOCATION_INSTALLMENT_MISMATCH' USING ERRCODE='23514';
  END IF;
  IF NEW.amount IS NULL OR NEW.amount<=0 OR NEW.amount<>round(NEW.amount,2) THEN
    RAISE EXCEPTION 'INVALID_ALLOCATION_AMOUNT' USING ERRCODE='22023';
  END IF;
  SELECT coalesce(sum(a.amount),0) INTO v_allocated FROM public.payment_allocations a
    JOIN public.payments p ON p.id=a.payment_id WHERE a.payment_id=NEW.payment_id AND p.reversed_at IS NULL;
  SELECT coalesce(sum(a.amount),0) INTO v_installment_paid FROM public.payment_allocations a
    JOIN public.payments p ON p.id=a.payment_id WHERE a.installment_id=NEW.installment_id AND p.reversed_at IS NULL;
  IF v_allocated+NEW.amount>v_payment.amount THEN RAISE EXCEPTION 'ALLOCATION_EXCEEDS_PAYMENT' USING ERRCODE='23514'; END IF;
  IF v_installment_paid+NEW.amount>v_installment.amount_due THEN RAISE EXCEPTION 'ALLOCATION_EXCEEDS_INSTALLMENT' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER payment_allocations_guard BEFORE INSERT ON public.payment_allocations
  FOR EACH ROW EXECUTE FUNCTION app_private.guard_payment_allocation();

CREATE UNIQUE INDEX customers_tenant_identity_normalized_uidx ON public.customers
  (tenant_id,upper(regexp_replace(btrim(identity_number),'[^A-Za-z0-9]','','g')))
  WHERE identity_number IS NOT NULL AND regexp_replace(btrim(identity_number),'[^A-Za-z0-9]','','g')<>'';

CREATE OR REPLACE FUNCTION app_private.imei_is_valid(p_imei text)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE STRICT SET search_path = '' AS $$
DECLARE i integer; total integer:=0; digit integer; doubled integer;
BEGIN
  IF p_imei !~ '^[0-9]{15}$' THEN RETURN false; END IF;
  FOR i IN REVERSE 14..1 LOOP
    digit:=substring(p_imei from i for 1)::integer;
    IF (15-i)%2=1 THEN doubled:=digit*2; digit:=CASE WHEN doubled>9 THEN doubled-9 ELSE doubled END; END IF;
    total:=total+digit;
  END LOOP;
  RETURN total%10=0;
END $$;
ALTER TABLE public.devices ADD CONSTRAINT devices_imei_luhn_ck CHECK(app_private.imei_is_valid(imei)) NOT VALID;
CREATE OR REPLACE FUNCTION app_private.protect_financed_device_imei()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  IF NEW.imei IS DISTINCT FROM OLD.imei AND EXISTS(SELECT 1 FROM public.loans l WHERE l.tenant_id=OLD.tenant_id AND l.device_id=OLD.id)
  THEN RAISE EXCEPTION 'FINANCED_DEVICE_IMEI_LOCKED' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER devices_financed_imei_immutable BEFORE UPDATE OF imei ON public.devices
  FOR EACH ROW EXECUTE FUNCTION app_private.protect_financed_device_imei();
