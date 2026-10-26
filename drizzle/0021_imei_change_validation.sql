-- A NOT VALID CHECK still blocks unrelated updates to invalid legacy rows.
-- Validate only new devices and changed identifiers, preserving legacy records.
ALTER TABLE public.devices DROP CONSTRAINT IF EXISTS devices_imei_luhn_ck;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION app_private.enforce_imei_on_change()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  IF NEW.imei IS NULL OR NOT app_private.imei_is_valid(NEW.imei) THEN
    RAISE EXCEPTION 'INVALID_IMEI' USING ERRCODE='22023';

  END IF;

  RETURN NEW;

END $$;
--> statement-breakpoint
CREATE TRIGGER devices_imei_valid_on_write
  BEFORE INSERT OR UPDATE OF imei ON public.devices
  FOR EACH ROW EXECUTE FUNCTION app_private.enforce_imei_on_change();
--> statement-breakpoint
