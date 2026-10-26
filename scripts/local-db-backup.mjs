import { spawn, spawnSync } from "node:child_process";
import { createReadStream, createWriteStream, promises as fs } from "node:fs";
import { randomBytes, randomUUID, createCipheriv, createDecipheriv } from "node:crypto";
import { dirname, resolve } from "node:path";
import { pipeline } from "node:stream/promises";
import { Writable } from "node:stream";
import postgres from "postgres";

const WSL = "wsl.exe";
const WSL_DISTRO = "Ubuntu-24.04";
const WSL_TOOL_ROOT = "/root/.supabase/cache/stack/slim-services/postgres";
const WSL_SUPABASE = "/root/.supabase/bin/supabase";
const HEADER = Buffer.from("KMAXBKP1");
const IV_BYTES = 12;
const TAG_BYTES = 16;

function readLocalConfig() {
  const source = fs.readFile(resolve(".env.local"), "utf8");
  return source.then((contents) => {
    const line = contents.split(/\r?\n/).find((entry) => /^DATABASE_URL=/.test(entry));
    if (!line) throw new Error("DATABASE_URL no está configurada en .env.local.");
    const raw = line.slice("DATABASE_URL=".length).trim().replace(/^['"]|['"]$/g, "");
    const url = new URL(raw);
    if (!new Set(["127.0.0.1", "localhost", "::1"]).has(url.hostname)) {
      throw new Error("El respaldo/restauración solo acepta DATABASE_URL local.");
    }
    if (url.pathname !== "/postgres") throw new Error("La base local debe llamarse postgres.");
    return {
      host: url.hostname,
      port: url.port || "5432",
      database: decodeURIComponent(url.pathname.slice(1)),
      username: decodeURIComponent(url.username),
      password: decodeURIComponent(url.password),
    };
  });
}

function readKey() {
  const encoded = process.env.KREDIMAX_BACKUP_KEY;
  if (!encoded || !/^[a-fA-F0-9]{64}$/.test(encoded)) {
    throw new Error("Define KREDIMAX_BACKUP_KEY como una clave hexadecimal de 64 caracteres (32 bytes). No se genera ni guarda automáticamente.");
  }
  return Buffer.from(encoded, "hex");
}

function wsl(args, options = {}) {
  return spawn(WSL, ["-d", WSL_DISTRO, "-u", "root", "--", ...args], {
    stdio: [options.stdin ? "pipe" : "ignore", options.stdout ? "pipe" : "ignore", options.stderr ? "pipe" : "ignore"],
    windowsHide: true,
  });
}

function waitForExit(child, label) {
  return new Promise((resolvePromise, reject) => {
    child.once("error", () => reject(new Error(`${label}: no se pudo iniciar WSL.`)));
    child.once("close", (code) => code === 0
      ? resolvePromise()
      : reject(new Error(`${label}: el proceso local terminó con código ${code ?? "desconocido"}.`)));
  });
}

function findPgTool(name) {
  const script = `find ${WSL_TOOL_ROOT} -type f -path '*/bin/${name}' -print -quit`;
  const result = spawnSync(WSL, ["-d", WSL_DISTRO, "-u", "root", "--", "bash", "-lc", script], {
    encoding: "utf8", windowsHide: true,
  });
  if (result.status !== 0) throw new Error(`No se pudo localizar ${name} en el runtime local de Supabase.`);
  const path = result.stdout.trim();
  if (!path.startsWith(`${WSL_TOOL_ROOT}/`) || !path.endsWith(`/bin/${name}`)) {
    throw new Error(`El ejecutable ${name} no está disponible en el runtime local de Supabase.`);
  }
  return path;
}

function wslProjectPath() {
  const cwd = resolve(".");
  const match = /^([A-Za-z]):\\(.*)$/.exec(cwd);
  if (!match) throw new Error("No se pudo convertir el proyecto a la ruta de WSL.");
  return `/mnt/${match[1].toLowerCase()}/${match[2].replaceAll("\\", "/")}`;
}

function localSupabaseAdminConfig(databaseConfig) {
  const result = spawnSync(WSL, ["-d", WSL_DISTRO, "-u", "root", "--", WSL_SUPABASE,
    "--experimental", "--workdir", wslProjectPath(), "db", "dump", "--local", "--dry-run"], {
    encoding: "utf8", windowsHide: true, maxBuffer: 2 * 1024 * 1024,
  });
  if (result.status !== 0) throw new Error("No se pudieron leer las credenciales locales del Supabase CLI para el respaldo.");
  function exported(name) {
    const match = new RegExp(`^export ${name}=\"([^\"]*)\"$`, "m").exec(result.stdout);
    if (!match) throw new Error(`El Supabase CLI no exportó ${name} para el respaldo local.`);
    return match[1];
  }
  const host = exported("PGHOST");
  const port = exported("PGPORT");
  const username = exported("PGUSER");
  const password = exported("PGPASSWORD");
  if (host !== databaseConfig.host || port !== databaseConfig.port || username !== "supabase_admin") {
    throw new Error("El usuario privilegiado del dump no coincide con el Supabase local previsto.");
  }
  return { ...databaseConfig, username, password };
}

function pgpassEscape(value) {
  return value.replaceAll("\\", "\\\\").replaceAll(":", "\\:").replaceAll("\n", "").replaceAll("\r", "");
}

async function withPgPass(config, run, passwordDatabase = config.database) {
  const pgpass = `/tmp/kredimax-${randomUUID()}.pgpass`;
  const entry = [config.host, config.port, passwordDatabase, config.username, config.password].map(pgpassEscape).join(":") + "\n";
  const install = wsl(["install", "-m", "600", "/dev/stdin", pgpass], { stdin: true });
  install.stdin.end(entry);
  await waitForExit(install, "Creación del archivo temporal de autenticación");
  const env = [
    `PGPASSFILE=${pgpass}`,
    `PGHOST=${config.host}`,
    `PGPORT=${config.port}`,
    `PGUSER=${config.username}`,
    `PGDATABASE=${config.database}`,
  ];
  try {
    return await run(env);
  } finally {
    const cleanup = wsl(["rm", "-f", pgpass]);
    await waitForExit(cleanup, "Limpieza del archivo temporal de autenticación");
  }
}

function openEncryptedStream(path, key) {
  return fs.stat(path).then(async (stat) => {
    if (stat.size < HEADER.length + IV_BYTES + TAG_BYTES) throw new Error("El archivo de respaldo está incompleto.");
    const handle = await fs.open(path, "r");
    try {
      const header = Buffer.alloc(HEADER.length + IV_BYTES);
      const tag = Buffer.alloc(TAG_BYTES);
      await handle.read(header, 0, header.length, 0);
      await handle.read(tag, 0, tag.length, stat.size - TAG_BYTES);
      if (!header.subarray(0, HEADER.length).equals(HEADER)) throw new Error("El formato del respaldo no es compatible.");
      const decipher = createDecipheriv("aes-256-gcm", key, header.subarray(HEADER.length));
      decipher.setAuthTag(tag);
      return {
        decipher,
        ciphertext: createReadStream(path, { start: header.length, end: stat.size - TAG_BYTES - 1 }),
      };
    } finally {
      await handle.close();
    }
  });
}

async function verifyEncryptedFile(path, key) {
  const { decipher, ciphertext } = await openEncryptedStream(path, key);
  await pipeline(ciphertext, decipher, new Writable({ write(_chunk, _encoding, callback) { callback(); } }));
}

async function decryptInto(path, key, destination) {
  const { decipher, ciphertext } = await openEncryptedStream(path, key);
  await pipeline(ciphertext, decipher, destination);
}

async function verifyRestoredDatabase(config, database) {
  const client = postgres({
    host: config.host,
    port: Number(config.port),
    username: config.username,
    password: config.password,
    database,
    max: 1,
    prepare: false,
  });
  try {
    const [state] = await client`SELECT
      to_regclass('public.tenants') IS NOT NULL AS tenants_table,
      to_regclass('public.loans') IS NOT NULL AS loans_table,
      to_regclass('public.payments') IS NOT NULL AS payments_table,
      to_regclass('auth.users') IS NOT NULL AS auth_users_table,
      to_regclass('drizzle.__drizzle_migrations') IS NOT NULL AS migrations_table,
      (SELECT count(*) FROM drizzle.__drizzle_migrations) AS migration_count,
      (SELECT count(*) FROM public.tenants) AS tenant_count,
      (SELECT count(*) FROM public.loans) AS loan_count,
      (SELECT count(*) FROM public.payments) AS payment_count`;
    if (!state.tenants_table || !state.loans_table || !state.payments_table || !state.auth_users_table
      || !state.migrations_table || Number(state.migration_count) < 1
      || [state.tenant_count, state.loan_count, state.payment_count].some((count) => !/^\d+$/.test(String(count)))) {
      throw new Error("La base restaurada no contiene el esquema/historial KrediMax esperado.");
    }
  } finally {
    await client.end({ timeout: 5 });
  }
}

async function backup(outputPath, config, key) {
  const destination = resolve(outputPath);
  await fs.mkdir(dirname(destination), { recursive: true });
  const dumpPath = findPgTool("pg_dump");
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const file = createWriteStream(destination, { flags: "wx", mode: 0o600 });
  try {
    await withPgPass(config, async (env) => {
      const dump = wsl(["env", ...env, dumpPath, "--format=custom", "--no-owner", "--no-acl", "--dbname=postgres"], { stdout: true });
      const exit = waitForExit(dump, "pg_dump local");
      file.write(Buffer.concat([HEADER, iv]));
      await Promise.all([pipeline(dump.stdout, cipher, file), exit]);
      await fs.appendFile(destination, cipher.getAuthTag());
    });
  } catch (error) {
    file.destroy();
    await fs.rm(destination, { force: true });
    throw error;
  }
}

function targetDatabase(value) {
  if (!/^kredimax_restore_[a-z0-9_]{1,40}$/.test(value)) {
    throw new Error("El destino debe ser una base nueva local con nombre kredimax_restore_<identificador>.");
  }
  return value;
}

async function restore(archivePath, requestedTarget, config, key) {
  const source = resolve(archivePath);
  const target = targetDatabase(requestedTarget);
  await verifyEncryptedFile(source, key);
  const createdb = findPgTool("createdb");
  const pgRestore = findPgTool("pg_restore");
  const dropdb = findPgTool("dropdb");
  const plaintextDump = `/tmp/kredimax-restore-${randomUUID()}.dump`;
  let created = false;

  await withPgPass(config, async (env) => {
    const create = wsl(["env", ...env, createdb, "--template=template0", target]);
    await waitForExit(create, "Creación del destino vacío de restauración");
    created = true;
    try {
      const stage = wsl(["install", "-m", "600", "/dev/stdin", plaintextDump], { stdin: true });
      await Promise.all([
        decryptInto(source, key, stage.stdin),
        waitForExit(stage, "Preparación cifrada del archivo temporal dentro de WSL"),
      ]);
      const restoreProcess = wsl(["env", ...env.map((entry) => entry.replace(`PGDATABASE=${config.database}`, `PGDATABASE=${target}`)),
        pgRestore, "--no-owner", "--no-acl", "--exit-on-error", "--single-transaction", `--dbname=${target}`, plaintextDump], { stderr: true });
      let restoreErrors = "";
      restoreProcess.stderr.setEncoding("utf8");
      restoreProcess.stderr.on("data", (chunk) => { restoreErrors = (restoreErrors + chunk).slice(-12000); });
      try {
        await waitForExit(restoreProcess, "Restauración local verificada");
        await verifyRestoredDatabase(config, target);
      } catch (error) {
        const detail = restoreErrors.trim();
        throw new Error(detail ? `${error instanceof Error ? error.message : "Falló la restauración local."}\n${detail}` : error instanceof Error ? error.message : "Falló la restauración local.");
      }
    } catch (error) {
      if (created) {
        const drop = wsl(["env", ...env, dropdb, "--if-exists", target]);
        await waitForExit(drop, "Eliminación del destino temporal creado por esta restauración");
        created = false;
      }
      throw error;
    } finally {
      const removeDump = wsl(["rm", "-f", plaintextDump]);
      await waitForExit(removeDump, "Limpieza del archivo PostgreSQL temporal");
    }
  }, "*");
  return target;
}

async function dropRestoreDatabase(requestedTarget, config) {
  const target = targetDatabase(requestedTarget);
  const dropdb = findPgTool("dropdb");
  await withPgPass(config, async (env) => {
    const drop = wsl(["env", ...env, dropdb, "--if-exists", "--force", target]);
    await waitForExit(drop, "Eliminación de la base restaurada local");
  }, "*");
}

async function main() {
  const [operation, ...args] = process.argv.slice(2);
  if (!new Set(["backup", "restore", "drop-restore"]).has(operation)) {
    throw new Error("Uso: node scripts/local-db-backup.mjs backup <archivo.kmax.enc> | restore <archivo.kmax.enc> <kredimax_restore_id> | drop-restore <kredimax_restore_id>");
  }
  const key = operation === "drop-restore" ? null : readKey();
  try {
    const config = localSupabaseAdminConfig(await readLocalConfig());
    if (operation === "backup") {
      if (args.length !== 1) throw new Error("Indica la ruta de salida del respaldo cifrado.");
      await backup(args[0], config, key);
      process.stdout.write(`Respaldo cifrado local creado: ${resolve(args[0])}\n`);
      return;
    }
    if (operation === "drop-restore") {
      if (args.length !== 1) throw new Error("Indica el nombre exacto de una base con prefijo kredimax_restore_.");
      await dropRestoreDatabase(args[0], config);
      process.stdout.write(`Base restaurada local eliminada: ${args[0]}\n`);
      return;
    }
    if (args.length !== 2) throw new Error("Indica el archivo cifrado y un nombre de base local nuevo para restaurar.");
    const target = await restore(args[0], args[1], config, key);
    process.stdout.write(`Restauración local validada en una base nueva: ${target}. La base activa no fue reemplazada.\n`);
  } finally {
    key?.fill(0);
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : "Falló la operación local de respaldo."}\n`);
  process.exitCode = 1;
});
