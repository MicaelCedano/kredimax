import { spawnSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { open, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const script = fileURLToPath(new URL("./local-db-backup.mjs", import.meta.url));
const keyBytes = randomBytes(32);
const wrongKeyBytes = randomBytes(32);
const correctKey = keyBytes.toString("hex");
const wrongKey = wrongKeyBytes.toString("hex");
const archive = join(tmpdir(), `kredimax-verify-${randomUUID()}.kmax.enc`);
const target = `kredimax_restore_test_${randomUUID().replaceAll("-", "")}`;
const rejectedTarget = `kredimax_restore_test_${randomUUID().replaceAll("-", "")}`;
let targetCreated = false;

function run(args, key) {
  const result = spawnSync(process.execPath, [script, ...args], {
    cwd: process.cwd(),
    env: { ...process.env, ...(key ? { KREDIMAX_BACKUP_KEY: key } : {}) },
    encoding: "utf8",
    windowsHide: true,
    maxBuffer: 1024 * 1024,
  });
  return result;
}

async function assertEncryptedHeader() {
  const handle = await open(archive, "r");
  try {
    const stat = await handle.stat();
    const header = Buffer.alloc(8);
    await handle.read(header, 0, header.length, 0);
    if (stat.size <= 36 || header.toString("ascii") !== "KMAXBKP1") {
      throw new Error("The local backup did not produce a complete encrypted archive.");
    }
  } finally {
    await handle.close();
  }
}

async function main() {
  try {
    const created = run(["backup", archive], correctKey);
    if (created.status !== 0) throw new Error("The local encrypted backup command failed.");
    await assertEncryptedHeader();

    const rejected = run(["restore", archive, rejectedTarget], wrongKey);
    if (rejected.status === 0) throw new Error("The backup restore accepted an incorrect encryption key.");

    const restored = run(["restore", archive, target], correctKey);
    if (restored.status !== 0) {
      throw new Error("The backup did not restore and validate a new local database.");
    }
    targetCreated = true;
    if (!restored.stdout.includes("Restauración local validada")) {
      throw new Error("The restore command returned without its post-restore validation result.");
    }

    const dropped = run(["drop-restore", target]);
    if (dropped.status !== 0) throw new Error("The restored test database could not be removed safely.");
    targetCreated = false;
    process.stdout.write("Encrypted backup test passed: wrong key rejected, local restore validated, test database dropped.\n");
  } finally {
    try {
      if (targetCreated) {
        const cleanup = run(["drop-restore", target]);
        if (cleanup.status !== 0) throw new Error("The test failed and its temporary restored database could not be cleaned up.");
      }
    } finally {
      await rm(archive, { force: true });
      keyBytes.fill(0);
      wrongKeyBytes.fill(0);
    }
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : "The local backup test failed."}\n`);
  process.exitCode = 1;
});
