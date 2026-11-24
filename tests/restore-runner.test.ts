import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { promises as fs } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { encryptFile } from "../src/lib/backups/crypto";

describe("KrediMax Restore CLI (scripts/restore-backup.mjs)", () => {
  const testKeyHex = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
  const scriptPath = join(process.cwd(), "scripts/restore-backup.mjs");

  it("verifies and decrypts an encrypted backup file using CLI", async () => {
    const tempDir = join(tmpdir(), `kredimax-cli-test-${Date.now()}`);
    await fs.mkdir(tempDir, { recursive: true });

    try {
      const plaintext = "-- SQL DUMP KREDIMAX AUDITED RESTORE TEST --";
      const rawFile = join(tempDir, "source.sql");
      const encFile = join(tempDir, "archive.dump.kmax.enc");
      const decFile = join(tempDir, "restored.sql");

      await fs.writeFile(rawFile, plaintext, "utf8");
      await encryptFile(rawFile, encFile, Buffer.from(testKeyHex, "hex"));

      // 1. Run verify command
      const verifyRun = spawnSync("node", [scriptPath, "verify", encFile], {
        encoding: "utf8",
        env: { ...process.env, KREDIMAX_BACKUP_KEY: testKeyHex },
      });
      expect(verifyRun.status).toBe(0);
      expect(verifyRun.stdout).toContain("Integridad criptográfica AES-256-GCM verificada exitosamente");

      // 2. Run decrypt command
      const decryptRun = spawnSync("node", [scriptPath, "decrypt", encFile, decFile], {
        encoding: "utf8",
        env: { ...process.env, KREDIMAX_BACKUP_KEY: testKeyHex },
      });
      expect(decryptRun.status).toBe(0);
      expect(decryptRun.stdout).toContain("Archivo descifrado exitosamente");

      const decryptedContent = await fs.readFile(decFile, "utf8");
      expect(decryptedContent).toBe(plaintext);
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  it("strictly blocks restoring to production DATABASE_URL without confirmation override flag", async () => {
    const tempDir = join(tmpdir(), `kredimax-safety-test-${Date.now()}`);
    await fs.mkdir(tempDir, { recursive: true });

    try {
      const encFile = join(tempDir, "archive.dump.kmax.enc");
      await fs.writeFile(encFile, "dummy", "utf8");

      const fakeProdUrl = "postgresql://postgres:pass@aws.supabase.com:5432/postgres";
      const blockedRun = spawnSync("node", [scriptPath, "restore", encFile, fakeProdUrl], {
        encoding: "utf8",
        env: {
          ...process.env,
          DATABASE_URL: fakeProdUrl,
          KREDIMAX_BACKUP_KEY: testKeyHex,
        },
      });

      expect(blockedRun.status).toBe(1);
      expect(blockedRun.stderr).toContain("SEGURIDAD: Se denegó la restauración directa sobre la base de producción");
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });
});
