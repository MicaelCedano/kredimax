-- API roles do not need to create triggers or foreign keys on application tables.
-- Remove inherited grants from existing tables and prevent them on future tables.
REVOKE REFERENCES, TRIGGER ON ALL TABLES IN SCHEMA public FROM PUBLIC, anon, authenticated;
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE REFERENCES, TRIGGER ON TABLES FROM PUBLIC, anon, authenticated;
