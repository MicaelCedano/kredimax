import { getKeyFingerprint } from "./crypto.ts";

export interface BackupManifest {
  manifestVersion: string;
  backupId: string;
  app: string;
  environment: string;
  timezone: string;
  createdAtUtc: string;
  createdAtDominican: string;
  backupType: "daily" | "monthly" | "manual";
  pgVersion: string;
  encryption: {
    algorithm: "aes-256-gcm";
    header: "KMAXBKP1";
    ivLengthBytes: 12;
    tagLengthBytes: 16;
    keyFingerprint: string;
  };
  database: {
    fileName: string;
    encryptedSizeBytes: number;
    encryptedSha256: string;
    rawSha256: string;
    tablesCount: number;
    rowCounts: Record<string, number>;
    driveFileId?: string;
  };
  documents: {
    fileName: string;
    encryptedSizeBytes: number;
    encryptedSha256: string;
    customerPhotosCount: number;
    paymentEvidenceCount: number;
    storageFilesCount: number;
    totalDocuments: number;
    driveFileId?: string;
  };
  googleDrive?: {
    uploaded: boolean;
    folderPath: string;
    files: Array<{ name: string; id: string; size?: string }>;
  };
  integrity: {
    status: "verified" | "pending" | "failed";
    verifiedAt?: string;
    notes?: string;
  };
}

export function formatDominicanTime(date: Date = new Date()): string {
  return new Intl.DateTimeFormat("es-DO", {
    timeZone: "America/Santo_Domingo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  }).format(date);
}

export function generateManifest(params: {
  backupId: string;
  backupType: "daily" | "monthly" | "manual";
  pgVersion: string;
  database: {
    fileName: string;
    encryptedSizeBytes: number;
    encryptedSha256: string;
    rawSha256: string;
    tablesCount: number;
    rowCounts: Record<string, number>;
    driveFileId?: string;
  };
  documents: {
    fileName: string;
    encryptedSizeBytes: number;
    encryptedSha256: string;
    customerPhotosCount: number;
    paymentEvidenceCount: number;
    storageFilesCount: number;
    totalDocuments: number;
    driveFileId?: string;
  };
  googleDrive?: {
    uploaded: boolean;
    folderPath: string;
    files: Array<{ name: string; id: string; size?: string }>;
  };
  integrityStatus?: "verified" | "pending" | "failed";
  integrityNotes?: string;
}): BackupManifest {
  const now = new Date();
  return {
    manifestVersion: "1.0.0",
    backupId: params.backupId,
    app: "KrediMax",
    environment: process.env.NODE_ENV || "production",
    timezone: "America/Santo_Domingo",
    createdAtUtc: now.toISOString(),
    createdAtDominican: `${formatDominicanTime(now)} AST`,
    backupType: params.backupType,
    pgVersion: params.pgVersion,
    encryption: {
      algorithm: "aes-256-gcm",
      header: "KMAXBKP1",
      ivLengthBytes: 12,
      tagLengthBytes: 16,
      keyFingerprint: getKeyFingerprint(),
    },
    database: params.database,
    documents: params.documents,
    googleDrive: params.googleDrive,
    integrity: {
      status: params.integrityStatus || "verified",
      verifiedAt: now.toISOString(),
      notes: params.integrityNotes,
    },
  };
}
