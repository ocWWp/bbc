// v1.5 D-W3-4: Generic webhook verification + mapping.
//
// Pure functions used by the webhook route handler. Kept separate so the
// security-sensitive bits (HMAC verification, replay window, size cap, JSONPath
// extraction) are fully unit-testable without spinning up Next.js + Supabase.
//
// Design contract: docs/plans/2026-05-12-bbc-launch-design.md §4 "Generic
// Webhook security".
//
//   - HMAC-SHA256 over the raw body, header `X-BBC-Signature: sha256=<hex>`
//     Timing-safe compare. Mismatch → DLQ reason='invalid_signature', 401.
//   - 5-min replay window via `X-BBC-Timestamp` (unix ms, integer string).
//     Outside window → DLQ reason='expired_timestamp', 401.
//   - 1MB body cap. Larger → DLQ reason='oversized', 413.
//   - JSONPath mapping from `tenant_connectors.mapping`. Missing required
//     field → DLQ reason='mapping_rejected', 400.

import { createHmac, timingSafeEqual } from "node:crypto";
import type { MemoryProposal } from "./framework";
import type { Supertag } from "@/lib/memory/types";

// --------------------------------------------------------------------------
// Constants
// --------------------------------------------------------------------------

export const MAX_BODY_BYTES = 1_000_000; // 1MB
export const REPLAY_WINDOW_MS = 5 * 60 * 1000; // 5 min

const SIG_PREFIX = "sha256=";
const SIG_HEX_LENGTH = 64; // SHA-256 = 32 bytes = 64 hex chars

/** All possible DLQ reasons (mirrors the CHECK constraint on webhook_dead_letters.reason). */
export type DlqReason =
  | "invalid_signature"
  | "expired_timestamp"
  | "oversized"
  | "mapping_rejected"
  | "malformed_json"
  | "rate_limited";

export type VerifyOk = {
  ok: true;
  body_text: string;
  body_json: unknown;
};

export type VerifyError = {
  ok: false;
  reason: DlqReason;
  http_status: number;
  message: string;
};

export type VerifyResult = VerifyOk | VerifyError;

// --------------------------------------------------------------------------
// HMAC + timestamp
// --------------------------------------------------------------------------

/** Compute the canonical signature hex string for a body + secret. */
export function computeSignature(secret: string, rawBody: Buffer | string): string {
  const h = createHmac("sha256", secret);
  h.update(typeof rawBody === "string" ? Buffer.from(rawBody, "utf8") : rawBody);
  return h.digest("hex");
}

/** Constant-time compare two hex strings. Returns false for length mismatch. */
export function safeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length || a.length !== SIG_HEX_LENGTH) return false;
  // Both are validated to be 64 hex chars; parsing to bytes for timingSafeEqual.
  if (!/^[0-9a-f]+$/i.test(a) || !/^[0-9a-f]+$/i.test(b)) return false;
  const ab = Buffer.from(a.toLowerCase(), "hex");
  const bb = Buffer.from(b.toLowerCase(), "hex");
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

export function parseSignatureHeader(header: string | null | undefined): string | null {
  if (!header) return null;
  const trimmed = header.trim();
  if (!trimmed.startsWith(SIG_PREFIX)) return null;
  const hex = trimmed.slice(SIG_PREFIX.length).toLowerCase();
  if (hex.length !== SIG_HEX_LENGTH || !/^[0-9a-f]+$/.test(hex)) return null;
  return hex;
}

/** Returns true if `ts` (unix ms) is within REPLAY_WINDOW_MS of `now` (unix ms). */
export function timestampInWindow(ts: number, now: number): boolean {
  if (!Number.isFinite(ts)) return false;
  return Math.abs(now - ts) <= REPLAY_WINDOW_MS;
}

// --------------------------------------------------------------------------
// Verify the incoming request
// --------------------------------------------------------------------------

export type VerifyInput = {
  raw_body: Buffer | string;
  signature_header: string | null;
  timestamp_header: string | null;
  content_length: number | null;
  secret: string;
  now_ms: number;
};

