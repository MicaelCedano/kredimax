CREATE TABLE IF NOT EXISTS public.system_backups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE SET NULL,
  backup_type varchar(32) NOT NULL DEFAULT 'daily',
  target_type varchar(32) NOT NULL DEFAULT 'full',
  status varchar(24) NOT NULL DEFAULT 'in_progress',
  pg_version varchar(120),
  file_name varchar(255) NOT NULL,
  file_size_bytes bigint NOT NULL DEFAULT 0,
  sha256_checksum varchar(64) NOT NULL,
  encryption_algorithm varchar(32) NOT NULL DEFAULT 'aes-256-gcm',
  drive_file_id varchar(128),
  drive_folder_path varchar(255),
  manifest jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_message text,
  integrity_status varchar(24) NOT NULL DEFAULT 'pending',
  integrity_verified_at timestamp with time zone,
  started_at timestamp with time zone NOT NULL DEFAULT now(),
  completed_at timestamp with time zone,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by_name text
);

CREATE INDEX IF NOT EXISTS system_backups_started_at_idx ON public.system_backups (started_at DESC);
CREATE INDEX IF NOT EXISTS system_backups_status_idx ON public.system_backups (status);
CREATE INDEX IF NOT EXISTS system_backups_tenant_idx ON public.system_backups (tenant_id);

ALTER TABLE public.system_backups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS system_backups_select_policy ON public.system_backups;
CREATE POLICY system_backups_select_policy ON public.system_backups
  FOR SELECT TO authenticated
  USING (
    tenant_id IS NULL OR app_private.has_tenant_permission(tenant_id, 'settings.manage')
  );

GRANT SELECT ON public.system_backups TO authenticated;
GRANT ALL ON public.system_backups TO service_role;
