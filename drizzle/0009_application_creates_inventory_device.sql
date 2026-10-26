-- Custom SQL migration file, put your code below! --
CREATE OR REPLACE FUNCTION app_private.attach_application_device_from_snapshot()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_imei text;
  v_brand text;
  v_model text;
  v_device_id uuid;
  v_existing_brand text;
  v_existing_model text;
BEGIN
  IF NEW.device_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- A retry of the same form submission must not create an unused inventory row.
  IF EXISTS (
    SELECT 1 FROM public.credit_applications a
    WHERE a.tenant_id = NEW.tenant_id
      AND a.created_by = NEW.created_by
      AND a.submission_key = NEW.submission_key
  ) THEN
    RETURN NEW;
  END IF;

  IF v_user_id IS NULL
     OR v_user_id IS DISTINCT FROM NEW.created_by
     OR NOT app_private.has_tenant_permission(NEW.tenant_id, 'financing.write') THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.tenant_memberships m
    WHERE m.tenant_id = NEW.tenant_id
      AND m.user_id = v_user_id
      AND m.status = 'active'
      AND m.branch_id IS NOT DISTINCT FROM NEW.branch_id
  ) THEN
    RAISE EXCEPTION 'INVALID_BRANCH_SCOPE' USING ERRCODE = '42501';
  END IF;

  IF jsonb_typeof(NEW.quote_snapshot->'device') <> 'object' THEN
    RAISE EXCEPTION 'INVALID_DEVICE_SNAPSHOT' USING ERRCODE = '22023';
  END IF;

  v_brand := nullif(trim(NEW.quote_snapshot->'device'->>'brand'), '');
  v_model := nullif(trim(NEW.quote_snapshot->'device'->>'model'), '');
  v_imei := nullif(trim(NEW.quote_snapshot->'device'->>'imei'), '');
  IF v_brand IS NULL OR length(v_brand) > 80
     OR v_model IS NULL OR length(v_model) > 120
     OR v_imei IS NULL OR length(v_imei) > 20 THEN
    RAISE EXCEPTION 'INVALID_DEVICE_SNAPSHOT' USING ERRCODE = '22023';
  END IF;

  SELECT d.id, d.brand, d.model
  INTO v_device_id, v_existing_brand, v_existing_model
  FROM public.devices d
  WHERE d.tenant_id = NEW.tenant_id AND d.imei = v_imei;

  IF v_device_id IS NOT NULL THEN
    IF v_existing_brand <> v_brand OR v_existing_model <> v_model THEN
      RAISE EXCEPTION 'DEVICE_IMEI_CONFLICT' USING ERRCODE = '23505';
    END IF;
  ELSE
    INSERT INTO public.devices(tenant_id, imei, brand, model)
    VALUES (NEW.tenant_id, v_imei, v_brand, v_model)
    ON CONFLICT (tenant_id, imei) DO NOTHING
    RETURNING id INTO v_device_id;

    -- Another request may have registered this IMEI concurrently.
    IF v_device_id IS NULL THEN
      SELECT d.id, d.brand, d.model
      INTO v_device_id, v_existing_brand, v_existing_model
      FROM public.devices d
      WHERE d.tenant_id = NEW.tenant_id AND d.imei = v_imei;

      IF v_device_id IS NULL OR v_existing_brand <> v_brand OR v_existing_model <> v_model THEN
        RAISE EXCEPTION 'DEVICE_IMEI_CONFLICT' USING ERRCODE = '23505';
      END IF;
    END IF;
  END IF;

  NEW.device_id := v_device_id;
  NEW.quote_snapshot := jsonb_set(
    NEW.quote_snapshot,
    '{device,id}',
    to_jsonb(v_device_id::text),
    true
  );
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION app_private.attach_application_device_from_snapshot() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER credit_applications_attach_device_before_insert
BEFORE INSERT ON public.credit_applications
FOR EACH ROW
WHEN (NEW.device_id IS NULL)
EXECUTE FUNCTION app_private.attach_application_device_from_snapshot();