export function verifyRequest(input: VerifyInput): VerifyResult {
  const body =
    typeof input.raw_body === "string"
      ? Buffer.from(input.raw_body, "utf8")
      : input.raw_body;

  // Order matters: cheapest + most distinguishable checks first so the failure
  // reason on the DLQ row is accurate. Size is also checked before HMAC so we
  // never expend CPU on a 100MB payload.
  if (input.content_length !== null && input.content_length > MAX_BODY_BYTES) {
    return { ok: false, reason: "oversized", http_status: 413, message: "body exceeds 1MB" };
  }
  if (body.length > MAX_BODY_BYTES) {
    return { ok: false, reason: "oversized", http_status: 413, message: "body exceeds 1MB" };
  }

  const ts = parseInt((input.timestamp_header ?? "").trim(), 10);
  if (!Number.isFinite(ts) || !timestampInWindow(ts, input.now_ms)) {
    return {
      ok: false,
      reason: "expired_timestamp",
      http_status: 401,
      message: "timestamp missing or outside 5-min window",
    };
  }

  const providedSig = parseSignatureHeader(input.signature_header);
  if (!providedSig) {
    return {
      ok: false,
      reason: "invalid_signature",
      http_status: 401,
      message: "missing or malformed X-BBC-Signature",
    };
  }
  // Sign over `<timestamp>.<body>` so the timestamp is part of the
  // protected envelope — otherwise an attacker could keep the signature
  // and bump the timestamp until they fall back inside the window.
  const expected = computeSignature(input.secret, `${ts}.${body.toString("utf8")}`);
  if (!safeEqualHex(providedSig, expected)) {
    return {
      ok: false,
      reason: "invalid_signature",
      http_status: 401,
      message: "signature mismatch",
    };
  }

  let body_json: unknown;
  try {
    body_json = JSON.parse(body.toString("utf8"));
  } catch {
    return {
      ok: false,
      reason: "malformed_json",
      http_status: 400,
      message: "body is not valid JSON",
    };
  }
  return { ok: true, body_text: body.toString("utf8"), body_json };
}

// --------------------------------------------------------------------------
// JSONPath (tiny subset: $, $.foo, $.foo.bar, $.foo[0], $.foo[0].bar)
// --------------------------------------------------------------------------

/** Resolve a JSONPath expression against `root`. Returns undefined if any
 *  segment doesn't resolve. Numeric segments only work on arrays. */
export function resolvePath(root: unknown, path: string): unknown {
  if (typeof path !== "string" || path.length === 0) return undefined;
  if (path === "$") return root;
  if (!path.startsWith("$")) return undefined;

  let current: unknown = root;
  // Tokenize: split on `.` but recognize `[N]` as a separate segment.
  // Examples: "$.foo[0].bar" → ["foo", "[0]", "bar"]
  const tail = path.slice(1); // drop the leading $
  const tokens: string[] = [];
  let buf = "";
  let i = 0;
  while (i < tail.length) {
    const ch = tail[i];
    if (ch === ".") {
      if (buf.length > 0) {
        tokens.push(buf);
        buf = "";
      }
      i++;
    } else if (ch === "[") {
      if (buf.length > 0) {
        tokens.push(buf);
        buf = "";
      }
      const close = tail.indexOf("]", i);
      if (close === -1) return undefined;
      tokens.push(tail.slice(i, close + 1)); // includes brackets
      i = close + 1;
    } else {
      buf += ch;
      i++;
    }
  }
  if (buf.length > 0) tokens.push(buf);

  for (const token of tokens) {
    if (current == null) return undefined;
    if (token.startsWith("[") && token.endsWith("]")) {
      const idx = parseInt(token.slice(1, -1), 10);
      if (!Number.isInteger(idx) || idx < 0 || !Array.isArray(current)) return undefined;
      const element: unknown = current[idx];
      current = element;
    } else {
      if (typeof current !== "object" || Array.isArray(current)) return undefined;
      // Never resolve prototype-chain keys, even if a payload carries one as an
      // own property — and own properties only, so we never walk the chain.
      if (token === "__proto__" || token === "constructor" || token === "prototype") {
        return undefined;
      }
      const obj = current as Record<string, unknown>;
      if (!Object.hasOwn(obj, token)) return undefined;
      const value: unknown = obj[token];
      current = value;
    }
  }
  return current;
}

