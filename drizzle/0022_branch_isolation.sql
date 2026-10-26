-- Branch provenance is explicit. Unmapped legacy records remain intact and
-- visible only to memberships without a branch assignment until reconciled.
ALTER TABLE public.devices ADD COLUMN branch_id uuid;
--> statement-breakpoint
ALTER TABLE public.credit_contracts ADD COLUMN branch_id uuid;
--> statement-breakpoint
ALTER TABLE public.loans ADD COLUMN branch_id uuid;
--> statement-breakpoint
ALTER TABLE public.credit_application_events ADD COLUMN branch_id uuid;
--> statement-breakpoint
ALTER TABLE public.audit_logs ADD COLUMN branch_id uuid;
--> statement-breakpoint
ALTER TABLE public.ledger_entries ADD COLUMN branch_id uuid;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM public.credit_applications a JOIN public.devices d
      ON d.tenant_id=a.tenant_id AND d.id=a.device_id
    WHERE a.branch_id IS NOT NULL AND d.id IN (
      SELECT a2.device_id FROM public.credit_applications a2
      WHERE a2.tenant_id=d.tenant_id AND a2.device_id IS NOT NULL AND a2.branch_id IS NOT NULL
      GROUP BY a2.device_id HAVING count(DISTINCT a2.branch_id)>1
    )
  ) THEN RAISE EXCEPTION 'DEVICE_BRANCH_AMBIGUOUS';
 END IF;

  IF EXISTS (
    SELECT 1 FROM public.credit_application_events e
      JOIN public.credit_applications a ON a.tenant_id=e.tenant_id AND a.id=e.application_id
    WHERE e.metadata->>'loanId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    GROUP BY (e.metadata->>'loanId')::uuid HAVING count(DISTINCT a.branch_id)>1
  ) THEN RAISE EXCEPTION 'LOAN_BRANCH_AMBIGUOUS';
 END IF;

END $$;
--> statement-breakpoint
UPDATE public.devices d SET branch_id=(
  SELECT min(a.branch_id::text)::uuid FROM public.credit_applications a
  WHERE a.tenant_id=d.tenant_id AND a.device_id=d.id AND a.branch_id IS NOT NULL
) WHERE d.branch_id IS NULL AND EXISTS(
  SELECT 1 FROM public.credit_applications a WHERE a.tenant_id=d.tenant_id AND a.device_id=d.id AND a.branch_id IS NOT NULL
);
--> statement-breakpoint
UPDATE public.loans l SET branch_id=(
  SELECT min(a.branch_id::text)::uuid FROM public.credit_application_events e
  JOIN public.credit_applications a ON a.tenant_id=e.tenant_id AND a.id=e.application_id
  WHERE e.tenant_id=l.tenant_id AND (e.metadata->>'loanId') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND (e.metadata->>'loanId')::uuid=l.id AND a.branch_id IS NOT NULL
) WHERE l.branch_id IS NULL AND EXISTS(
  SELECT 1 FROM public.credit_application_events e JOIN public.credit_applications a ON a.tenant_id=e.tenant_id AND a.id=e.application_id
  WHERE e.tenant_id=l.tenant_id AND (e.metadata->>'loanId') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND (e.metadata->>'loanId')::uuid=l.id AND a.branch_id IS NOT NULL
);
--> statement-breakpoint
UPDATE public.credit_contracts c SET branch_id=l.branch_id
FROM public.loans l WHERE l.tenant_id=c.tenant_id AND l.contract_id=c.id AND c.branch_id IS NULL AND l.branch_id IS NOT NULL;
--> statement-breakpoint
UPDATE public.credit_application_events e SET branch_id=a.branch_id
FROM public.credit_applications a WHERE a.tenant_id=e.tenant_id AND a.id=e.application_id;
--> statement-breakpoint
UPDATE public.audit_logs al SET branch_id=src.branch_id FROM (
  SELECT 'customer'::text entity_type,c.id entity_id,c.tenant_id,c.branch_id FROM public.customers c
  UNION ALL SELECT 'device',d.id,d.tenant_id,d.branch_id FROM public.devices d
  UNION ALL SELECT 'credit_application',a.id,a.tenant_id,a.branch_id FROM public.credit_applications a
  UNION ALL SELECT 'loan',l.id,l.tenant_id,l.branch_id FROM public.loans l
  UNION ALL SELECT 'credit_contract',c.id,c.tenant_id,c.branch_id FROM public.credit_contracts c
  UNION ALL SELECT 'payment',p.id,p.tenant_id,l.branch_id FROM public.payments p JOIN public.loans l ON l.tenant_id=p.tenant_id AND l.id=p.loan_id
) src WHERE al.tenant_id=src.tenant_id AND al.entity_type=src.entity_type AND al.entity_id=src.entity_id AND al.branch_id IS NULL;
--> statement-breakpoint
UPDATE public.ledger_entries le SET branch_id=l.branch_id FROM public.payments p JOIN public.loans l
  ON l.tenant_id=p.tenant_id AND l.id=p.loan_id WHERE le.tenant_id=p.tenant_id AND le.payment_id=p.id AND le.branch_id IS NULL;
