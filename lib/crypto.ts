import crypto from "crypto";

// Encrypts secrets (like a user's own OpenAI API key) at rest in SQLite.
// Uses AES-256-GCM with a key derived from ENCRYPTION_KEY via scrypt, so the
// value in the database is useless without that server-side secret.

const ALGORITHM = "aes-256-gcm";
const SALT = "productgenie-ai-secret-storage"; // fixed salt is fine: the secret itself is high-entropy and unique per deployment.

function getKey(): Buffer {
  const secret = process.env.ENCRYPTION_KEY;
  if (!secret) {
    throw new Error(
      "ENCRYPTION_KEY is not set. Set it in your environment before storing user secrets (see .env.example)."
    );
  }
  return crypto.scryptSync(secret, SALT, 32);
}

export function encryptSecret(plaintext: string): string {
  const key = getKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  // Store iv, authTag, and ciphertext together, base64-encoded.
  return [iv, authTag, ciphertext]
    .map((buf) => buf.toString("base64"))
    .join(".");
}

export function decryptSecret(stored: string): string {
  const key = getKey();
  const [ivB64, tagB64, dataB64] = stored.split(".");
  if (!ivB64 || !tagB64 || !dataB64) {
    throw new Error("Malformed encrypted value.");
  }
  const iv = Buffer.from(ivB64, "base64");
  const authTag = Buffer.from(tagB64, "base64");
  const ciphertext = Buffer.from(dataB64, "base64");
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  const plaintext = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);
  return plaintext.toString("utf8");
}

// Last 4 characters only, for display — never enough to reconstruct the key.
export function maskKey(plaintext: string): string {
  const tail = plaintext.slice(-4);
  return `sk-••••••••${tail}`;
}
