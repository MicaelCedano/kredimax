-- Auth-owned identities remain in Supabase Auth, never copied into user-editable metadata.
alter table public.tenant_memberships add constraint tenant_memberships_user_fk foreign key(user_id) references auth.users(id) on delete cascade;
alter table public.credit_applications add constraint applications_creator_fk foreign key(created_by) references auth.users(id);
alter table public.payments add constraint payments_receiver_fk foreign key(received_by) references auth.users(id);
alter table public.ledger_entries add constraint ledger_entries_creator_fk foreign key(created_by) references auth.users(id);
alter table public.mdm_commands add constraint mdm_commands_requester_fk foreign key(requested_by) references auth.users(id);
alter table public.audit_logs add constraint audit_logs_actor_fk foreign key(actor_id) references auth.users(id);
alter table public.notifications add constraint notifications_user_fk foreign key(user_id) references auth.users(id) on delete cascade;

alter table public.credit_applications add constraint applications_amount_positive check(requested_amount>0);
alter table public.loans add constraint loans_amounts_nonnegative check(sale_price>=0 and down_payment>=0 and principal>=0 and interest_rate>=0 and installment_count>0);
alter table public.installments add constraint installments_amounts_valid check(sequence>0 and amount_due>0 and amount_paid>=0);
alter table public.payments add constraint payments_amount_positive check(amount>0), add constraint payments_currency_dop check(currency='DOP');
alter table public.payment_allocations add constraint allocations_amount_positive check(amount>0);
alter table public.ledger_entries add constraint ledger_entries_nonzero check(amount<>0);
insert into public.roles(key,name) values
 ('platform_admin','Superadministrador de plataforma'),('tenant_admin','Administrador de empresa'),
 ('branch_manager','Gerente de sucursal'),('sales','Vendedor'),('cashier','Cajero'),('collections','Encargado de cobros'),('auditor','Auditor');
insert into public.permissions(key,description) values
 ('customers.read','Consultar clientes'),('customers.write','Crear y actualizar clientes'),
 ('financing.read','Consultar financiamientos'),('financing.write','Crear y actualizar financiamientos'),('financing.approve','Aprobar solicitudes'),
 ('payments.read','Consultar pagos'),('payments.record','Registrar pagos'),('devices.read','Consultar dispositivos'),('devices.write','Administrar dispositivos'),
 ('mdm.command','Solicitar comandos MDM'),('reports.read','Consultar reportes'),('tenant.manage','Administrar empresa y usuarios'),
 ('audit.read','Consultar bitácora de auditoría'),('branches.read','Consultar sucursales'),('branches.manage','Administrar sucursales'),('settings.manage','Administrar configuración');
insert into public.role_permissions(role_id,permission_id)
 select r.id,p.id from public.roles r cross join public.permissions p where r.key='tenant_admin'
 or (r.key='branch_manager' and p.key in ('customers.read','customers.write','financing.read','financing.write','financing.approve','payments.read','payments.record','devices.read','devices.write','reports.read','branches.read','branches.manage'))
 or (r.key='sales' and p.key in ('customers.read','customers.write','financing.read','financing.write','devices.read','devices.write'))
 or (r.key='cashier' and p.key in ('customers.read','financing.read','payments.read','payments.record'))
 or (r.key='collections' and p.key in ('customers.read','financing.read','payments.read','payments.record','reports.read'))
 or (r.key='auditor' and p.key in ('customers.read','financing.read','payments.read','devices.read','reports.read','audit.read','branches.read'));

alter table public.tenants enable row level security;
alter table public.roles enable row level security;
alter table public.permissions enable row level security;
alter table public.role_permissions enable row level security;
alter table public.tenant_memberships enable row level security;
alter table public.branches enable row level security;
alter table public.customers enable row level security;
alter table public.customer_documents enable row level security;
alter table public.devices enable row level security;
alter table public.mdm_providers enable row level security;
alter table public.credit_applications enable row level security;
alter table public.credit_contracts enable row level security;
alter table public.loans enable row level security;
alter table public.installments enable row level security;
alter table public.payments enable row level security;
alter table public.payment_allocations enable row level security;
alter table public.ledger_accounts enable row level security;
alter table public.ledger_entries enable row level security;
alter table public.mdm_commands enable row level security;
alter table public.tenant_settings enable row level security;
alter table public.notifications enable row level security;
alter table public.audit_logs enable row level security;

