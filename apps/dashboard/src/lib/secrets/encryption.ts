// AES-256-GCM encryption helpers for BYOK secrets stored in the
// external_accounts table. Plaintext never reaches Postgres; ciphertext + iv
// + auth tag are stored as bytea columns. The 32-byte symmetric key lives in
// BBC_SECRET_ENCRYPTION_KEY (base64-encoded raw bytes).
//
// Threat model: this protects against a database leak. It does NOT protect
// against a server compromise (the server has the key by definition). Use a
// secrets manager (Vercel env vars, AWS Secrets Manager, doppler) to hold
// the encryption key; rotate it by re-encrypting all rows in a maintenance
// window. Key rotation tooling is out of scope for v1 -- see Phase K plan
// risk #1.

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const KEY_BYTES = 32;
const IV_BYTES = 12; // GCM standard
const TAG_BYTES = 16; // GCM standard

let cachedKey: Buffer | null = null;

function loadKey(): Buffer {
  if (cachedKey) return cachedKey;
  const b64 = process.env.BBC_SECRET_ENCRYPTION_KEY;
  if (!b64) {
    throw new Error(
      "BBC_SECRET_ENCRYPTION_KEY is not set. Generate one with `openssl rand -base64 32` and set it in your env.",
    );
  }
  let raw: Buffer;
  try {
    raw = Buffer.from(b64, "base64");
  } catch {
    throw new Error("BBC_SECRET_ENCRYPTION_KEY is not valid base64.");
  }
  if (raw.length !== KEY_BYTES) {
    throw new Error(
      `BBC_SECRET_ENCRYPTION_KEY must decode to ${KEY_BYTES} bytes (got ${raw.length}). Use \`openssl rand -base64 32\`.`,
    );
  }
  cachedKey = raw;
  return raw;
}

export type EncryptedSecret = {
  ciphertext: Buffer;
  iv: Buffer;
  tag: Buffer;
};

export function encryptSecret(plaintext: string): EncryptedSecret {
  if (typeof plaintext !== "string" || plaintext.length === 0) {
    throw new Error("encryptSecret: plaintext must be a non-empty string");
  }
  const key = loadKey();
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return { ciphertext, iv, tag };
}

export function decryptSecret(input: EncryptedSecret): string {
  if (input.iv.length !== IV_BYTES) {
    throw new Error(`decryptSecret: iv must be ${IV_BYTES} bytes`);
  }
  if (input.tag.length !== TAG_BYTES) {
    throw new Error(`decryptSecret: tag must be ${TAG_BYTES} bytes`);
  }
  const key = loadKey();
  const decipher = createDecipheriv(ALGORITHM, key, input.iv);
  decipher.setAuthTag(input.tag);
  // Tamper detection: decipher.final() throws if the tag doesn't match.
  const plaintext = Buffer.concat([decipher.update(input.ciphertext), decipher.final()]);
  return plaintext.toString("utf8");
}

// Display hint shown in the UI so users can recognize their own key without
// the server ever re-exposing the secret. Always last 4 chars; never the
// first 4 (which often encode the provider prefix and would be redundant).
export function makeDisplayHint(secret: string): string {
  if (typeof secret !== "string" || secret.length < 4) return "…";
  return `…${secret.slice(-4)}`;
}

// Provider-specific shape validators. Cheap regex guards so the BYOK paste
// field can reject obvious typos before encryption.
export const PROVIDER_KEY_VALIDATORS: Record<string, (s: string) => boolean> = {
  // Anthropic: sk-ant-...
  anthropic: (s) => /^sk-ant-[a-zA-Z0-9_-]{40,}$/.test(s),
  // OpenAI: sk-... or sk-proj-...
  openai: (s) => /^sk-(?:proj-)?[a-zA-Z0-9_-]{40,}$/.test(s),
  // Resend: re_...
  resend: (s) => /^re_[a-zA-Z0-9_]{20,}$/.test(s),
};

export function validateProviderKey(providerId: string, secret: string): boolean {
  const v = PROVIDER_KEY_VALIDATORS[providerId];
  // Unknown provider: accept anything non-empty. Allows new providers to land
  // without a code change; tightens shape later in their adapter PR.
  if (!v) return secret.trim().length > 0;
  return v(secret);
}
