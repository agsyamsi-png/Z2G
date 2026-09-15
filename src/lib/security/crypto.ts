import crypto from "crypto";

const DEFAULT_MASTER_KEY_HEX = "e9b2c48873a45c36199342790bd5e82f50d18b62439a3f2d8471c08b5e24a10d";
const ALGORITHM = "aes-256-gcm";
const KEY_REF = "kms:local:v1";

function getMasterKey(): Buffer {
  const envKey = process.env.MIGRATION_MASTER_KEY;
  if (envKey) {
    if (envKey.length === 64) {
      return Buffer.from(envKey, "hex");
    }
    return crypto.createHash("sha256").update(envKey).digest();
  }
  return Buffer.from(DEFAULT_MASTER_KEY_HEX, "hex");
}

export interface EncryptedSecretPayload {
  ciphertext: string;
  iv: string;
  authTag: string;
  keyRef: string;
  algorithm: string;
}

/**
 * Encrypts a source credential using AES-256-GCM with AAD bound to (projectId, mappingId, revision).
 */
export function encryptCredential(
  secret: string,
  projectId: string,
  mappingId: string,
  revision: number
): EncryptedSecretPayload {
  if (!secret) {
    throw new Error("Cannot encrypt empty credential");
  }

  const key = getMasterKey();
  const iv = crypto.randomBytes(12); // 96-bit IV standard for GCM
  const aad = Buffer.from(`${projectId}:${mappingId}:${revision}`, "utf-8");

  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  cipher.setAAD(aad);

  const encrypted = Buffer.concat([
    cipher.update(Buffer.from(secret, "utf-8")),
    cipher.final(),
  ]);

  const authTag = cipher.getAuthTag();

  return {
    ciphertext: encrypted.toString("base64"),
    iv: iv.toString("base64"),
    authTag: authTag.toString("base64"),
    keyRef: KEY_REF,
    algorithm: ALGORITHM,
  };
}

/**
 * Decrypts a source credential verifying authentication tag and AAD context binding.
 * Throws a safe error without disclosing plaintext or ciphertext if verification fails.
 */
export function decryptCredential(
  payload: {
    ciphertext: string;
    iv: string;
    authTag: string;
    keyRef?: string;
  },
  projectId: string,
  mappingId: string,
  revision: number
): string {
  try {
    const key = getMasterKey();
    const iv = Buffer.from(payload.iv, "base64");
    const authTag = Buffer.from(payload.authTag, "base64");
    const ciphertext = Buffer.from(payload.ciphertext, "base64");
    const aad = Buffer.from(`${projectId}:${mappingId}:${revision}`, "utf-8");

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAAD(aad);
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]);

    return decrypted.toString("utf-8");
  } catch {
    throw new Error("Decryption failed: cryptographic integrity check or context binding mismatch");
  }
}

/**
 * Safely clears a buffer in memory
 */
export function wipeBuffer(buf: Buffer): void {
  buf.fill(0);
}
