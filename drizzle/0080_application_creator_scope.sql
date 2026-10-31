ALTER TABLE "credit_applications" ADD COLUMN "created_by_name" text;--> statement-breakpoint
CREATE INDEX "credit_applications_tenant_creator_status_idx" ON "credit_applications" USING btree ("tenant_id","created_by","status","created_at");
--> statement-breakpoint
-- Existing creator IDs are authoritative. Preserve them and record their current display name.
UPDATE public.credit_applications a SET created_by_name=left(coalesce(nullif(btrim(u.raw_user_meta_data->>'full_name'),''),
 nullif(btrim(u.raw_user_meta_data->>'name'),''),u.email,'Usuario registrado'),200)
 FROM auth.users u WHERE u.id=a.created_by;
CREATE FUNCTION app_private.stamp_application_creator() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF TG_OP='UPDATE' THEN
  IF NEW.created_by IS DISTINCT FROM OLD.created_by OR NEW.created_by_name IS DISTINCT FROM OLD.created_by_name THEN
   RAISE EXCEPTION 'APPLICATION_CREATOR_IMMUTABLE' USING ERRCODE='42501';
  END IF;
 ELSE
  IF auth.uid() IS NOT NULL AND NEW.created_by IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
  SELECT left(coalesce(nullif(btrim(u.raw_user_meta_data->>'full_name'),''),nullif(btrim(u.raw_user_meta_data->>'name'),''),u.email,'Usuario registrado'),200)
   INTO NEW.created_by_name FROM auth.users u WHERE u.id=NEW.created_by;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION app_private.stamp_application_creator() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER applications_stamp_creator BEFORE INSERT OR UPDATE ON public.credit_applications
 FOR EACH ROW EXECUTE FUNCTION app_private.stamp_application_creator();
--> statement-breakpoint
-- Authorization uses the stored membership and creator ID, never editable display metadata.
CREATE FUNCTION app_private.can_read_application_creator(p_tenant uuid,p_branch uuid,p_creator uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT auth.uid() IS NOT NULL AND app_private.has_branch_permission(p_tenant,p_branch,'financing.read')
  AND EXISTS(SELECT 1 FROM public.tenant_memberships m WHERE m.tenant_id=p_tenant AND m.user_id=(SELECT auth.uid())
   AND m.status='active' AND (m.role='tenant_admin' OR p_creator=m.user_id))
$$;
REVOKE ALL ON FUNCTION app_private.can_read_application_creator(uuid,uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION app_private.can_read_application_creator(uuid,uuid,uuid) TO authenticated;
-- Restrictive policies also constrain the pre-existing permissive FOR ALL policy.
CREATE POLICY applications_creator_read ON public.credit_applications AS RESTRICTIVE FOR SELECT TO authenticated
 USING(app_private.can_read_application_creator(tenant_id,branch_id,created_by));
CREATE POLICY application_events_creator_read ON public.credit_application_events AS RESTRICTIVE FOR SELECT TO authenticated
 USING(EXISTS(SELECT 1 FROM public.credit_applications a WHERE a.tenant_id=credit_application_events.tenant_id AND a.id=credit_application_events.application_id));
--> statement-breakpoint
CREATE FUNCTION public.application_creator_directory(p_tenant_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',s.created_by,'name',coalesce(s.created_by_name,'Usuario registrado')) ORDER BY s.created_by_name,s.created_by),'[]'::jsonb)
 FROM (SELECT DISTINCT ON (a.created_by) a.created_by,a.created_by_name FROM public.credit_applications a
  WHERE a.tenant_id=p_tenant_id ORDER BY a.created_by,a.created_at DESC,a.id) s
$$;
REVOKE ALL ON FUNCTION public.application_creator_directory(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.application_creator_directory(uuid) TO authenticated;
--> statement-breakpoint
-- A direct workflow RPC must obey the same visibility as the application page.
DO $migration$
DECLARE v_source text; v_old text;
BEGIN
 v_source:=pg_get_functiondef('app_private.review_credit_application(uuid,text,text,text,text,boolean)'::regprocedure);
 v_old:='IF NOT app_private.has_branch_permission(v_application.tenant_id,v_application.branch_id,''financing.approve'') THEN';
 IF position(v_old IN v_source)=0 THEN RAISE EXCEPTION 'Unexpected application review permission'; END IF;
 EXECUTE replace(v_source,v_old,'IF NOT app_private.can_read_application_creator(v_application.tenant_id,v_application.branch_id,v_application.created_by)
    OR NOT app_private.has_branch_permission(v_application.tenant_id,v_application.branch_id,''financing.approve'') THEN');
END $migration$;
