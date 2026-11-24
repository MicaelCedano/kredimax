import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { promises as fs } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  decryptFile,
  encryptFile,
  getBackupKey,
  getKeyFingerprint,
  verifyEncryptedFile,
  BACKUP_HEADER,
} from "../src/lib/backups/crypto";

describe("KrediMax Backup Cryptography (AES-256-GCM)", () => {
  const originalEnvKey = process.env.KREDIMAX_BACKUP_KEY;
  const testKeyHex = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
  const wrongKeyHex = "fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210";
  let tempDir: string;

  beforeEach(async () => {
    process.env.KREDIMAX_BACKUP_KEY = testKeyHex;
    tempDir = join(tmpdir(), `kredimax-crypto-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await fs.mkdir(tempDir, { recursive: true });
  });

  afterEach(async () => {
    process.env.KREDIMAX_BACKUP_KEY = originalEnvKey;
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("validates KREDIMAX_BACKUP_KEY format and rejects invalid keys", () => {
    expect(() => getBackupKey()).not.toThrow();
    expect(getBackupKey().length).toBe(32);

    process.env.KREDIMAX_BACKUP_KEY = "too_short";
    expect(() => getBackupKey()).toThrow(/64 caracteres/);

    delete process.env.KREDIMAX_BACKUP_KEY;
    expect(() => getBackupKey()).toThrow(/no está configurada/);
  });

  it("produces key fingerprint without revealing the key", () => {
    const fingerprint = getKeyFingerprint();
    expect(fingerprint).toHaveLength(8);
    expect(fingerprint).not.toBe(testKeyHex.slice(0, 8));
  });

  it("encrypts with KMAXBKP1 header, IV, and auth tag; recovers exact plaintext on decrypt", () => {
    return (async () => {
      const plaintext = "KrediMax confidential customer financial payload: 1234567890 DOP";
      const sourceFile = join(tempDir, "sample.txt");
      const encryptedFile = join(tempDir, "sample.kmax.enc");
      const decryptedFile = join(tempDir, "sample.decrypted.txt");

      await fs.writeFile(sourceFile, plaintext, "utf8");

      const encResult = await encryptFile(sourceFile, encryptedFile);
      expect(encResult.encryptedSizeBytes).toBeGreaterThan(plaintext.length);
      expect(encResult.rawSha256).toBeDefined();
      expect(encResult.encryptedSha256).toBeDefined();

      // Check binary header
      const buffer = await fs.readFile(encryptedFile);
      const header = buffer.subarray(0, 8);
      expect(header.equals(BACKUP_HEADER)).toBe(true);

      // Verify integrity
      const verifyResult = await verifyEncryptedFile(encryptedFile);
      expect(verifyResult.valid).toBe(true);
      expect(verifyResult.sha256).toBe(encResult.encryptedSha256);

      // Decrypt
      await decryptFile(encryptedFile, decryptedFile);
      const recovered = await fs.readFile(decryptedFile, "utf8");
      expect(recovered).toBe(plaintext);
    })();
  });

  it("fails verification and decryption when using the wrong key", () => {
    return (async () => {
      const plaintext = "Financial ledger transactions audit data";
      const sourceFile = join(tempDir, "ledger.txt");
      const encryptedFile = join(tempDir, "ledger.kmax.enc");

      await fs.writeFile(sourceFile, plaintext, "utf8");
      await encryptFile(sourceFile, encryptedFile);

      const wrongKey = Buffer.from(wrongKeyHex, "hex");
      await expect(verifyEncryptedFile(encryptedFile, wrongKey)).rejects.toThrow();

      const destFile = join(tempDir, "recovered.txt");
      await expect(decryptFile(encryptedFile, destFile, wrongKey)).rejects.toThrow();
    })();
  });

  it("rejects tampered or corrupt ciphertext", () => {
    return (async () => {
      const sourceFile = join(tempDir, "secure.txt");
      const encryptedFile = join(tempDir, "tampered.kmax.enc");

      await fs.writeFile(sourceFile, "Critical banking records", "utf8");
      await encryptFile(sourceFile, encryptedFile);

      // Tamper 1 byte in the middle of ciphertext
      const buffer = await fs.readFile(encryptedFile);
      buffer[25] ^= 0xff; // flip bits
      await fs.writeFile(encryptedFile, buffer);

      await expect(verifyEncryptedFile(encryptedFile)).rejects.toThrow();
    })();
  });
});
