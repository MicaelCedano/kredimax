-- Datos iniciales exclusivamente para las bases locales de pruebas de KrediMax.
-- Reejecutable: asegura YacellTech y su única sucursal activa de prueba.
DO $$
DECLARE
  tenant_uuid uuid;
  branch_uuid uuid;
  tenant_matches integer;
BEGIN
  IF current_database() NOT IN ('kredimax_local_test', 'postgres')
     OR (inet_server_addr() IS NOT NULL AND inet_server_addr() NOT IN ('127.0.0.1'::inet, '::1'::inet)) THEN
    RAISE EXCEPTION 'Este seed solo se permite en una base local de KrediMax; base actual: %, servidor: %', current_database(), inet_server_addr();
  END IF;

  SELECT count(*) INTO tenant_matches
  FROM public.tenants
  WHERE name = 'YacellTech';

  IF tenant_matches > 1 THEN
    RAISE EXCEPTION 'Hay más de un tenant YacellTech; revisar manualmente antes de sembrar.';
  ELSIF tenant_matches = 0 THEN
    INSERT INTO public.tenants (name, status, currency, timezone)
    VALUES ('YacellTech', 'active', 'DOP', 'America/Santo_Domingo')
    RETURNING id INTO tenant_uuid;
  ELSE
    SELECT id INTO tenant_uuid
    FROM public.tenants
    WHERE name = 'YacellTech';

    UPDATE public.tenants SET status = 'active'
    WHERE id = tenant_uuid;
  END IF;

  INSERT INTO public.branches (tenant_id, name, code, active)
  VALUES (tenant_uuid, 'YacellTech La Romana', 'LA-ROMANA', true)
  ON CONFLICT (tenant_id, code)
  DO UPDATE SET name = EXCLUDED.name, active = true
  RETURNING id INTO branch_uuid;

  UPDATE public.branches
  SET active = (id = branch_uuid)
  WHERE tenant_id = tenant_uuid;
END $$;
