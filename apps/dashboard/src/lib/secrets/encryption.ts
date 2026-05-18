// AES-256-GCM encryption helpers for BYOK secrets stored in the
// external_accounts table. Plaintext never reaches Postgres; ciphertext + iv
// + auth tag are stored as base64 strings in TEXT columns. The 32-byte
// symmetric key lives in BBC_SECRET_ENCRYPTION_KEY (base64-encoded raw bytes).
//
// Storage encoding note (migration 0060, post-PR #25 smoke P0):
// Earlier versions stored these as bytea, but Supabase JS RPC/insert
// JSON-serialises Buffer values as `{"type":"Buffer","data":[...]}`. PostgREST
// stored that JSON-string bytes literally into bytea, which meant the round-
// trip was broken: decryptSecret would see a 69-byte "iv" (the JSON literal),
// fail the 12-byte guard, and silently fall through to envFallback in
// tenant-keys.ts. Live BYOK had never actually used a user's key. We now pass
// base64 strings on the wire (toWireSecret/fromWireSecret below) and store as
// TEXT — Buffer.toString('base64') round-trips faithfully through JSON.
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
  const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: TAG_BYTES });
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
  // Pin the GCM auth-tag length so a short tag can't be silently accepted.
  const decipher = createDecipheriv(ALGORITHM, key, input.iv, { authTagLength: TAG_BYTES });
  decipher.setAuthTag(input.tag);
  // Tamper detection: decipher.final() throws if the tag doesn't match.
  const plaintext = Buffer.concat([decipher.update(input.ciphertext), decipher.final()]);
  return plaintext.toString("utf8");
}

// Wire-format helpers — convert Buffer fields to/from base64 strings at the
// Supabase boundary. Use these EVERYWHERE you pass encrypted material to
// `.insert()` or `.rpc()`, and EVERYWHERE you read it back. Passing a Buffer
// directly will silently break the round-trip; see the storage-encoding note
// above. The narrow types make the asymmetry explicit at every callsite.
export type WireSecret = {
  ciphertext: string;
  iv: string;
  tag: string;
};

export function toWireSecret(s: EncryptedSecret): WireSecret {
  return {
    ciphertext: s.ciphertext.toString("base64"),
    iv: s.iv.toString("base64"),
    tag: s.tag.toString("base64"),
  };
}

export function fromWireSecret(w: WireSecret): EncryptedSecret {
  return {
    ciphertext: Buffer.from(w.ciphertext, "base64"),
    iv: Buffer.from(w.iv, "base64"),
    tag: Buffer.from(w.tag, "base64"),
  };
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