--> statement-breakpoint
ALTER TABLE public.devices ADD CONSTRAINT devices_branch_tenant_fk FOREIGN KEY(tenant_id,branch_id) REFERENCES public.branches(tenant_id,id);
--> statement-breakpoint
ALTER TABLE public.credit_contracts ADD CONSTRAINT contracts_branch_tenant_fk FOREIGN KEY(tenant_id,branch_id) REFERENCES public.branches(tenant_id,id);
--> statement-breakpoint
ALTER TABLE public.loans ADD CONSTRAINT loans_branch_tenant_fk FOREIGN KEY(tenant_id,branch_id) REFERENCES public.branches(tenant_id,id);
--> statement-breakpoint
ALTER TABLE public.credit_application_events ADD CONSTRAINT app_events_branch_tenant_fk FOREIGN KEY(tenant_id,branch_id) REFERENCES public.branches(tenant_id,id);
--> statement-breakpoint
ALTER TABLE public.audit_logs ADD CONSTRAINT audit_branch_tenant_fk FOREIGN KEY(tenant_id,branch_id) REFERENCES public.branches(tenant_id,id);
--> statement-breakpoint
ALTER TABLE public.ledger_entries ADD CONSTRAINT ledger_branch_tenant_fk FOREIGN KEY(tenant_id,branch_id) REFERENCES public.branches(tenant_id,id);
--> statement-breakpoint
CREATE INDEX devices_tenant_branch_idx ON public.devices(tenant_id,branch_id);
--> statement-breakpoint
CREATE INDEX applications_tenant_branch_idx ON public.credit_applications(tenant_id,branch_id);
--> statement-breakpoint
CREATE INDEX loans_tenant_branch_idx ON public.loans(tenant_id,branch_id);
--> statement-breakpoint
CREATE INDEX payments_tenant_loan_idx ON public.payments(tenant_id,loan_id);
--> statement-breakpoint
CREATE OR REPLACE FUNCTION app_private.has_branch_permission(p_tenant_id uuid,p_branch_id uuid,p_permission_key text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS(
    SELECT 1 FROM public.tenant_memberships m
    JOIN public.tenants t ON t.id=m.tenant_id AND t.status='active'
    JOIN public.roles r ON r.key=m.role
    JOIN public.role_permissions rp ON rp.role_id=r.id
    JOIN public.permissions p ON p.id=rp.permission_id
    WHERE m.tenant_id=p_tenant_id AND m.user_id=(SELECT auth.uid()) AND m.status='active'
      AND p.key=p_permission_key AND (m.branch_id IS NULL OR m.branch_id=p_branch_id)
  )
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app_private.has_branch_permission(uuid,uuid,text) FROM PUBLIC,anon;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_private.has_branch_permission(uuid,uuid,text) TO authenticated;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION app_private.guard_branch_membership()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_actor_branch uuid;

BEGIN
  IF (SELECT auth.uid()) IS NULL THEN RETURN NEW;
 END IF;

  SELECT branch_id INTO v_actor_branch FROM public.tenant_memberships
  WHERE tenant_id=NEW.tenant_id AND user_id=(SELECT auth.uid()) AND status='active';

  IF NOT FOUND OR (v_actor_branch IS NOT NULL AND NEW.branch_id IS DISTINCT FROM v_actor_branch) THEN
    RAISE EXCEPTION 'BRANCH_SCOPE_FORBIDDEN' USING ERRCODE='42501';

  END IF;

  RETURN NEW;

END $$;
--> statement-breakpoint
CREATE TRIGGER tenant_memberships_branch_guard BEFORE INSERT OR UPDATE OF role,branch_id,status
  ON public.tenant_memberships FOR EACH ROW EXECUTE FUNCTION app_private.guard_branch_membership();
--> statement-breakpoint
DROP POLICY IF EXISTS branches_permission_select ON public.branches;
--> statement-breakpoint
CREATE POLICY branches_permission_select ON public.branches FOR SELECT TO authenticated
  USING(app_private.has_branch_permission(tenant_id,id,'branches.read'));
--> statement-breakpoint
DROP POLICY IF EXISTS branches_permission_write ON public.branches;
--> statement-breakpoint
CREATE POLICY branches_permission_write ON public.branches FOR ALL TO authenticated
  USING(app_private.has_branch_permission(tenant_id,id,'branches.manage'))
  WITH CHECK(app_private.has_branch_permission(tenant_id,id,'branches.manage'));
--> statement-breakpoint
DROP POLICY IF EXISTS customers_permission_select ON public.customers;
--> statement-breakpoint
CREATE POLICY customers_permission_select ON public.customers FOR SELECT TO authenticated
  USING(app_private.has_branch_permission(tenant_id,branch_id,'customers.read'));
--> statement-breakpoint
DROP POLICY IF EXISTS customers_permission_write ON public.customers;
--> statement-breakpoint
CREATE POLICY customers_permission_write ON public.customers FOR ALL TO authenticated
  USING(app_private.has_branch_permission(tenant_id,branch_id,'customers.write'))
  WITH CHECK(app_private.has_branch_permission(tenant_id,branch_id,'customers.write'));
--> statement-breakpoint
DROP POLICY IF EXISTS devices_permission_select ON public.devices;
--> statement-breakpoint
CREATE POLICY devices_permission_select ON public.devices FOR SELECT TO authenticated
  USING(app_private.has_branch_permission(tenant_id,branch_id,'devices.read'));
--> statement-breakpoint
DROP POLICY IF EXISTS devices_permission_write ON public.devices;
--> statement-breakpoint
CREATE POLICY devices_permission_write ON public.devices FOR ALL TO authenticated
  USING(app_private.has_branch_permission(tenant_id,branch_id,'devices.write'))
  WITH CHECK(app_private.has_branch_permission(tenant_id,branch_id,'devices.write'));
--> statement-breakpoint
DROP POLICY IF EXISTS credit_applications_permission_select ON public.credit_applications;
--> statement-breakpoint
CREATE POLICY credit_applications_permission_select ON public.credit_applications FOR SELECT TO authenticated
  USING(app_private.has_branch_permission(tenant_id,branch_id,'financing.read'));
--> statement-breakpoint
DROP POLICY IF EXISTS applications_permission_write ON public.credit_applications;
--> statement-breakpoint
CREATE POLICY applications_permission_write ON public.credit_applications FOR ALL TO authenticated
  USING(app_private.has_branch_permission(tenant_id,branch_id,'financing.write'))
  WITH CHECK(app_private.has_branch_permission(tenant_id,branch_id,'financing.write'));
--> statement-breakpoint
DROP POLICY IF EXISTS credit_application_events_read ON public.credit_application_events;
--> statement-breakpoint
CREATE POLICY credit_application_events_read ON public.credit_application_events FOR SELECT TO authenticated
  USING(app_private.has_branch_permission(tenant_id,branch_id,'financing.read'));
--> statement-breakpoint
DROP POLICY IF EXISTS credit_contracts_permission_select ON public.credit_contracts;
--> statement-breakpoint
CREATE POLICY credit_contracts_permission_select ON public.credit_contracts FOR SELECT TO authenticated
  USING(app_private.has_branch_permission(tenant_id,branch_id,'financing.read'));
--> statement-breakpoint
DROP POLICY IF EXISTS contracts_permission_write ON public.credit_contracts;
--> statement-breakpoint
CREATE POLICY contracts_permission_write ON public.credit_contracts FOR ALL TO authenticated
  USING(app_private.has_branch_permission(tenant_id,branch_id,'financing.write'))
  WITH CHECK(app_private.has_branch_permission(tenant_id,branch_id,'financing.write'));
--> statement-breakpoint
DROP POLICY IF EXISTS loans_permission_select ON public.loans;
--> statement-breakpoint
CREATE POLICY loans_permission_select ON public.loans FOR SELECT TO authenticated
  USING(app_private.has_branch_permission(tenant_id,branch_id,'financing.read'));
--> statement-breakpoint
DROP POLICY IF EXISTS loans_permission_write ON public.loans;
--> statement-breakpoint
CREATE POLICY loans_permission_write ON public.loans FOR ALL TO authenticated
  USING(app_private.has_branch_permission(tenant_id,branch_id,'financing.write'))
  WITH CHECK(app_private.has_branch_permission(tenant_id,branch_id,'financing.write'));
--> statement-breakpoint
DROP POLICY IF EXISTS installments_permission_select ON public.installments;
--> statement-breakpoint
CREATE POLICY installments_permission_select ON public.installments FOR SELECT TO authenticated
  USING(EXISTS(SELECT 1 FROM public.loans l WHERE l.tenant_id=installments.tenant_id AND l.id=installments.loan_id
    AND app_private.has_branch_permission(l.tenant_id,l.branch_id,'financing.read')));
--> statement-breakpoint
DROP POLICY IF EXISTS installments_permission_write ON public.installments;
--> statement-breakpoint
CREATE POLICY installments_permission_write ON public.installments FOR ALL TO authenticated
  USING(EXISTS(SELECT 1 FROM public.loans l WHERE l.tenant_id=installments.tenant_id AND l.id=installments.loan_id
    AND app_private.has_branch_permission(l.tenant_id,l.branch_id,'financing.write')))
  WITH CHECK(EXISTS(SELECT 1 FROM public.loans l WHERE l.tenant_id=installments.tenant_id AND l.id=installments.loan_id
    AND app_private.has_branch_permission(l.tenant_id,l.branch_id,'financing.write')));
--> statement-breakpoint
DROP POLICY IF EXISTS payments_permission_select ON public.payments;
--> statement-breakpoint
CREATE POLICY payments_permission_select ON public.payments FOR SELECT TO authenticated
  USING(EXISTS(SELECT 1 FROM public.loans l WHERE l.tenant_id=payments.tenant_id AND l.id=payments.loan_id
    AND app_private.has_branch_permission(l.tenant_id,l.branch_id,'payments.read')));
--> statement-breakpoint
DROP POLICY IF EXISTS payment_allocations_permission_select ON public.payment_allocations;
--> statement-breakpoint
CREATE POLICY payment_allocations_permission_select ON public.payment_allocations FOR SELECT TO authenticated
  USING(EXISTS(SELECT 1 FROM public.loans l WHERE l.tenant_id=payment_allocations.tenant_id AND l.id=payment_allocations.loan_id
    AND app_private.has_branch_permission(l.tenant_id,l.branch_id,'payments.read')));
--> statement-breakpoint
DROP POLICY IF EXISTS ledger_entries_permission_select ON public.ledger_entries;
--> statement-breakpoint
CREATE POLICY ledger_entries_permission_select ON public.ledger_entries FOR SELECT TO authenticated
  USING(app_private.has_branch_permission(tenant_id,branch_id,'payments.read'));
--> statement-breakpoint
DROP POLICY IF EXISTS audit_logs_read_privileged ON public.audit_logs;
--> statement-breakpoint
CREATE POLICY audit_logs_read_privileged ON public.audit_logs FOR SELECT TO authenticated
  USING(app_private.has_branch_permission(tenant_id,branch_id,'audit.read'));
--> statement-breakpoint
DROP POLICY IF EXISTS memberships_select_self ON public.tenant_memberships;
--> statement-breakpoint
CREATE POLICY memberships_select_self ON public.tenant_memberships FOR SELECT TO authenticated
  USING(user_id=(SELECT auth.uid()) OR app_private.has_branch_permission(tenant_id,branch_id,'tenant.manage'));
--> statement-breakpoint
CREATE OR REPLACE FUNCTION app_private.guard_financial_branch_scope()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_tenant_id uuid;
 v_branch_id uuid;
 v_permission text;

BEGIN
  IF TG_TABLE_NAME='credit_applications' THEN
    v_tenant_id:=NEW.tenant_id;
 v_branch_id:=NEW.branch_id;
 v_permission:='financing.write';

    IF NOT EXISTS(SELECT 1 FROM public.customers c WHERE c.tenant_id=NEW.tenant_id AND c.id=NEW.customer_id
      AND c.branch_id IS NOT DISTINCT FROM NEW.branch_id) THEN RAISE EXCEPTION 'CUSTOMER_BRANCH_MISMATCH' USING ERRCODE='23514';
 END IF;

    IF NEW.device_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.devices d WHERE d.tenant_id=NEW.tenant_id AND d.id=NEW.device_id
      AND d.branch_id IS NOT DISTINCT FROM NEW.branch_id) THEN RAISE EXCEPTION 'DEVICE_BRANCH_MISMATCH' USING ERRCODE='23514';
 END IF;

  ELSIF TG_TABLE_NAME='devices' THEN
    IF TG_OP='UPDATE' AND NEW.branch_id IS DISTINCT FROM OLD.branch_id AND EXISTS(
      SELECT 1 FROM public.credit_applications a WHERE a.tenant_id=OLD.tenant_id AND a.device_id=OLD.id
    ) THEN RAISE EXCEPTION 'DEVICE_BRANCH_IMMUTABLE' USING ERRCODE='23514';
 END IF;

    v_tenant_id:=NEW.tenant_id;
 v_branch_id:=NEW.branch_id;
 v_permission:='devices.write';

  ELSIF TG_TABLE_NAME='customers' THEN
    IF TG_OP='UPDATE' AND NEW.branch_id IS DISTINCT FROM OLD.branch_id AND EXISTS(
      SELECT 1 FROM public.credit_applications a WHERE a.tenant_id=OLD.tenant_id AND a.customer_id=OLD.id
    ) THEN RAISE EXCEPTION 'CUSTOMER_BRANCH_IMMUTABLE' USING ERRCODE='23514';
 END IF;

    v_tenant_id:=NEW.tenant_id;
 v_branch_id:=NEW.branch_id;
 v_permission:='customers.write';

  END IF;

  IF (SELECT auth.uid()) IS NULL THEN RETURN NEW;
 END IF;

  IF NOT app_private.has_branch_permission(v_tenant_id,v_branch_id,v_permission) THEN
    RAISE EXCEPTION 'BRANCH_SCOPE_FORBIDDEN' USING ERRCODE='42501';

  END IF;

  RETURN NEW;

