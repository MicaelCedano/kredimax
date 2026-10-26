-- Allow any 15-digit numeric IMEI without enforcing strict Luhn check-digit rejection.
CREATE OR REPLACE FUNCTION app_private.imei_is_valid(p_imei text)
RETURNS boolean LANGUAGE sql IMMUTABLE STRICT SET search_path = '' AS $$
  SELECT btrim(p_imei) ~ '^[0-9]{15}$';
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app_private.imei_is_valid(text) FROM PUBLIC, anon, authenticated;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_private.imei_is_valid(text) TO authenticated;
