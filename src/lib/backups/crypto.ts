import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { createReadStream, createWriteStream, promises as fs } from "node:fs";
import { pipeline } from "node:stream/promises";
import { Transform, Writable } from "node:stream";

export const BACKUP_HEADER = Buffer.from("KMAXBKP1"); // 8 bytes magic header
export const IV_BYTES = 12; // 12 bytes GCM IV
export const TAG_BYTES = 16; // 16 bytes GCM auth tag
export const CIPHER_ALGO = "aes-256-gcm";

/**
 * Reads and validates the 32-byte (64 hex characters) backup key from environment.
 * Never stores or returns key in plain text to client or manifests.
 */
export function getBackupKey(): Buffer {
  const encoded = process.env.KREDIMAX_BACKUP_KEY;
  if (!encoded || !/^[a-fA-F0-9]{64}$/.test(encoded.trim())) {
    throw new Error(
      "KREDIMAX_BACKUP_KEY no está configurada o no es válida. Debe ser una clave hexadecimal de 64 caracteres (32 bytes)."
    );
  }
  return Buffer.from(encoded.trim(), "hex");
}

/**
 * Returns a 8-character fingerprint of the key's SHA-256 hash
 * for verifying key consistency in manifests without revealing the key.
 */
export function getKeyFingerprint(key: Buffer = getBackupKey()): string {
  return createHash("sha256").update(key).digest("hex").slice(0, 8);
}

/**
 * Calculates SHA-256 checksum of a file.
 */
export async function calculateFileSha256(filePath: string): Promise<string> {
  const hash = createHash("sha256");
  const stream = createReadStream(filePath);
  await pipeline(
    stream,
    new Writable({
      write(chunk, _encoding, callback) {
        hash.update(chunk);
        callback();
      },
    })
  );
  return hash.digest("hex");
}

/**
 * Encrypts a plaintext file or stream into a destination file using AES-256-GCM.
 * Output binary format: [8 bytes HEADER: KMAXBKP1][12 bytes IV][Ciphertext...][16 bytes AUTH TAG]
 */
export async function encryptFile(
  sourcePath: string,
  destinationPath: string,
  key: Buffer = getBackupKey()
): Promise<{ rawSha256: string; encryptedSha256: string; encryptedSizeBytes: number }> {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(CIPHER_ALGO, key, iv);

  const rawHash = createHash("sha256");
  const encryptedHash = createHash("sha256");

  const sourceStream = createReadStream(sourcePath);
  const destStream = createWriteStream(destinationPath, { mode: 0o600 });

  // 1. Write header and IV
  const headerAndIv = Buffer.concat([BACKUP_HEADER, iv]);
  encryptedHash.update(headerAndIv);
  destStream.write(headerAndIv);

  // 2. Stream through hash & cipher
  const passThrough = new Transform({
    transform(chunk, _encoding, callback) {
      rawHash.update(chunk);
      this.push(chunk);
      callback();
    },
  });

  const cipherCollector = new Transform({
    transform(chunk, _encoding, callback) {
      encryptedHash.update(chunk);
      this.push(chunk);
      callback();
    },
  });

  await pipeline(sourceStream, passThrough, cipher, cipherCollector, destStream);

  // 3. Append Auth Tag at the very end
  const tag = cipher.getAuthTag();
  encryptedHash.update(tag);
  await fs.appendFile(destinationPath, tag);

  const stat = await fs.stat(destinationPath);

  return {
    rawSha256: rawHash.digest("hex"),
    encryptedSha256: encryptedHash.digest("hex"),
    encryptedSizeBytes: stat.size,
  };
}

/**
 * Verifies that an encrypted backup file has valid header, IV, and authentic AES-256-GCM tag.
 * Throws an Error if file is corrupt, altered, or key is wrong.
 */
export async function verifyEncryptedFile(
  filePath: string,
  key: Buffer = getBackupKey()
): Promise<{ valid: boolean; sizeBytes: number; sha256: string }> {
  const stat = await fs.stat(filePath);
  const minSize = BACKUP_HEADER.length + IV_BYTES + TAG_BYTES;
  if (stat.size < minSize) {
    throw new Error(`El archivo de respaldo está incompleto o truncado (tamaño: ${stat.size} bytes).`);
  }

  const handle = await fs.open(filePath, "r");
  try {
    const headerAndIv = Buffer.alloc(BACKUP_HEADER.length + IV_BYTES);
    const tag = Buffer.alloc(TAG_BYTES);

    await handle.read(headerAndIv, 0, headerAndIv.length, 0);
    await handle.read(tag, 0, tag.length, stat.size - TAG_BYTES);

    const header = headerAndIv.subarray(0, BACKUP_HEADER.length);
    const iv = headerAndIv.subarray(BACKUP_HEADER.length);

    if (!header.equals(BACKUP_HEADER)) {
      throw new Error("El archivo no contiene la cabecera válida de respaldo KrediMax (KMAXBKP1).");
    }

    const decipher = createDecipheriv(CIPHER_ALGO, key, iv);
    decipher.setAuthTag(tag);

    const ciphertextStream = createReadStream(filePath, {
      start: headerAndIv.length,
      end: stat.size - TAG_BYTES - 1,
    });

    const fileHash = createHash("sha256");
    const fullStream = createReadStream(filePath);

    // Compute full file hash and verify deciphering in parallel
    const verifyPromise = pipeline(
      ciphertextStream,
      decipher,
      new Writable({
        write(_chunk, _encoding, callback) {
          callback();
        },
      })
    );

    const hashPromise = pipeline(
      fullStream,
      new Writable({
        write(chunk, _encoding, callback) {
          fileHash.update(chunk);
          callback();
        },
      })
    );

    await Promise.all([verifyPromise, hashPromise]);

    return {
      valid: true,
      sizeBytes: stat.size,
      sha256: fileHash.digest("hex"),
    };
  } finally {
    await handle.close();
  }
}

/**
 * Decrypts an encrypted backup file to a target plaintext destination stream or file.
 */
export async function decryptFile(
  sourcePath: string,
  destinationPath: string,
  key: Buffer = getBackupKey()
): Promise<void> {
  const stat = await fs.stat(sourcePath);
  const minSize = BACKUP_HEADER.length + IV_BYTES + TAG_BYTES;
  if (stat.size < minSize) throw new Error("Archivo de respaldo incompleto.");

  const handle = await fs.open(sourcePath, "r");
  try {
    const headerAndIv = Buffer.alloc(BACKUP_HEADER.length + IV_BYTES);
    const tag = Buffer.alloc(TAG_BYTES);

    await handle.read(headerAndIv, 0, headerAndIv.length, 0);
    await handle.read(tag, 0, tag.length, stat.size - TAG_BYTES);

    const header = headerAndIv.subarray(0, BACKUP_HEADER.length);
    const iv = headerAndIv.subarray(BACKUP_HEADER.length);

    if (!header.equals(BACKUP_HEADER)) {
      throw new Error("Cabecera no compatible.");
    }

    const decipher = createDecipheriv(CIPHER_ALGO, key, iv);
    decipher.setAuthTag(tag);

    const ciphertext = createReadStream(sourcePath, {
      start: headerAndIv.length,
      end: stat.size - TAG_BYTES - 1,
    });

    const dest = createWriteStream(destinationPath, { mode: 0o600 });
    await pipeline(ciphertext, decipher, dest);
  } finally {
    await handle.close();
  }
}
