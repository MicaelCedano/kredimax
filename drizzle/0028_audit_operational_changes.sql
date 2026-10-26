CREATE OR REPLACE FUNCTION app_private.audit_operational_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_tenant_id uuid; v_entity_id uuid; v_entity_type text;
        v_actor uuid:=(SELECT auth.uid()); v_branch_id uuid; v_fields text[];
BEGIN
  IF TG_OP='INSERT' THEN v_tenant_id:=NEW.tenant_id; ELSE v_tenant_id:=OLD.tenant_id; END IF;
  IF v_actor IS NULL THEN RETURN NEW; END IF;
  SELECT coalesce(array_agg(n.key ORDER BY n.key),ARRAY[]::text[]) INTO v_fields
    FROM jsonb_each(to_jsonb(NEW)) n
    LEFT JOIN jsonb_each(to_jsonb(OLD)) o ON o.key=n.key
    WHERE (TG_OP='INSERT' OR n.value IS DISTINCT FROM o.value)
      AND n.key NOT IN ('updated_at','updated_by');
  IF TG_OP='UPDATE' AND cardinality(v_fields)=0 THEN RETURN NEW; END IF;

  CASE TG_TABLE_NAME
    WHEN 'customers' THEN v_entity_type:='customer'; v_entity_id:=NEW.id; v_branch_id:=NEW.branch_id;
    WHEN 'devices' THEN v_entity_type:='device'; v_entity_id:=NEW.id; v_branch_id:=NEW.branch_id;
    WHEN 'mdm_commands' THEN
      v_entity_type:='mdm_command'; v_entity_id:=NEW.id;
      SELECT branch_id INTO v_branch_id FROM public.devices WHERE tenant_id=NEW.tenant_id AND id=NEW.device_id;
    WHEN 'financing_settings' THEN
      v_entity_type:='financing_settings'; v_entity_id:=NEW.tenant_id;
      SELECT branch_id INTO v_branch_id FROM public.tenant_memberships
        WHERE tenant_id=NEW.tenant_id AND user_id=v_actor AND status='active';
    ELSE RAISE EXCEPTION 'UNSUPPORTED_AUDIT_TABLE';
  END CASE;

  INSERT INTO public.audit_logs(tenant_id,branch_id,actor_id,action,entity_type,entity_id,metadata)
    VALUES(v_tenant_id,v_branch_id,v_actor,v_entity_type||'.'||lower(TG_OP),v_entity_type,v_entity_id,
      jsonb_build_object('changedFields',to_jsonb(v_fields)));
  RETURN NEW;
END $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app_private.audit_operational_change() FROM PUBLIC,anon,authenticated;
--> statement-breakpoint
CREATE TRIGGER customers_audit_changes AFTER INSERT OR UPDATE ON public.customers
  FOR EACH ROW EXECUTE FUNCTION app_private.audit_operational_change();
--> statement-breakpoint
CREATE TRIGGER devices_audit_changes AFTER INSERT OR UPDATE ON public.devices
  FOR EACH ROW EXECUTE FUNCTION app_private.audit_operational_change();
--> statement-breakpoint
CREATE TRIGGER mdm_commands_audit_changes AFTER INSERT OR UPDATE ON public.mdm_commands
  FOR EACH ROW EXECUTE FUNCTION app_private.audit_operational_change();
--> statement-breakpoint
CREATE TRIGGER financing_settings_audit_changes AFTER INSERT OR UPDATE ON public.financing_settings
  FOR EACH ROW EXECUTE FUNCTION app_private.audit_operational_change();
