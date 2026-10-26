-- Financial entries must be created by the atomic, permission-checked RPCs.
-- Direct table inserts bypass balance allocation and audit logging.
REVOKE INSERT ON public.payments, public.payment_allocations, public.ledger_entries
  FROM PUBLIC, anon, authenticated;

DROP POLICY IF EXISTS payments_permission_insert ON public.payments;
DROP POLICY IF EXISTS allocations_permission_insert ON public.payment_allocations;
DROP POLICY IF EXISTS ledger_entries_append_only ON public.ledger_entries;

-- Audit events are written by trusted database functions in the same transaction
-- as the operation they describe. Do not allow clients to forge audit rows.
REVOKE INSERT ON public.audit_logs FROM PUBLIC, anon, authenticated;
DROP POLICY IF EXISTS audit_logs_insert_self ON public.audit_logs;
