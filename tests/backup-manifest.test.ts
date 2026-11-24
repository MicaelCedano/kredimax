import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { formatDominicanTime, generateManifest } from "../src/lib/backups/manifest";
import { assertSafeTemporaryDbName } from "../src/lib/backups/restore";

describe("KrediMax Backup Manifest and Safety", () => {
  const originalEnvKey = process.env.KREDIMAX_BACKUP_KEY;

  beforeEach(() => {
    process.env.KREDIMAX_BACKUP_KEY = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
  });

  afterEach(() => {
    process.env.KREDIMAX_BACKUP_KEY = originalEnvKey;
  });

  it("formats Dominican AST time correctly", () => {
    const testDate = new Date("2026-10-31T07:00:00.000Z"); // 3:00 AM AST
    const formatted = formatDominicanTime(testDate);
    expect(formatted).toMatch(/3:00:00/);
    expect(formatted).toMatch(/a\.\s*m\./i);
  });

  it("generates manifest with required metadata and never leaks keys or passwords", () => {
    const manifest = generateManifest({
      backupId: "test-uuid-1234",
      backupType: "daily",
      pgVersion: "PostgreSQL 17.11 on aarch64",
      database: {
        fileName: "kredimax_db_20261031_030000.dump.kmax.enc",
        encryptedSizeBytes: 1048576,
        encryptedSha256: "abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234",
        rawSha256: "1111222233334444555566667777888811112222333344445555666677778888",
        tablesCount: 30,
        rowCounts: { customers: 25, loans: 18, payments: 94 },
      },
      documents: {
        fileName: "kredimax_docs_20261031_030000.docs.kmax.enc",
        encryptedSizeBytes: 524288,
        encryptedSha256: "9999888877776666555544443333222299998888777766665555444433332222",
        customerPhotosCount: 15,
        paymentEvidenceCount: 8,
        storageFilesCount: 0,
        totalDocuments: 23,
      },
      googleDrive: {
        uploaded: true,
        folderPath: "KrediMax/Backups/Database/Daily",
        files: [{ name: "kredimax_db_20261031_030000.dump.kmax.enc", id: "drive-file-id-xyz" }],
      },
    });

    expect(manifest.app).toBe("KrediMax");
    expect(manifest.timezone).toBe("America/Santo_Domingo");
    expect(manifest.encryption.algorithm).toBe("aes-256-gcm");
    expect(manifest.encryption.header).toBe("KMAXBKP1");
    expect(manifest.encryption.keyFingerprint).toHaveLength(8);

    // Assert NO plain keys or passwords are leaked in the manifest JSON
    const jsonStr = JSON.stringify(manifest);
    expect(jsonStr).not.toContain("0123456789abcdef0123456789abcdef");
    expect(jsonStr).not.toContain("password");
    expect(jsonStr).not.toContain("secret");
  });

  it("enforces safe temporary database naming for disaster recovery", () => {
    expect(() => assertSafeTemporaryDbName("kredimax_restore_20261031_test")).not.toThrow();
    expect(() => assertSafeTemporaryDbName("kredimax_restore_temp1")).not.toThrow();

    // Reject dangerous production or arbitrary names
    expect(() => assertSafeTemporaryDbName("postgres")).toThrow(/no es válido/);
    expect(() => assertSafeTemporaryDbName("kredimax_production")).toThrow(/no es válido/);
    expect(() => assertSafeTemporaryDbName("mydb")).toThrow(/no es válido/);
    expect(() => assertSafeTemporaryDbName("kredimax_restore_; DROP TABLE users;")).toThrow(/no es válido/);
  });
});
