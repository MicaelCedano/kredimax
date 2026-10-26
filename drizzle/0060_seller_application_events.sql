-- Origination and evaluation have distinct permissions. Keep branch scope for both.
CREATE FUNCTION app_private.set_application_event_branch()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_permission text;
BEGIN
  SELECT branch_id INTO NEW.branch_id FROM public.credit_applications
    WHERE tenant_id=NEW.tenant_id AND id=NEW.application_id;
  v_permission:=CASE WHEN NEW.event_type='application_created' THEN 'financing.write' ELSE 'financing.approve' END;
  IF auth.uid() IS NOT NULL AND NOT app_private.has_branch_permission(NEW.tenant_id,NEW.branch_id,v_permission) THEN
    RAISE EXCEPTION 'BRANCH_SCOPE_FORBIDDEN' USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app_private.set_application_event_branch() FROM PUBLIC,anon,authenticated;
--> statement-breakpoint
DROP TRIGGER app_events_branch_autoset ON public.credit_application_events;
--> statement-breakpoint
CREATE TRIGGER app_events_branch_autoset BEFORE INSERT OR UPDATE OF application_id,branch_id
  ON public.credit_application_events FOR EACH ROW EXECUTE FUNCTION app_private.set_application_event_branch();
