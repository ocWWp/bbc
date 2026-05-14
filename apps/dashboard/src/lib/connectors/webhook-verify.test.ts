// D-W3-4 acceptance tests for the webhook verifier + mapping engine.
//
// Per docs/plans/2026-05-12-bbc-launch-plan.md §3 / Week 3:
//   - valid sig creates proposal
//   - bad sig → 401 + DLQ reason='invalid_signature'
//   - stale ts → 401 + DLQ reason='expired_timestamp'
//   - >1MB → 413 + DLQ reason='oversized'
//   - mapping miss → DLQ reason='mapping_rejected'

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  _resetRateLimitForTests,
  applyMapping,
  checkRateLimit,
  computeSignature,
  MAX_BODY_BYTES,
  parseMapping,
  parseSignatureHeader,
  REPLAY_WINDOW_MS,
  resolvePath,
  safeEqualHex,
  timestampInWindow,
  verifyRequest,
  type WebhookMapping,
} from "./webhook-verify";

// --------------------------------------------------------------------------
// HMAC primitives
// --------------------------------------------------------------------------

describe("computeSignature + safeEqualHex", () => {
  it("computes a 64-char hex SHA-256 HMAC", () => {
    const sig = computeSignature("topsecret", "hello world");
    expect(sig).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is order-sensitive on body and secret", () => {
    const a = computeSignature("topsecret", "hello world");
    const b = computeSignature("topsecret", "hello worle");
    const c = computeSignature("topsecre", "hello world");
    expect(a).not.toBe(b);
    expect(a).not.toBe(c);
  });

  it("safeEqualHex compares equal hex strings", () => {
    const a = computeSignature("k", "v");
    expect(safeEqualHex(a, a)).toBe(true);
  });

  it("safeEqualHex rejects mismatched length", () => {
    expect(safeEqualHex("aa", "bb")).toBe(false);
    expect(safeEqualHex("a".repeat(64), "b".repeat(63))).toBe(false);
  });

  it("safeEqualHex rejects non-hex input", () => {
    expect(safeEqualHex("g".repeat(64), "g".repeat(64))).toBe(false);
  });
});

describe("parseSignatureHeader", () => {
  it("strips the sha256= prefix and lowercases hex", () => {
    expect(parseSignatureHeader("sha256=" + "A".repeat(64))).toBe("a".repeat(64));
  });

  it("rejects missing prefix", () => {
    expect(parseSignatureHeader("a".repeat(64))).toBeNull();
  });

  it("rejects wrong-length hex", () => {
    expect(parseSignatureHeader("sha256=" + "a".repeat(63))).toBeNull();
  });

  it("rejects non-hex chars", () => {
    expect(parseSignatureHeader("sha256=" + "g".repeat(64))).toBeNull();
  });

  it("handles null + empty", () => {
    expect(parseSignatureHeader(null)).toBeNull();
    expect(parseSignatureHeader("")).toBeNull();
    expect(parseSignatureHeader(undefined)).toBeNull();
  });
});

describe("timestampInWindow", () => {
  const now = 1_700_000_000_000;
  it("accepts a timestamp inside the 5-min window", () => {
    expect(timestampInWindow(now - 4 * 60 * 1000, now)).toBe(true);
    expect(timestampInWindow(now + 4 * 60 * 1000, now)).toBe(true);
  });

  it("rejects a timestamp outside the 5-min window", () => {
    expect(timestampInWindow(now - REPLAY_WINDOW_MS - 1, now)).toBe(false);
    expect(timestampInWindow(now + REPLAY_WINDOW_MS + 1, now)).toBe(false);
  });

  it("rejects NaN / Infinity", () => {
    expect(timestampInWindow(Number.NaN, now)).toBe(false);
    expect(timestampInWindow(Number.POSITIVE_INFINITY, now)).toBe(false);
  });
});

// --------------------------------------------------------------------------
// verifyRequest — end-to-end
// --------------------------------------------------------------------------

function signedBody(secret: string, body: string, ts: number): string {
  return computeSignature(secret, `${ts}.${body}`);
}

