-- Keep the pure IMEI constraint helper out of the anonymous API surface.
REVOKE ALL ON FUNCTION app_private.imei_is_valid(text) FROM PUBLIC, anon, authenticated;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_private.imei_is_valid(text) TO authenticated;
--> statement-breakpoint
-- New RPCs must receive an explicit role grant instead of PostgreSQL's PUBLIC default.
ALTER DEFAULT PRIVILEGES REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
