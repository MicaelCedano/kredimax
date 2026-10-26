-- Let a member see the name of their assigned branch even if their role cannot list all branches.
CREATE POLICY branches_assigned_membership_read ON public.branches FOR SELECT TO authenticated
  USING(EXISTS(SELECT 1 FROM public.tenant_memberships m
    WHERE m.user_id=(SELECT auth.uid()) AND m.status='active' AND m.tenant_id=branches.tenant_id AND m.branch_id=branches.id));
