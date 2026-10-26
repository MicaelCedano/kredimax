import { readFileSync } from "node:fs";
import postgres from "postgres";
import { planMigrations } from "./migration-plan.mjs";

const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const line = env.split(/\r?\n/).find((entry) => /^DATABASE_URL=/.test(entry));
if (!line) throw new Error("DATABASE_URL is required for local migrations.");
const connectionString = line.slice("DATABASE_URL=".length).trim().replace(/^['"]|['"]$/g, "");
const databaseUrl = new URL(connectionString);
if (!new Set(["127.0.0.1", "localhost"]).has(databaseUrl.hostname)) {
  throw new Error("Refusing to migrate a non-local database with this command.");
}

const journal = JSON.parse(readFileSync(new URL("../drizzle/meta/_journal.json", import.meta.url), "utf8"));
const sql = postgres(connectionString, { max: 1, prepare: false });
try {
  await sql`create schema if not exists drizzle`;
  await sql`create table if not exists drizzle.__drizzle_migrations (
    id serial primary key, hash text not null, created_at bigint
  )`;
  const applied = await sql`select id,hash,created_at::text as created_at from drizzle.__drizzle_migrations order by id`;
  const plan = planMigrations(journal.entries, applied, (entry) =>
    readFileSync(new URL(`../drizzle/${entry.tag}.sql`, import.meta.url), "utf8"));

  for (const drift of plan.sourceDrift) {
    process.stderr.write(`Warning: ${drift.tag} is recorded as applied, but its local SQL source has changed; it will not be replayed.\n`);
  }

  for (const migration of plan.pending) {
    const { entry, source, hash } = migration;
    const statements = source.split("--> statement-breakpoint").map((statement) => statement.trim()).filter(Boolean);
    await sql.begin(async (transaction) => {
      await transaction`select pg_advisory_xact_lock(hashtext('kredimax-drizzle-migrations'))`;
      for (const statement of statements) await transaction.unsafe(statement).simple();
      await transaction`insert into drizzle.__drizzle_migrations(hash,created_at) values(${hash},${entry.when})`;
    });
    process.stdout.write(`Applied ${entry.tag}.\n`);
  }
  await sql`notify pgrst, 'reload schema'`;
  if (!plan.pending.length) process.stdout.write("No pending local migrations.\n");
} finally {
  await sql.end({ timeout: 5 });
}