END $$;
--> statement-breakpoint
CREATE TRIGGER applications_branch_guard BEFORE INSERT OR UPDATE OF branch_id,customer_id,device_id
  ON public.credit_applications FOR EACH ROW EXECUTE FUNCTION app_private.guard_financial_branch_scope();
--> statement-breakpoint
CREATE TRIGGER customers_branch_guard BEFORE INSERT OR UPDATE OF branch_id
  ON public.customers FOR EACH ROW EXECUTE FUNCTION app_private.guard_financial_branch_scope();
--> statement-breakpoint
CREATE TRIGGER devices_branch_guard BEFORE INSERT OR UPDATE OF branch_id
  ON public.devices FOR EACH ROW EXECUTE FUNCTION app_private.guard_financial_branch_scope();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION app_private.set_related_branch()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF TG_TABLE_NAME='credit_contracts' THEN
    SELECT branch_id INTO NEW.branch_id FROM public.customers WHERE tenant_id=NEW.tenant_id AND id=NEW.customer_id;

    IF (SELECT auth.uid()) IS NOT NULL AND NOT app_private.has_branch_permission(NEW.tenant_id,NEW.branch_id,'financing.write') THEN RAISE EXCEPTION 'BRANCH_SCOPE_FORBIDDEN' USING ERRCODE='42501';
 END IF;

  ELSIF TG_TABLE_NAME='loans' THEN
    SELECT branch_id INTO NEW.branch_id FROM public.credit_contracts WHERE tenant_id=NEW.tenant_id AND id=NEW.contract_id;

    IF NOT EXISTS(SELECT 1 FROM public.customers c WHERE c.tenant_id=NEW.tenant_id AND c.id=NEW.customer_id AND c.branch_id IS NOT DISTINCT FROM NEW.branch_id)
      OR NOT EXISTS(SELECT 1 FROM public.devices d WHERE d.tenant_id=NEW.tenant_id AND d.id=NEW.device_id AND d.branch_id IS NOT DISTINCT FROM NEW.branch_id)
    THEN RAISE EXCEPTION 'FINANCING_BRANCH_MISMATCH' USING ERRCODE='23514';
 END IF;

    IF (SELECT auth.uid()) IS NOT NULL AND NOT app_private.has_branch_permission(NEW.tenant_id,NEW.branch_id,'financing.write') THEN RAISE EXCEPTION 'BRANCH_SCOPE_FORBIDDEN' USING ERRCODE='42501';
 END IF;

  ELSIF TG_TABLE_NAME='credit_application_events' THEN
    SELECT branch_id INTO NEW.branch_id FROM public.credit_applications WHERE tenant_id=NEW.tenant_id AND id=NEW.application_id;

    IF (SELECT auth.uid()) IS NOT NULL AND NOT app_private.has_branch_permission(NEW.tenant_id,NEW.branch_id,'financing.approve') THEN RAISE EXCEPTION 'BRANCH_SCOPE_FORBIDDEN' USING ERRCODE='42501';
 END IF;

  ELSIF TG_TABLE_NAME='ledger_entries' THEN
    IF NEW.payment_id IS NOT NULL THEN
      SELECT l.branch_id INTO NEW.branch_id FROM public.payments p JOIN public.loans l ON l.tenant_id=p.tenant_id AND l.id=p.loan_id
        WHERE p.tenant_id=NEW.tenant_id AND p.id=NEW.payment_id;

    END IF;

    IF (SELECT auth.uid()) IS NOT NULL AND NOT app_private.has_branch_permission(NEW.tenant_id,NEW.branch_id,'payments.record') THEN RAISE EXCEPTION 'BRANCH_SCOPE_FORBIDDEN' USING ERRCODE='42501';
 END IF;

  ELSIF TG_TABLE_NAME='audit_logs' THEN
    IF NEW.entity_id IS NOT NULL THEN
      CASE NEW.entity_type
        WHEN 'customer' THEN SELECT branch_id INTO NEW.branch_id FROM public.customers WHERE tenant_id=NEW.tenant_id AND id=NEW.entity_id;

        WHEN 'device' THEN SELECT branch_id INTO NEW.branch_id FROM public.devices WHERE tenant_id=NEW.tenant_id AND id=NEW.entity_id;

        WHEN 'credit_application' THEN SELECT branch_id INTO NEW.branch_id FROM public.credit_applications WHERE tenant_id=NEW.tenant_id AND id=NEW.entity_id;

        WHEN 'credit_contract' THEN SELECT branch_id INTO NEW.branch_id FROM public.credit_contracts WHERE tenant_id=NEW.tenant_id AND id=NEW.entity_id;

        WHEN 'loan' THEN SELECT branch_id INTO NEW.branch_id FROM public.loans WHERE tenant_id=NEW.tenant_id AND id=NEW.entity_id;

        WHEN 'payment' THEN SELECT l.branch_id INTO NEW.branch_id FROM public.payments p JOIN public.loans l ON l.tenant_id=p.tenant_id AND l.id=p.loan_id WHERE p.tenant_id=NEW.tenant_id AND p.id=NEW.entity_id;

        ELSE NULL;

      END CASE;

    END IF;

  END IF;

  RETURN NEW;

