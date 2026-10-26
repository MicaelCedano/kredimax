import { readFileSync } from "node:fs";
import postgres from "postgres";

const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const line = env.split(/\r?\n/).find((entry) => /^DATABASE_URL=/.test(entry));
if (!line) throw new Error("DATABASE_URL is required for the local compatibility check.");

const connectionString = line.slice("DATABASE_URL=".length).trim().replace(/^['"]|['"]$/g, "");
const databaseUrl = new URL(connectionString);
if (!new Set(["127.0.0.1", "localhost"]).has(databaseUrl.hostname)) {
  throw new Error("Refusing to inspect a non-local database with this command.");
}

const sql = postgres(connectionString, { max: 1, prepare: false });

try {
  const [report] = await sql`
    SELECT
      (SELECT count(*)::int FROM (
        SELECT tenant_id,upper(regexp_replace(btrim(identity_number),'[^A-Za-z0-9]','','g')) AS normalized
        FROM public.customers
        WHERE nullif(regexp_replace(btrim(identity_number),'[^A-Za-z0-9]','','g'),'') IS NOT NULL
        GROUP BY tenant_id,upper(regexp_replace(btrim(identity_number),'[^A-Za-z0-9]','','g'))
        HAVING count(*)>1
      ) duplicates) AS duplicate_normalized_identity_groups,
      (SELECT count(*)::int FROM public.payment_allocations a
        LEFT JOIN public.payments p ON p.id=a.payment_id AND p.tenant_id=a.tenant_id
        LEFT JOIN public.installments i ON i.id=a.installment_id AND i.tenant_id=a.tenant_id
        WHERE p.id IS NULL OR i.id IS NULL OR p.loan_id<>i.loan_id) AS incompatible_payment_allocations,
      (SELECT count(*)::int FROM (
        SELECT a.tenant_id,a.payment_id,p.amount,sum(a.amount) AS allocated
        FROM public.payment_allocations a
        JOIN public.payments p ON p.id=a.payment_id AND p.tenant_id=a.tenant_id
        GROUP BY a.tenant_id,a.payment_id,p.amount
        HAVING sum(a.amount)>p.amount
      ) excess) AS payments_overallocated,
      (SELECT count(*)::int FROM (
        SELECT a.tenant_id,a.installment_id,i.amount_due,sum(a.amount) AS allocated
        FROM public.payment_allocations a
        JOIN public.payments p ON p.id=a.payment_id AND p.tenant_id=a.tenant_id
        JOIN public.installments i ON i.id=a.installment_id AND i.tenant_id=a.tenant_id
        WHERE (to_jsonb(p)->>'reversed_at') IS NULL
        GROUP BY a.tenant_id,a.installment_id,i.amount_due
        HAVING sum(a.amount)>i.amount_due
      ) excess) AS installments_overallocated,
      (SELECT count(*)::int FROM public.installments WHERE amount_paid<0 OR amount_paid>amount_due) AS installments_outside_amount_bounds,
      (SELECT count(*)::int FROM public.tenant_memberships m
        LEFT JOIN public.branches b ON b.id=m.branch_id AND b.tenant_id=m.tenant_id
        WHERE m.branch_id IS NOT NULL AND b.id IS NULL) AS memberships_with_incompatible_branch,
      (SELECT count(*)::int FROM public.tenant_memberships
        WHERE branch_id IS NULL AND role::text<>'tenant_admin' AND status='active') AS active_non_admin_central_memberships,
      (SELECT count(*)::int FROM (
        SELECT a.tenant_id,a.device_id
        FROM public.credit_applications a
        WHERE a.device_id IS NOT NULL AND a.branch_id IS NOT NULL
        GROUP BY a.tenant_id,a.device_id
        HAVING count(DISTINCT a.branch_id)>1
      ) ambiguous) AS ambiguous_device_branch_mappings,
      (SELECT count(*)::int FROM (
        SELECT e.tenant_id,e.metadata->>'loanId' AS loan_id
        FROM public.credit_application_events e
        JOIN public.credit_applications a ON a.tenant_id=e.tenant_id AND a.id=e.application_id
        WHERE (e.metadata->>'loanId') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          AND a.branch_id IS NOT NULL
        GROUP BY e.tenant_id,e.metadata->>'loanId'
        HAVING count(DISTINCT a.branch_id)>1
      ) ambiguous) AS ambiguous_loan_branch_mappings
  `;

  const issues = Object.entries(report).filter(([, count]) => Number(count) > 0);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (issues.length) {
    process.stderr.write(`Compatibility conflicts found: ${issues.map(([name, count]) => `${name}=${count}`).join(", ")}\n`);
    process.exitCode = 2;
  } else {
    process.stdout.write("No local compatibility conflicts detected. This does not inspect or authorize a hosted database.\n");
  }
} finally {
  await sql.end({ timeout: 5 });
}
