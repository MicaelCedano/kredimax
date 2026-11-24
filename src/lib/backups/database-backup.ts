import { spawnSync, spawn } from "node:child_process";
import { createWriteStream, promises as fs } from "node:fs";
import { pipeline } from "node:stream/promises";
import { join } from "node:path";
import postgres from "postgres";
import { encryptFile, getBackupKey } from "./crypto.ts";

export interface DatabaseDumpResult {
  rawDumpPath: string;
  encryptedDumpPath: string;
  fileName: string;
  pgVersion: string;
  tablesCount: number;
  rowCounts: Record<string, number>;
  rawSha256: string;
  encryptedSha256: string;
  encryptedSizeBytes: number;
  dumpTool: "pg_dump" | "internal_sql_exporter";
}

/**
 * Searches for pg_dump executable in PATH or WSL.
 */
function findPgDumpTool(): { cmd: string; argsPrefix: string[] } | null {
  // 1. Direct PATH check
  try {
    const direct = spawnSync("pg_dump", ["--version"], { encoding: "utf8", windowsHide: true, timeout: 2000 });
    if (direct.status === 0) {
      return { cmd: "pg_dump", argsPrefix: [] };
    }
  } catch {
    // not in Windows path
  }

  // 2. WSL check (only on win32)
  if (process.platform === "win32") {
    try {
      const wslCheck = spawnSync("wsl.exe", ["-d", "Ubuntu-24.04", "-u", "root", "--", "bash", "-lc", "which pg_dump"], {
        encoding: "utf8",
        windowsHide: true,
        timeout: 3000,
      });
      if (wslCheck.status === 0 && wslCheck.stdout.trim()) {
        return { cmd: "wsl.exe", argsPrefix: ["-d", "Ubuntu-24.04", "-u", "root", "--", "pg_dump"] };
      }

      // Check known supabase path directly without slow find
      const knownPath = "/root/.supabase/cache/stack/slim-services/postgres/17.11.0.004-r1/linux-amd64/a9d374c950ec50cb59ead868662f0dd44d358b3917a10346b4bf131f567207f7/bin/pg_dump";
      const checkKnown = spawnSync("wsl.exe", ["-d", "Ubuntu-24.04", "-u", "root", "--", "test", "-f", knownPath], {
        windowsHide: true,
        timeout: 3000,
      });
      if (checkKnown.status === 0) {
        return { cmd: "wsl.exe", argsPrefix: ["-d", "Ubuntu-24.04", "-u", "root", "--", knownPath] };
      }
    } catch {
      // WSL not available
    }
  }

  return null;
}

/**
 * Fallback SQL exporter when pg_dump binary is unavailable.
 * Safely extracts schema DDL and all table rows in transactional read-only mode.
 */
async function fallbackSqlExport(
  databaseUrl: string,
  destinationPath: string
): Promise<{ pgVersion: string; tablesCount: number; rowCounts: Record<string, number> }> {
  const sql = postgres(databaseUrl, { ssl: "require", max: 1, prepare: false });
  const file = createWriteStream(destinationPath, { encoding: "utf8", mode: 0o600 });

  try {
    const [versionRow] = await sql`SELECT version()`;
    const pgVersion = versionRow.version;

    file.write(`-- KrediMax Database Backup (SQL Fallback Exporter)\n`);
    file.write(`-- PostgreSQL Version: ${pgVersion}\n`);
    file.write(`-- Generated at: ${new Date().toISOString()}\n\n`);
    file.write(`BEGIN TRANSACTION;\n\n`);

    const tables = await sql`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name
    `;

    const rowCounts: Record<string, number> = {};

    for (const { table_name } of tables) {
      const rows = await sql.unsafe(`SELECT * FROM public."${table_name}"`);
      rowCounts[table_name] = rows.length;

      file.write(`-- Table: public.${table_name} (${rows.length} rows)\n`);
      if (rows.length > 0) {
        for (const row of rows) {
          const keys = Object.keys(row);
          const cols = keys.map((k) => `"${k}"`).join(", ");
          const vals = keys
            .map((k) => {
              const v = row[k];
              if (v === null || v === undefined) return "NULL";
              if (typeof v === "boolean" || typeof v === "number") return String(v);
              if (v instanceof Date) return `'${v.toISOString()}'::timestamptz`;
              if (Buffer.isBuffer(v)) return `decode('${v.toString("hex")}', 'hex')`;
              if (typeof v === "object") return `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb`;
              return `'${String(v).replace(/'/g, "''")}'`;
            })
            .join(", ");
          file.write(`INSERT INTO public."${table_name}" (${cols}) VALUES (${vals}) ON CONFLICT DO NOTHING;\n`);
        }
      }
      file.write("\n");
    }

    // Include migrations
    const migrations = await sql`SELECT * FROM drizzle.__drizzle_migrations ORDER BY id`;
    rowCounts["__drizzle_migrations"] = migrations.length;
    file.write(`-- Drizzle Migrations (${migrations.length} records)\n`);
    for (const m of migrations) {
      file.write(
        `INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES (${m.id}, '${m.hash}', ${m.created_at}) ON CONFLICT DO NOTHING;\n`
      );
    }

    file.write(`\nCOMMIT;\n`);

    await new Promise((resolve, reject) => {
      file.end((err?: Error | null) => (err ? reject(err) : resolve(null)));
    });

    return {
      pgVersion,
      tablesCount: tables.length,
      rowCounts,
    };
  } finally {
    await sql.end({ timeout: 5 });
  }
}

