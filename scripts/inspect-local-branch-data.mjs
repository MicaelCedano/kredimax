import { readFileSync } from "node:fs";
import postgres from "postgres";

const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const line = env.split(/\r?\n/).find((entry) => /^DATABASE_URL=/.test(entry));
if (!line) throw new Error("DATABASE_URL is required for local branch inspection.");
const connectionString = line.slice("DATABASE_URL=".length).trim().replace(/^['"]|['"]$/g, "");
const databaseUrl = new URL(connectionString);
if (!new Set(["127.0.0.1", "localhost"]).has(databaseUrl.hostname)) {
  throw new Error("Refusing to inspect a non-local database with this script.");
}

const sql = postgres(connectionString, { max: 1, prepare: false });
try {
  const [tenants, financingSettings, missingFinancingSettings, branches, memberships, customers, applications, devices, loans, contracts, migrations, migrationColumns] = await Promise.all([
    sql`select count(*)::int as total from public.tenants`,
    sql`select count(*)::int as total,
      count(*) filter (where recovery_enabled)::int as recovery_enabled,
      count(*) filter (where not recovery_enabled)::int as recovery_disabled,
      count(*) filter (where allowed_terms <> ARRAY[3,5,6,8,12,18,24])::int as noncanonical_terms
      from public.financing_settings`,
    sql`select count(*)::int as total from public.tenants t where not exists (
      select 1 from public.financing_settings s where s.tenant_id=t.id)`,
    sql`select count(*)::int as total, count(distinct tenant_id)::int as tenants from public.branches`,
    sql`select count(*)::int as total, count(*) filter (where branch_id is null)::int as tenant_wide from public.tenant_memberships where status='active'`,
    sql`select count(*)::int as total, count(*) filter (where branch_id is null)::int as unassigned from public.customers`,
    sql`select count(*)::int as total, count(*) filter (where branch_id is null)::int as unassigned from public.credit_applications`,
    sql`select count(*)::int as total,
      count(*) filter (where map.branch_count=0)::int as unmapped,
      count(*) filter (where map.branch_count>1)::int as ambiguous
      from public.devices d left join lateral (
        select count(distinct a.branch_id)::int as branch_count from public.credit_applications a where a.tenant_id=d.tenant_id and a.device_id=d.id and a.branch_id is not null
      ) map on true`,
    sql`select count(*)::int as total,
      count(*) filter (where map.branch_count=0)::int as unmapped,
      count(*) filter (where map.branch_count>1)::int as ambiguous
      from public.loans l left join lateral (
        select count(distinct a.branch_id)::int as branch_count from public.credit_application_events e
        join public.credit_applications a on a.id=e.application_id and a.tenant_id=e.tenant_id
        where e.tenant_id=l.tenant_id and (e.metadata->>'loanId')::uuid=l.id and a.branch_id is not null
      ) map on true`,
    sql`select count(*)::int as total,
      count(*) filter (where l.id is null)::int as without_loan
      from public.credit_contracts c left join public.loans l on l.tenant_id=c.tenant_id and l.contract_id=c.id`,
    sql`select count(*)::int as total, max(created_at)::text as latest from drizzle.__drizzle_migrations`,
    sql`select column_name,data_type from information_schema.columns where table_schema='drizzle' and table_name='__drizzle_migrations' order by ordinal_position`,
  ]);
  console.log(JSON.stringify({ tenants: tenants[0], financingSettings: financingSettings[0], tenantsMissingFinancingSettings: missingFinancingSettings[0], branches: branches[0], activeMemberships: memberships[0], customers: customers[0], applications: applications[0], devices: devices[0], loans: loans[0], contracts: contracts[0], migrations: migrations[0], migrationColumns }, null, 2));
} finally {
  await sql.end({ timeout: 5 });
}