END $$;
--> statement-breakpoint
CREATE TRIGGER contracts_branch_autoset BEFORE INSERT OR UPDATE OF customer_id,branch_id ON public.credit_contracts
  FOR EACH ROW EXECUTE FUNCTION app_private.set_related_branch();
--> statement-breakpoint
CREATE TRIGGER loans_branch_autoset BEFORE INSERT OR UPDATE OF contract_id,customer_id,device_id,branch_id ON public.loans
  FOR EACH ROW EXECUTE FUNCTION app_private.set_related_branch();
--> statement-breakpoint
CREATE TRIGGER app_events_branch_autoset BEFORE INSERT OR UPDATE OF application_id,branch_id ON public.credit_application_events
  FOR EACH ROW EXECUTE FUNCTION app_private.set_related_branch();
--> statement-breakpoint
CREATE TRIGGER ledger_branch_autoset BEFORE INSERT OR UPDATE OF payment_id,branch_id ON public.ledger_entries
  FOR EACH ROW EXECUTE FUNCTION app_private.set_related_branch();
--> statement-breakpoint
CREATE TRIGGER audit_branch_autoset BEFORE INSERT OR UPDATE OF entity_type,entity_id,branch_id ON public.audit_logs
  FOR EACH ROW EXECUTE FUNCTION app_private.set_related_branch();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION app_private.guard_payment_branch()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_branch_id uuid;
 v_permission text;

