-- HTTP hook helpers are trigger-only and the schema is not part of the Data API.
-- Remove inherited API-role execution grants as defense in depth.
DO $$
BEGIN
  IF to_regprocedure('supabase_functions.http_request()') IS NOT NULL THEN
    REVOKE EXECUTE ON FUNCTION supabase_functions.http_request() FROM PUBLIC, anon, authenticated;
  END IF;
END $$;
