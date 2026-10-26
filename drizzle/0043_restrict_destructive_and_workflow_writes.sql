-- RLS does not govern TRUNCATE. Remove destructive table privileges globally,
-- then force workflow-owned writes through their audited transactional RPCs.
REVOKE DELETE, TRUNCATE ON ALL TABLES IN SCHEMA public FROM PUBLIC, anon, authenticated;
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE DELETE, TRUNCATE ON TABLES FROM PUBLIC, anon, authenticated;
--> statement-breakpoint
REVOKE INSERT, UPDATE, DELETE ON TABLE public.branches,
  public.tenant_memberships,
  public.tenants,
  public.tenant_settings,
  public.roles,
  public.permissions,
  public.role_permissions,
  public.ledger_accounts,
  public.mdm_providers,
  public.customer_documents,
  public.credit_applications,
  public.credit_contracts
FROM PUBLIC, anon, authenticated;
--> statement-breakpoint
DO $$
DECLARE
  trigger_function record;
BEGIN
  FOR trigger_function IN
    SELECT DISTINCT n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_trigger t
    JOIN pg_proc p ON p.oid=t.tgfoid
    JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE NOT t.tgisinternal AND n.nspname='app_private'
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %I.%I(%s) FROM PUBLIC, anon, authenticated',
      trigger_function.nspname, trigger_function.proname, trigger_function.args);
  END LOOP;
END $$;