BEGIN
  IF (SELECT auth.uid()) IS NULL THEN RETURN NEW;
 END IF;

  SELECT branch_id INTO v_branch_id FROM public.loans WHERE tenant_id=NEW.tenant_id AND id=NEW.loan_id;

  v_permission:=CASE WHEN TG_OP='UPDATE' THEN 'payments.reverse' ELSE 'payments.record' END;

  IF NOT app_private.has_branch_permission(NEW.tenant_id,v_branch_id,v_permission) THEN
    RAISE EXCEPTION 'BRANCH_SCOPE_FORBIDDEN' USING ERRCODE='42501';

  END IF;

  RETURN NEW;

END $$;
--> statement-breakpoint
CREATE TRIGGER payments_branch_guard BEFORE INSERT OR UPDATE OF reversed_at ON public.payments
  FOR EACH ROW EXECUTE FUNCTION app_private.guard_payment_branch();
--> statement-breakpoint
DROP POLICY IF EXISTS customer_documents_permission_select ON public.customer_documents;
--> statement-breakpoint
CREATE POLICY customer_documents_permission_select ON public.customer_documents FOR SELECT TO authenticated
  USING(EXISTS(SELECT 1 FROM public.customers c WHERE c.tenant_id=customer_documents.tenant_id AND c.id=customer_documents.customer_id
    AND app_private.has_branch_permission(c.tenant_id,c.branch_id,'customers.read')));
