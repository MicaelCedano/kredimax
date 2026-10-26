-- Financial date validation and contract year must use the Dominican business day,
-- regardless of the session/database timezone configured by the caller.
ALTER FUNCTION app_private.create_credit_application(uuid,uuid,uuid,uuid,numeric,jsonb,uuid)
  SET TimeZone TO 'America/Santo_Domingo';
--> statement-breakpoint
ALTER FUNCTION app_private.review_credit_application(uuid,text,text,text,text,boolean)
  SET TimeZone TO 'America/Santo_Domingo';
--> statement-breakpoint
COMMENT ON FUNCTION app_private.create_credit_application(uuid,uuid,uuid,uuid,numeric,jsonb,uuid)
  IS 'Financial date validation uses the America/Santo_Domingo business timezone.';
--> statement-breakpoint
COMMENT ON FUNCTION app_private.review_credit_application(uuid,text,text,text,text,boolean)
  IS 'Contract numbering uses the America/Santo_Domingo business timezone.';