describe("verifyRequest", () => {
  const SECRET = "shhh";
  const now = 1_700_000_000_000;
  const body = JSON.stringify({ id: "abc", title: "hello" });

  it("accepts a valid signed request", () => {
    const ts = now - 1_000;
    const sig = signedBody(SECRET, body, ts);
    const result = verifyRequest({
      raw_body: body,
      signature_header: `sha256=${sig}`,
      timestamp_header: String(ts),
      content_length: body.length,
      secret: SECRET,
      now_ms: now,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.body_json).toEqual({ id: "abc", title: "hello" });
    }
  });

  it("rejects bad signature with 401 + invalid_signature", () => {
    const ts = now;
    const wrongSig = signedBody(SECRET, body + "tampered", ts);
    const result = verifyRequest({
      raw_body: body,
      signature_header: `sha256=${wrongSig}`,
      timestamp_header: String(ts),
      content_length: body.length,
      secret: SECRET,
      now_ms: now,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("invalid_signature");
      expect(result.http_status).toBe(401);
    }
  });

  it("rejects missing signature with invalid_signature", () => {
    const result = verifyRequest({
      raw_body: body,
      signature_header: null,
      timestamp_header: String(now),
      content_length: body.length,
      secret: SECRET,
      now_ms: now,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("invalid_signature");
  });

  it("rejects stale timestamp with 401 + expired_timestamp", () => {
    const ts = now - REPLAY_WINDOW_MS - 1;
    const sig = signedBody(SECRET, body, ts);
    const result = verifyRequest({
      raw_body: body,
      signature_header: `sha256=${sig}`,
      timestamp_header: String(ts),
      content_length: body.length,
      secret: SECRET,
      now_ms: now,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("expired_timestamp");
      expect(result.http_status).toBe(401);
    }
  });

  it("rejects missing timestamp", () => {
    const sig = signedBody(SECRET, body, now);
    const result = verifyRequest({
      raw_body: body,
      signature_header: `sha256=${sig}`,
      timestamp_header: null,
      content_length: body.length,
      secret: SECRET,
      now_ms: now,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("expired_timestamp");
  });

  it("rejects oversized body via content-length (413)", () => {
    const result = verifyRequest({
      raw_body: "tiny",
      signature_header: `sha256=${"a".repeat(64)}`,
      timestamp_header: String(now),
      content_length: MAX_BODY_BYTES + 1,
      secret: SECRET,
      now_ms: now,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("oversized");
      expect(result.http_status).toBe(413);
    }
  });

  it("rejects oversized body via actual length (defense in depth)", () => {
    const big = Buffer.alloc(MAX_BODY_BYTES + 1, "x");
    const result = verifyRequest({
      raw_body: big,
      signature_header: `sha256=${"a".repeat(64)}`,
      timestamp_header: String(now),
      content_length: null,
      secret: SECRET,
      now_ms: now,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("oversized");
  });

  it("rejects malformed JSON with 400 + malformed_json", () => {
    const garbage = "{not json";
    const ts = now;
    const sig = signedBody(SECRET, garbage, ts);
    const result = verifyRequest({
      raw_body: garbage,
      signature_header: `sha256=${sig}`,
      timestamp_header: String(ts),
      content_length: garbage.length,
      secret: SECRET,
      now_ms: now,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("malformed_json");
      expect(result.http_status).toBe(400);
    }
  });

  it("signature is tied to the timestamp (rotating ts breaks the sig)", () => {
    const ts1 = now - 2_000;
    const ts2 = now;
    const sig = signedBody(SECRET, body, ts1);
    // Attacker swaps a stale-but-still-valid timestamp for the current one.
    const result = verifyRequest({
      raw_body: body,
      signature_header: `sha256=${sig}`,
      timestamp_header: String(ts2),
      content_length: body.length,
      secret: SECRET,
      now_ms: now,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("invalid_signature");
  });
});

// --------------------------------------------------------------------------
// resolvePath — JSONPath subset
// --------------------------------------------------------------------------

describe("resolvePath", () => {
  const obj = {
    id: "abc",
    nested: { title: "hello", count: 42 },
    items: [{ name: "first" }, { name: "second" }],
    null_val: null,
  };

  it("$ returns the whole object", () => {
    expect(resolvePath(obj, "$")).toBe(obj);
  });

  it("$.foo extracts a top-level property", () => {
    expect(resolvePath(obj, "$.id")).toBe("abc");
  });

  it("$.foo.bar walks into nested objects", () => {
    expect(resolvePath(obj, "$.nested.title")).toBe("hello");
    expect(resolvePath(obj, "$.nested.count")).toBe(42);
  });

  it("$.foo[N] indexes arrays", () => {
    expect(resolvePath(obj, "$.items[0].name")).toBe("first");
    expect(resolvePath(obj, "$.items[1].name")).toBe("second");
  });

  it("returns undefined for missing path", () => {
    expect(resolvePath(obj, "$.nope")).toBeUndefined();
    expect(resolvePath(obj, "$.items[99]")).toBeUndefined();
    expect(resolvePath(obj, "$.nested.nope")).toBeUndefined();
  });

  it("returns undefined for non-object descent", () => {
    expect(resolvePath(obj, "$.id.foo")).toBeUndefined();
    expect(resolvePath(obj, "$.null_val.x")).toBeUndefined();
  });

  it("returns undefined for malformed paths", () => {
    expect(resolvePath(obj, "")).toBeUndefined();
    expect(resolvePath(obj, "foo")).toBeUndefined();
    expect(resolvePath(obj, "$.items[")).toBeUndefined();
  });

  it("returns undefined for non-array numeric index", () => {
    expect(resolvePath(obj, "$.nested[0]")).toBeUndefined();
  });
});

// --------------------------------------------------------------------------
// parseMapping + applyMapping
// --------------------------------------------------------------------------

describe("parseMapping", () => {
  it("accepts the minimal valid mapping", () => {
    const m = parseMapping({ type: "note", title: "$.title", source_ref: "$.id" });
    expect(m).toEqual({ type: "note", title: "$.title", source_ref: "$.id", body: undefined });
  });

  it("rejects unknown supertag", () => {
    expect(parseMapping({ type: "garbage", title: "$.t", source_ref: "$.id" })).toBeNull();
  });

  it("rejects missing fields", () => {
    expect(parseMapping({ type: "note", title: "$.t" })).toBeNull();
    expect(parseMapping({ type: "note", source_ref: "$.id" })).toBeNull();
    expect(parseMapping({})).toBeNull();
  });

  it("rejects non-string paths", () => {
    expect(parseMapping({ type: "note", title: 42, source_ref: "$.id" })).toBeNull();
  });

  it("optionally accepts body", () => {
    const m = parseMapping({ type: "note", title: "$.t", source_ref: "$.id", body: "$.content" });
    expect(m?.body).toBe("$.content");
  });
});

describe("applyMapping", () => {
  const mapping: WebhookMapping = {
    type: "note",
    title: "$.title",
    source_ref: "$.id",
    body: "$.content",
  };

  it("builds a MemoryProposal from a valid payload", () => {
    const result = applyMapping({ id: "evt-1", title: "Hello", content: "Body text" }, mapping);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.proposal.type).toBe("note");
      expect(result.proposal.title).toBe("Hello");
      expect(result.proposal.body).toBe("Body text");
      expect(result.proposal.source_ref).toBe("webhook:evt-1");
      expect(result.proposal.fields.source_kind).toBe("webhook");
    }
  });

  it("returns mapping_rejected when title path doesn't resolve", () => {
    const result = applyMapping({ id: "evt-1" }, mapping);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("mapping_rejected");
      expect(result.http_status).toBe(400);
      expect(result.message).toContain("title");
    }
  });

  it("returns mapping_rejected when source_ref path doesn't resolve", () => {
    const result = applyMapping({ title: "Hello" }, mapping);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain("source_ref");
  });

  it("truncates title to 200 chars", () => {
    const longTitle = "x".repeat(300);
    const result = applyMapping({ id: "1", title: longTitle, content: "" }, mapping);
    if (result.ok) {
      expect(result.proposal.title.length).toBe(200);
    } else {
      throw new Error("expected ok");
    }
  });

  it("treats title as required even if it's a number in the payload", () => {
    const result = applyMapping({ id: "1", title: 42, content: "" }, mapping);
    expect(result.ok).toBe(false);
  });

  it("coerces non-string body to string", () => {
    const result = applyMapping({ id: "1", title: "Hi", content: 12345 }, mapping);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.proposal.body).toBe("12345");
  });

  it("uses empty body when body path is unset in mapping", () => {
    const noBody: WebhookMapping = { type: "note", title: "$.t", source_ref: "$.id" };
    const result = applyMapping({ id: "1", t: "Title" }, noBody);
    if (result.ok) expect(result.proposal.body).toBe("");
    else throw new Error("expected ok");
  });
});

// --------------------------------------------------------------------------
// Rate limit
// --------------------------------------------------------------------------

describe("checkRateLimit", () => {
  beforeEach(() => _resetRateLimitForTests());
  afterEach(() => _resetRateLimitForTests());

  it("allows up to 60 requests in a 60s window", () => {
    const now = 1_700_000_000_000;
    let exceeded = false;
    for (let i = 0; i < 60; i++) {
      exceeded = checkRateLimit("t1", now + i);
    }
    expect(exceeded).toBe(false);
  });

  it("blocks the 61st request in the same window", () => {
    const now = 1_700_000_000_000;
    for (let i = 0; i < 60; i++) checkRateLimit("t1", now + i);
    const exceeded = checkRateLimit("t1", now + 60);
    expect(exceeded).toBe(true);
  });

  it("recovers after 60 seconds", () => {
    const now = 1_700_000_000_000;
    for (let i = 0; i < 60; i++) checkRateLimit("t1", now + i);
    const exceeded = checkRateLimit("t1", now + 65_000);
    expect(exceeded).toBe(false);
  });

  it("buckets are per-tenant", () => {
    const now = 1_700_000_000_000;
    for (let i = 0; i < 60; i++) checkRateLimit("t1", now + i);
    // tenant 2 is fresh
    const exceeded = checkRateLimit("t2", now);
    expect(exceeded).toBe(false);
  });
});
