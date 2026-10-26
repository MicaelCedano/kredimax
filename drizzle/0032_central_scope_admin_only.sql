-- A branchless membership is the tenant-wide administrative scope. Refuse this constraint
-- when existing memberships would be incompatible; never silently reassign them.
DO $$
DECLARE v_incompatible integer;
BEGIN
  SELECT count(*) INTO v_incompatible FROM public.tenant_memberships
    WHERE branch_id IS NULL AND role<>'tenant_admin';
  IF v_incompatible>0 THEN
    RAISE EXCEPTION 'CENTRAL_MEMBERSHIP_SCOPE_INCOMPATIBLE: % non-admin memberships have no branch; review assignments before retrying',v_incompatible;
  END IF;
END $$;
--> statement-breakpoint
ALTER TABLE public.tenant_memberships
  ADD CONSTRAINT tenant_memberships_central_scope_admin_only
  CHECK (branch_id IS NOT NULL OR role='tenant_admin') NOT VALID;
--> statement-breakpoint
ALTER TABLE public.tenant_memberships
  VALIDATE CONSTRAINT tenant_memberships_central_scope_admin_only;
