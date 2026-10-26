-- MDM commands are disabled until a real provider and operating rules are approved.
-- Keep existing request history readable while preventing client-side writes.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON TABLE public.mdm_commands FROM PUBLIC, anon, authenticated;
--> statement-breakpoint
DROP POLICY IF EXISTS mdm_commands_confirmed_insert ON public.mdm_commands;
