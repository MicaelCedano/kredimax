import { createWriteStream, promises as fs } from "node:fs";
import { createGzip } from "node:zlib";
import { join } from "node:path";
import postgres from "postgres";
import { encryptFile, getBackupKey } from "./crypto.ts";
import { createClient } from "@supabase/supabase-js";

export interface DocumentsBackupResult {
  fileName: string;
  encryptedDocsPath: string;
  customerPhotosCount: number;
  paymentEvidenceCount: number;
  storageFilesCount: number;
  totalDocumentsCount: number;
  rawSha256: string;
  encryptedSha256: string;
  encryptedSizeBytes: number;
}

export async function backupAndEncryptDocuments(
  databaseUrl: string,
  outputDir: string,
  timestampStr: string,
  key: Buffer = getBackupKey()
): Promise<DocumentsBackupResult> {
  await fs.mkdir(outputDir, { recursive: true });

  const rawTarPath = join(outputDir, `kredimax_docs_${timestampStr}.json.gz`);
  const encryptedDocsPath = join(outputDir, `kredimax_docs_${timestampStr}.docs.kmax.enc`);
  const fileName = `kredimax_docs_${timestampStr}.docs.kmax.enc`;

  const sql = postgres(databaseUrl, { ssl: "require", max: 1, prepare: false });

  let customerPhotosCount = 0;
  let paymentEvidenceCount = 0;
  let storageFilesCount = 0;

  try {
    // 1. Fetch customer photos
    const photos = await sql`
      SELECT customer_id, tenant_id, image_data, content_type, updated_by, updated_at
      FROM public.customer_photos
    `;
    customerPhotosCount = photos.length;

    // 2. Fetch payment evidence
    const evidences = await sql`
      SELECT payment_id, tenant_id, image_data, content_type, image_sha256, evidence_kind, signed_receipt_attested, created_by, created_at
      FROM public.payment_evidence
    `;
    paymentEvidenceCount = evidences.length;

    // 3. Fetch customer document records
    const docRecords = await sql`
      SELECT id, tenant_id, customer_id, storage_path, document_type, consent_at, retention_until, created_at
      FROM public.customer_documents
    `;

    // 4. Check Supabase Storage if available
    const storageFiles: Array<{ bucket: string; path: string; dataBase64?: string }> = [];
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseSecret = process.env.SUPABASE_SECRET_KEY;

    if (supabaseUrl && supabaseSecret) {
      try {
        const supabase = createClient(supabaseUrl, supabaseSecret, { auth: { persistSession: false } });
        const { data: buckets } = await supabase.storage.listBuckets();
        if (buckets && buckets.length > 0) {
          for (const bucket of buckets) {
            const { data: files } = await supabase.storage.from(bucket.name).list();
            if (files) {
              for (const file of files) {
                try {
                  const { data: blob } = await supabase.storage.from(bucket.name).download(file.name);
                  if (blob) {
                    const arrayBuffer = await blob.arrayBuffer();
                    storageFiles.push({
                      bucket: bucket.name,
                      path: file.name,
                      dataBase64: Buffer.from(arrayBuffer).toString("base64"),
                    });
                  }
                } catch {
                  // ignore individual read errors
                }
              }
            }
          }
        }
      } catch (storageErr) {
        console.warn("Storage buckets could not be enumerated:", storageErr);
      }
    }
    storageFilesCount = storageFiles.length;

    // Build documents manifest & archive payload
    const payload = {
      archiveType: "kredimax_documents_bundle",
      timestamp: new Date().toISOString(),
      summary: {
        customerPhotos: customerPhotosCount,
        paymentEvidence: paymentEvidenceCount,
        customerDocumentRecords: docRecords.length,
        storageFiles: storageFilesCount,
        total: customerPhotosCount + paymentEvidenceCount + storageFilesCount,
      },
      customerPhotos: photos.map((p) => ({
        customerId: p.customer_id,
        tenantId: p.tenant_id,
        contentType: p.content_type,
        updatedAt: p.updated_at,
        dataBase64: Buffer.isBuffer(p.image_data)
          ? p.image_data.toString("base64")
          : Buffer.from(p.image_data).toString("base64"),
      })),
      paymentEvidence: evidences.map((e) => ({
        paymentId: e.payment_id,
        tenantId: e.tenant_id,
        contentType: e.content_type,
        evidenceKind: e.evidence_kind,
        imageSha256: e.image_sha256,
        signedReceiptAttested: e.signed_receipt_attested,
        createdAt: e.created_at,
        dataBase64: Buffer.isBuffer(e.image_data)
          ? e.image_data.toString("base64")
          : Buffer.from(e.image_data).toString("base64"),
      })),
      customerDocumentsMetadata: docRecords,
      storageFiles,
    };

    // Compress with Gzip into temporary file
    const jsonBuffer = Buffer.from(JSON.stringify(payload), "utf8");
    const gzip = createGzip({ level: 9 });
    const fileStream = createWriteStream(rawTarPath);

    await new Promise<void>((resolve, reject) => {
      gzip.pipe(fileStream);
      gzip.on("error", reject);
      fileStream.on("finish", resolve);
      fileStream.on("error", reject);
      gzip.end(jsonBuffer);
    });

    // Encrypt with AES-256-GCM
    const encResult = await encryptFile(rawTarPath, encryptedDocsPath, key);

    // Safely remove unencrypted raw gzip
    await fs.rm(rawTarPath, { force: true });

    return {
      fileName,
      encryptedDocsPath,
      customerPhotosCount,
      paymentEvidenceCount,
      storageFilesCount,
      totalDocumentsCount: customerPhotosCount + paymentEvidenceCount + storageFilesCount,
      rawSha256: encResult.rawSha256,
      encryptedSha256: encResult.encryptedSha256,
      encryptedSizeBytes: encResult.encryptedSizeBytes,
    };
  } finally {
    await sql.end({ timeout: 5 });
  }
}
