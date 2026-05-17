// OAuth state — HMAC-signed payload + single-use nonce. Codex finding #2.
// Plaintext state from the previous design (buildOAuthState in google-oauth.ts)
// is unsigned and CSRF-vulnerable; this replaces it for the install callback path.

import { createHmac, timingSafeEqual } from "node:crypto";

export type OAuthStatePayload = {
  tenant_id: string;
  actor_user_id: string;
  provider: string;          // "google" (future: "notion" / "linear")
  scopes: string[];          // ["gmail","drive"] or single
  nonce: string;             // uuid; row in oauth_state_nonces
  expires_at_ms: number;     // ms epoch; default lifetime = 5 min
};

function loadSecret(): Buffer {
  const rawEnv = process.env.BBC_OAUTH_STATE_SECRET;
  if (!rawEnv || rawEnv.length === 0) {
    throw new Error("BBC_OAUTH_STATE_SECRET is not set. Generate one with `openssl rand -base64 32`.");
  }
  const b64 = rawEnv.trim();
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(b64)) {
    throw new Error("BBC_OAUTH_STATE_SECRET does not look like base64. Generate with `openssl rand -base64 32` (~44 chars).");
  }
  const raw = Buffer.from(b64, "base64");
  if (raw.length < 32) {
    throw new Error(`BBC_OAUTH_STATE_SECRET must decode to >=32 bytes (got ${raw.length} bytes from ${b64.length}-char input). Use \`openssl rand -base64 32\`.`);
  }
  return raw;
}

function b64url(buf: Buffer): string {
  return buf.toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
}
function b64urlDecode(s: string): Buffer {
  const padded = s.replace(/-/g, "+").replace(/_/g, "/") + "==".slice((s.length + 3) % 4);
  return Buffer.from(padded, "base64");
}

export function signOAuthState(payload: OAuthStatePayload): string {
  const key = loadSecret();
  const json = Buffer.from(JSON.stringify(payload), "utf8");
  const sig = createHmac("sha256", key).update(json).digest();
  return `${b64url(json)}.${b64url(sig)}`;
}

export function verifyOAuthState(signed: string, nowMs: number): OAuthStatePayload | null {
  if (typeof signed !== "string" || !signed.includes(".")) return null;
  const [payloadPart, sigPart] = signed.split(".");
  if (!payloadPart || !sigPart) return null;

  let payloadBytes: Buffer, sigBytes: Buffer;
  try {
    payloadBytes = b64urlDecode(payloadPart);
    sigBytes = b64urlDecode(sigPart);
  } catch { return null; }

  const key = loadSecret();
  const expected = createHmac("sha256", key).update(payloadBytes).digest();
  if (expected.length !== sigBytes.length) return null;
  if (!timingSafeEqual(expected, sigBytes)) return null;

  let payload: OAuthStatePayload;
  try { payload = JSON.parse(payloadBytes.toString("utf8")) as OAuthStatePayload; }
  catch { return null; }

  if (!payload || typeof payload !== "object") return null;
  if (typeof payload.expires_at_ms !== "number" || payload.expires_at_ms <= nowMs) return null;
  if (!payload.tenant_id || !payload.actor_user_id || !payload.provider || !payload.nonce) return null;
  if (!Array.isArray(payload.scopes)) return null;

  return payload;
}
