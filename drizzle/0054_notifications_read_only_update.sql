-- Notifications are created by trusted workflows. API users may only mark their own rows as read.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.notifications FROM PUBLIC, anon, authenticated;
--> statement-breakpoint
REVOKE UPDATE (id, tenant_id, user_id, category, title, body, read_at, created_at)
  ON public.notifications FROM PUBLIC, anon, authenticated;
--> statement-breakpoint
GRANT UPDATE (read_at) ON public.notifications TO authenticated;
--> statement-breakpoint
DROP POLICY IF EXISTS notifications_own ON public.notifications;
--> statement-breakpoint
CREATE POLICY notifications_own_select ON public.notifications FOR SELECT TO authenticated
  USING (user_id=(SELECT auth.uid()) AND app_private.has_tenant_permission(tenant_id,'customers.read'));
--> statement-breakpoint
CREATE POLICY notifications_own_mark_read ON public.notifications FOR UPDATE TO authenticated
  USING (user_id=(SELECT auth.uid()) AND app_private.has_tenant_permission(tenant_id,'customers.read'))
  WITH CHECK (user_id=(SELECT auth.uid()) AND app_private.has_tenant_permission(tenant_id,'customers.read') AND read_at IS NOT NULL);