// --------------------------------------------------------------------------
// Mapping → MemoryProposal
// --------------------------------------------------------------------------

const SUPERTAG_VALUES = new Set<string>([
  "voice", "decision", "glossary", "vendor", "product", "team", "skill", "source_artifact", "note",
]);

export type WebhookMapping = {
  type: Supertag;
  title: string; // JSONPath
  body?: string; // JSONPath; optional
  source_ref: string; // JSONPath
  // Reserved for future: fields: Record<string, string>  — field-by-field JSONPath
};

export function parseMapping(raw: Record<string, unknown>): WebhookMapping | null {
  const type = raw.type;
  const title = raw.title;
  const source_ref = raw.source_ref;
  const body = raw.body;
  if (typeof type !== "string" || !SUPERTAG_VALUES.has(type)) return null;
  if (typeof title !== "string" || title.length === 0) return null;
  if (typeof source_ref !== "string" || source_ref.length === 0) return null;
  return {
    type: type as Supertag,
    title,
    source_ref,
    body: typeof body === "string" && body.length > 0 ? body : undefined,
  };
}

export type ApplyMappingResult =
  | { ok: true; proposal: MemoryProposal }
  | { ok: false; reason: "mapping_rejected"; http_status: 400; message: string };

export function applyMapping(payload: unknown, mapping: WebhookMapping): ApplyMappingResult {
  const titleValue = resolvePath(payload, mapping.title);
  const sourceRefValue = resolvePath(payload, mapping.source_ref);
  if (typeof titleValue !== "string" || titleValue.length === 0) {
    return {
      ok: false,
      reason: "mapping_rejected",
      http_status: 400,
      message: `mapping.title path '${mapping.title}' did not resolve to a non-empty string`,
    };
  }
  if (typeof sourceRefValue !== "string" || sourceRefValue.length === 0) {
    return {
      ok: false,
      reason: "mapping_rejected",
      http_status: 400,
      message: `mapping.source_ref path '${mapping.source_ref}' did not resolve to a non-empty string`,
    };
  }
  let bodyText = "";
  if (mapping.body) {
    const bodyValue = resolvePath(payload, mapping.body);
    if (typeof bodyValue === "string") bodyText = bodyValue;
    else if (bodyValue !== undefined) bodyText = String(bodyValue);
  }
  return {
    ok: true,
    proposal: {
      type: mapping.type,
      title: titleValue.slice(0, 200),
      body: bodyText,
      fields: {
        source_ref: sourceRefValue,
        source_kind: "webhook",
      },
      source_ref: `webhook:${sourceRefValue}`,
    },
  };
}

// --------------------------------------------------------------------------
// In-memory rate limiter (per-Worker; resets on cold start — acceptable for v1.5)
// --------------------------------------------------------------------------

const RATE_LIMIT_PER_MIN = 60;
const rateBuckets = new Map<string, number[]>();

/** Records this request and returns whether the tenant has exceeded the per-minute
 *  budget. Stores at most RATE_LIMIT_PER_MIN+1 timestamps per tenant. */
export function checkRateLimit(tenant_id: string, now_ms: number): boolean {
  const window = now_ms - 60_000;
  const stamps = rateBuckets.get(tenant_id) ?? [];
  // Drop anything older than the 60s window.
  const fresh = stamps.filter((t) => t > window);
  fresh.push(now_ms);
  rateBuckets.set(tenant_id, fresh);
  return fresh.length > RATE_LIMIT_PER_MIN;
}

/** Test-only — flushes the in-memory rate-limit state. */
export function _resetRateLimitForTests(): void {
  rateBuckets.clear();
}