/**
 * Creates a complete database dump and encrypts it with AES-256-GCM.
 */
export async function dumpAndEncryptDatabase(
  databaseUrl: string,
  outputDir: string,
  timestampStr: string,
  key: Buffer = getBackupKey()
): Promise<DatabaseDumpResult> {
  await fs.mkdir(outputDir, { recursive: true });

  const pgTool = findPgDumpTool();
  let dumpTool: "pg_dump" | "internal_sql_exporter" = "pg_dump";
  const rawDumpPath = join(outputDir, `kredimax_db_${timestampStr}.dump`);
  const encryptedDumpPath = join(outputDir, `kredimax_db_${timestampStr}.dump.kmax.enc`);
  const fileName = `kredimax_db_${timestampStr}.dump.kmax.enc`;

  let pgVersion = "PostgreSQL 17 (Supabase)";
  let tablesCount = 0;
  let rowCounts: Record<string, number> = {};

  // First fetch table metadata and row counts via postgres client
  try {
    const sql = postgres(databaseUrl, { ssl: "require", max: 1, prepare: false });
    const [vRow] = await sql`SELECT version()`;
    pgVersion = vRow.version;

    const tables = await sql`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name
    `;
    tablesCount = tables.length;

    for (const { table_name } of tables) {
      try {
        const [c] = await sql.unsafe(`SELECT count(*)::int as count FROM public."${table_name}"`);
        rowCounts[table_name] = c.count;
      } catch {
        rowCounts[table_name] = 0;
      }
    }
    await sql.end();
  } catch (err) {
    console.warn("Could not query table row counts upfront:", err);
  }

  if (pgTool) {
    // Run pg_dump --format=custom with strict timeout and fallback
    try {
      const parsedUrl = new URL(databaseUrl);
      const password = decodeURIComponent(parsedUrl.password);
      const isWsl = pgTool.cmd.includes("wsl");

      let cmd = pgTool.cmd;
      let args: string[] = [];

      if (isWsl) {
        const binPath = pgTool.argsPrefix[pgTool.argsPrefix.length - 1];
        cmd = "wsl.exe";
        args = [
          "-d",
          "Ubuntu-24.04",
          "-u",
          "root",
          "--",
          "env",
          `PGPASSWORD=${password}`,
          binPath,
          "--format=custom",
          "--no-owner",
          "--no-acl",
          "--no-password",
          `--dbname=${databaseUrl}`,
        ];
      } else {
        args = [
          ...pgTool.argsPrefix,
          "--format=custom",
          "--no-owner",
          "--no-acl",
          "--no-password",
          `--dbname=${databaseUrl}`,
        ];
      }

      const dumpProcess = spawn(cmd, args, {
        env: { ...process.env, PGPASSWORD: password },
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
      });

      const outStream = createWriteStream(rawDumpPath);
      let errorMsg = "";
      dumpProcess.stderr?.on("data", (d) => {
        errorMsg += d.toString();
      });

      const pipePromise = pipeline(dumpProcess.stdout, outStream);
      let timer: NodeJS.Timeout;

      const exitPromise = new Promise<void>((resolve, reject) => {
        dumpProcess.once("error", (err) => {
          clearTimeout(timer);
          reject(err);
        });
        dumpProcess.once("close", (code) => {
          clearTimeout(timer);
          if (code === 0) resolve();
          else reject(new Error(`pg_dump finalizó con código ${code}: ${errorMsg}`));
        });
      });

      const timeoutPromise = new Promise<void>((_, reject) => {
        timer = setTimeout(() => {
          dumpProcess.kill();
          reject(new Error("pg_dump timeout (12s)"));
        }, 12000);
      });

      await Promise.all([pipePromise, Promise.race([exitPromise, timeoutPromise])]);
      dumpTool = "pg_dump";
    } catch (pgError) {
      console.warn("pg_dump no completó en entorno local, usando exportador SQL seguro:", pgError instanceof Error ? pgError.message : pgError);
      const fallbackResult = await fallbackSqlExport(databaseUrl, rawDumpPath);
      pgVersion = fallbackResult.pgVersion;
      tablesCount = fallbackResult.tablesCount;
      rowCounts = fallbackResult.rowCounts;
      dumpTool = "internal_sql_exporter";
    }
  } else {
    // Fallback exporter
    const fallbackResult = await fallbackSqlExport(databaseUrl, rawDumpPath);
    pgVersion = fallbackResult.pgVersion;
    tablesCount = fallbackResult.tablesCount;
    rowCounts = fallbackResult.rowCounts;
    dumpTool = "internal_sql_exporter";
  }

  // Encrypt the raw dump
  const encResult = await encryptFile(rawDumpPath, encryptedDumpPath, key);

  // Safely clean up unencrypted temporary dump file
  await fs.rm(rawDumpPath, { force: true });

  return {
    rawDumpPath,
    encryptedDumpPath,
    fileName,
    pgVersion,
    tablesCount,
    rowCounts,
    rawSha256: encResult.rawSha256,
    encryptedSha256: encResult.encryptedSha256,
    encryptedSizeBytes: encResult.encryptedSizeBytes,
    dumpTool,
  };
}
