import { createHash } from "node:crypto";

export function planMigrations(entries, appliedRows, loadSource) {
  const migrations = entries.map((entry, index) => {
    const source = loadSource(entry);
    return {
      entry,
      index,
      source,
      hash: createHash("sha256").update(source).digest("hex"),
    };
  });
  const byHash = new Map();
  const byCreatedAt = new Map();

  for (const migration of migrations) {
    if (byHash.has(migration.hash)) throw new Error(`Duplicate migration SQL hash at ${migration.entry.tag}.`);
    byHash.set(migration.hash, migration);

    const createdAt = String(migration.entry.when);
    if (byCreatedAt.has(createdAt)) throw new Error(`Duplicate migration timestamp at ${migration.entry.tag}.`);
    byCreatedAt.set(createdAt, migration);
  }

  const sourceDrift = [];
  for (const [position, applied] of appliedRows.entries()) {
    const hashMatch = byHash.get(applied.hash);
    const timestampMatch = byCreatedAt.get(String(applied.created_at));
    if (hashMatch && timestampMatch && hashMatch.index !== timestampMatch.index) {
      throw new Error(`Applied migration row ${applied.id} has a hash/timestamp mismatch.`);
    }

    const migration = hashMatch ?? timestampMatch;
    if (!migration) {
      throw new Error(`Applied migration row ${applied.id} does not match any current journal entry.`);
    }
    if (migration.index !== position) {
      throw new Error(`Applied migration order is inconsistent at row ${applied.id}: expected journal index ${position}, found ${migration.index}.`);
    }
    if (migration.hash !== applied.hash) {
      sourceDrift.push({ tag: migration.entry.tag, appliedHash: applied.hash, currentHash: migration.hash });
    }
  }

  if (appliedRows.length > migrations.length) throw new Error("The database contains more applied migrations than the current journal.");

  return { pending: migrations.slice(appliedRows.length), sourceDrift };
}