grant select on public.tenants,public.roles,public.permissions,public.role_permissions,public.tenant_memberships,
 public.branches,public.customers,public.customer_documents,public.devices,public.mdm_providers,public.credit_applications,
 public.credit_contracts,public.loans,public.installments,public.payments,public.payment_allocations,public.ledger_accounts,
 public.ledger_entries,public.mdm_commands,public.tenant_settings,public.notifications,public.audit_logs to authenticated;
grant insert,update,delete on public.branches,public.customers,public.customer_documents,public.devices,public.mdm_providers,
 public.credit_applications,public.credit_contracts,public.loans,public.installments,public.payment_allocations,
 public.ledger_accounts,public.tenant_settings to authenticated;
grant insert on public.payments,public.ledger_entries,public.mdm_commands,public.audit_logs to authenticated;
grant update on public.notifications to authenticated;

create schema if not exists app_private;
grant usage on schema app_private to authenticated;
create or replace function app_private.has_tenant_permission(p_tenant_id uuid,p_permission_key text)
returns boolean language sql stable security invoker set search_path = '' as $$
 select exists(select 1 from public.tenant_memberships m
  join public.roles r on r.key=m.role join public.role_permissions rp on rp.role_id=r.id
  join public.permissions p on p.id=rp.permission_id
  where m.tenant_id=p_tenant_id and m.user_id=(select auth.uid()) and m.status='active' and p.key=p_permission_key)
$$;
revoke all on function app_private.has_tenant_permission(uuid,text) from public;
grant execute on function app_private.has_tenant_permission(uuid,text) to authenticated;

create policy memberships_select_self on public.tenant_memberships for select to authenticated using(user_id=(select auth.uid()));
create policy tenants_select_members on public.tenants for select to authenticated
 using(exists(select 1 from public.tenant_memberships m where m.tenant_id=tenants.id and m.user_id=(select auth.uid()) and m.status='active'));
create policy roles_select_auth on public.roles for select to authenticated using(true);
create policy permissions_select_auth on public.permissions for select to authenticated using(true);
create policy role_permissions_select_auth on public.role_permissions for select to authenticated using(true);

do $$
declare r record;
begin
 for r in select * from (values
  ('branches','branches.read'),('customers','customers.read'),('customer_documents','customers.read'),('devices','devices.read'),
  ('mdm_providers','tenant.manage'),('credit_applications','financing.read'),('credit_contracts','financing.read'),('loans','financing.read'),
  ('installments','financing.read'),('payments','payments.read'),('payment_allocations','payments.read'),('ledger_accounts','tenant.manage'),
  ('ledger_entries','payments.read'),('mdm_commands','mdm.command'),('tenant_settings','settings.manage')
 ) as v(table_name,permission_key) loop
  execute format('create policy %I on public.%I for select to authenticated using(app_private.has_tenant_permission(%I.tenant_id,%L))',r.table_name||'_permission_select',r.table_name,r.table_name,r.permission_key);
 end loop;
end $$;

create policy branches_permission_write on public.branches for all to authenticated
 using(app_private.has_tenant_permission(branches.tenant_id,'branches.manage')) with check(app_private.has_tenant_permission(branches.tenant_id,'branches.manage'));
create policy customers_permission_write on public.customers for all to authenticated
 using(app_private.has_tenant_permission(customers.tenant_id,'customers.write')) with check(app_private.has_tenant_permission(customers.tenant_id,'customers.write'));
create policy customer_documents_permission_write on public.customer_documents for all to authenticated
 using(app_private.has_tenant_permission(customer_documents.tenant_id,'customers.write')) with check(app_private.has_tenant_permission(customer_documents.tenant_id,'customers.write'));