--> statement-breakpoint
DROP POLICY IF EXISTS customer_documents_permission_write ON public.customer_documents;
--> statement-breakpoint
CREATE POLICY customer_documents_permission_write ON public.customer_documents FOR ALL TO authenticated
  USING(EXISTS(SELECT 1 FROM public.customers c WHERE c.tenant_id=customer_documents.tenant_id AND c.id=customer_documents.customer_id
    AND app_private.has_branch_permission(c.tenant_id,c.branch_id,'customers.write')))
  WITH CHECK(EXISTS(SELECT 1 FROM public.customers c WHERE c.tenant_id=customer_documents.tenant_id AND c.id=customer_documents.customer_id
    AND app_private.has_branch_permission(c.tenant_id,c.branch_id,'customers.write')));
--> statement-breakpoint
DROP POLICY IF EXISTS mdm_commands_permission_select ON public.mdm_commands;
--> statement-breakpoint
CREATE POLICY mdm_commands_permission_select ON public.mdm_commands FOR SELECT TO authenticated
  USING(EXISTS(SELECT 1 FROM public.devices d WHERE d.tenant_id=mdm_commands.tenant_id AND d.id=mdm_commands.device_id
    AND app_private.has_branch_permission(d.tenant_id,d.branch_id,'devices.read')));
--> statement-breakpoint