create policy devices_permission_write on public.devices for all to authenticated
 using(app_private.has_tenant_permission(devices.tenant_id,'devices.write')) with check(app_private.has_tenant_permission(devices.tenant_id,'devices.write'));
create policy mdm_providers_permission_write on public.mdm_providers for all to authenticated
 using(app_private.has_tenant_permission(mdm_providers.tenant_id,'tenant.manage')) with check(app_private.has_tenant_permission(mdm_providers.tenant_id,'tenant.manage'));
create policy applications_permission_write on public.credit_applications for all to authenticated
 using(app_private.has_tenant_permission(credit_applications.tenant_id,'financing.write')) with check(app_private.has_tenant_permission(credit_applications.tenant_id,'financing.write'));
create policy contracts_permission_write on public.credit_contracts for all to authenticated
 using(app_private.has_tenant_permission(credit_contracts.tenant_id,'financing.write')) with check(app_private.has_tenant_permission(credit_contracts.tenant_id,'financing.write'));
create policy loans_permission_write on public.loans for all to authenticated
 using(app_private.has_tenant_permission(loans.tenant_id,'financing.write')) with check(app_private.has_tenant_permission(loans.tenant_id,'financing.write'));
create policy installments_permission_write on public.installments for all to authenticated
 using(app_private.has_tenant_permission(installments.tenant_id,'financing.write')) with check(app_private.has_tenant_permission(installments.tenant_id,'financing.write'));
create policy payments_permission_insert on public.payments for insert to authenticated
 with check(received_by=(select auth.uid()) and app_private.has_tenant_permission(payments.tenant_id,'payments.record'));
create policy allocations_permission_insert on public.payment_allocations for insert to authenticated
 with check(app_private.has_tenant_permission(payment_allocations.tenant_id,'payments.record'));
create policy ledger_accounts_permission_write on public.ledger_accounts for all to authenticated
 using(app_private.has_tenant_permission(ledger_accounts.tenant_id,'tenant.manage')) with check(app_private.has_tenant_permission(ledger_accounts.tenant_id,'tenant.manage'));
create policy ledger_entries_append_only on public.ledger_entries for insert to authenticated
 with check(created_by=(select auth.uid()) and app_private.has_tenant_permission(ledger_entries.tenant_id,'payments.record'));
create policy mdm_commands_confirmed_insert on public.mdm_commands for insert to authenticated
 with check(requested_by=(select auth.uid()) and confirmation_at is not null and app_private.has_tenant_permission(mdm_commands.tenant_id,'mdm.command'));
create policy tenant_settings_permission_write on public.tenant_settings for all to authenticated
 using(app_private.has_tenant_permission(tenant_settings.tenant_id,'settings.manage')) with check(app_private.has_tenant_permission(tenant_settings.tenant_id,'settings.manage'));
create policy notifications_own on public.notifications for all to authenticated
 using(user_id=(select auth.uid()) and exists(select 1 from public.tenant_memberships m where m.tenant_id=notifications.tenant_id and m.user_id=(select auth.uid()) and m.status='active'))
 with check(user_id=(select auth.uid()) and exists(select 1 from public.tenant_memberships m where m.tenant_id=notifications.tenant_id and m.user_id=(select auth.uid()) and m.status='active'));
create policy audit_logs_insert_self on public.audit_logs for insert to authenticated
 with check(actor_id=(select auth.uid()) and (tenant_id is null or exists(select 1 from public.tenant_memberships m where m.tenant_id=audit_logs.tenant_id and m.user_id=(select auth.uid()) and m.status='active')));
create policy audit_logs_read_privileged on public.audit_logs for select to authenticated
 using(app_private.has_tenant_permission(audit_logs.tenant_id,'audit.read'));

-- No update/delete grants on payments or ledger entries. Use compensating records for reversals.
-- Atomic posting and allocation in a single transaction/RPC remains a phase 3 requirement.
