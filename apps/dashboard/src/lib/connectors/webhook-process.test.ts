// D-W3-4 integration tests for processWebhookRequest end-to-end.
//
// Covers the acceptance scenarios from docs/plans/2026-05-12-bbc-launch-plan.md §3:
//   - valid sig → memory_files row + 200
//   - bad sig → DLQ reason='invalid_signature' + 401
//   - stale ts → DLQ reason='expired_timestamp' + 401
//   - >1MB → DLQ reason='oversized' + 413
//   - mapping miss → DLQ reason='mapping_rejected' + 400

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { processWebhookRequest, type WebhookDb, type WebhookConnectorRow } from "./webhook-process";
import { computeSignature, MAX_BODY_BYTES, _resetRateLimitForTests } from "./webhook-verify";
import { createHash } from "node:crypto";
import type { MemoryProposal } from "./framework";

// --------------------------------------------------------------------------
// In-memory DB stub
// --------------------------------------------------------------------------

type DlqRow = {
  tenant_id: string;
  connector_id: string;
  reason: string;
  raw_body_sha256: string | null;
  payload: unknown | null;
};

function makeDb(connector: WebhookConnectorRow | null, opts: { existingRefs?: Iterable<string> } = {}): {
  db: WebhookDb;
  committed: MemoryProposal[];
  dlq: DlqRow[];
  patches: { status: string; error: string | null }[];
} {
  const committed: MemoryProposal[] = [];
  const dlq: DlqRow[] = [];
  const patches: { status: string; error: string | null }[] = [];
  const existing = new Set(opts.existingRefs ?? []);
  const db: WebhookDb = {
    async findConnector() {
      return connector;
    },
    async existingSourceRefs(_t, refs) {
      return new Set(refs.filter((r) => existing.has(r)));
    },
    async commitProposal(_t, _c, p) {
      committed.push(p);
      existing.add(p.source_ref);
    },
    async insertDeadLetter(row) {
      dlq.push(row);
    },
    async updateSyncState(_t, _c, patch) {
      patches.push({ status: patch.last_sync_status, error: patch.last_sync_error ?? null });
    },
  };
  return { db, committed, dlq, patches };
}

const SECRET = "wh_test_secret";
const now = 1_700_000_000_000;
const TENANT_ID = "11111111-1111-1111-1111-111111111111";
const CONNECTOR_ROW_ID = "22222222-2222-2222-2222-222222222222";

function activeConnector(mapping: Record<string, unknown> = defaultMapping()): WebhookConnectorRow {
  return {
    id: CONNECTOR_ROW_ID,
    tenant_id: TENANT_ID,
    mapping,
    secret: SECRET,
    active: true,
  };
}

function defaultMapping(): Record<string, unknown> {
  return { type: "note", title: "$.title", source_ref: "$.id", body: "$.content" };
}

function signedRequest(body: string, ts: number, secret = SECRET): { sig: string; body_sha: string } {
  return {
    sig: `sha256=${computeSignature(secret, `${ts}.${body}`)}`,
    body_sha: createHash("sha256").update(body).digest("hex"),
  };
}

beforeEach(() => _resetRateLimitForTests());
afterEach(() => _resetRateLimitForTests());

// --------------------------------------------------------------------------
// Happy path
// --------------------------------------------------------------------------

describe("processWebhookRequest — happy path", () => {
  it("valid sig + valid mapping commits a memory_files row and returns 200", async () => {
    const { db, committed, dlq, patches } = makeDb(activeConnector());
    const body = JSON.stringify({ id: "evt-1", title: "Deployment succeeded", content: "All good" });
    const { sig, body_sha } = signedRequest(body, now);

    const r = await processWebhookRequest({
      tenant_slug: "acme",
      webhook_id: CONNECTOR_ROW_ID,
      raw_body: body,
      signature_header: sig,
      timestamp_header: String(now),
      content_length: body.length,
      now_ms: now,
      body_sha256: body_sha,
      db,
    });

    expect(r.http_status).toBe(200);
    expect(r.body.ok).toBe(true);
    expect(committed).toHaveLength(1);
    expect(committed[0].title).toBe("Deployment succeeded");
    expect(committed[0].source_ref).toBe("webhook:evt-1");
    expect(committed[0].type).toBe("note");
    expect(dlq).toHaveLength(0);
    expect(patches.at(-1)?.status).toBe("ok");
  });

  it("emits the prefixed source_ref (matches the dedup query) (codex-flagged [P2])", async () => {
    // Regression: dedup queries memory_files.fields->>source_ref using
    // proposal.source_ref ('webhook:evt-1'). The route's commitProposal must
    // persist that prefixed key into fields.source_ref or duplicates slip past.
    const { db, committed } = makeDb(activeConnector());
    const body = JSON.stringify({ id: "evt-1", title: "Hi", content: "" });
    const { sig, body_sha } = signedRequest(body, now);
    await processWebhookRequest({
      tenant_slug: "acme",
      webhook_id: CONNECTOR_ROW_ID,
      raw_body: body,
      signature_header: sig,
      timestamp_header: String(now),
      content_length: body.length,
      now_ms: now,
      body_sha256: body_sha,
      db,
    });
    // Top-level dedup key is the prefixed form.
    expect(committed[0].source_ref).toBe("webhook:evt-1");
    // The route's commitProposal overrides fields.source_ref with the prefixed
    // key; this assertion lives at the route level (see route.test.ts when wired).
    // Here we verify applyMapping puts the *unprefixed* value in fields, which
    // is the connector-native ID — overridden at insert time.
    expect(committed[0].fields.source_ref).toBe("evt-1");
  });
});

// --------------------------------------------------------------------------
// Failure modes — each leaves a DLQ row with the right reason
// --------------------------------------------------------------------------

describe("processWebhookRequest — failure → DLQ", () => {
  const body = JSON.stringify({ id: "evt-1", title: "Hi", content: "ok" });
  const body_sha = createHash("sha256").update(body).digest("hex");

  it("bad signature → 401 + DLQ reason='invalid_signature'", async () => {
    const { db, committed, dlq } = makeDb(activeConnector());
    const r = await processWebhookRequest({
      tenant_slug: "acme",
      webhook_id: CONNECTOR_ROW_ID,
      raw_body: body,
      signature_header: `sha256=${"f".repeat(64)}`,
      timestamp_header: String(now),
      content_length: body.length,
      now_ms: now,
      body_sha256: body_sha,
      db,
    });
    expect(r.http_status).toBe(401);
    expect(r.body.error).toBe("invalid_signature");
    expect(committed).toHaveLength(0);
    expect(dlq).toHaveLength(1);
    expect(dlq[0].reason).toBe("invalid_signature");
    expect(dlq[0].raw_body_sha256).toBe(body_sha);
  });

  it("stale timestamp → 401 + DLQ reason='expired_timestamp'", async () => {
    const { db, committed, dlq } = makeDb(activeConnector());
    const ts = now - 6 * 60 * 1000; // 6 min ago
    const { sig } = signedRequest(body, ts);
    const r = await processWebhookRequest({
      tenant_slug: "acme",
      webhook_id: CONNECTOR_ROW_ID,
      raw_body: body,
      signature_header: sig,
      timestamp_header: String(ts),
      content_length: body.length,
      now_ms: now,
      body_sha256: body_sha,
      db,
    });
    expect(r.http_status).toBe(401);
    expect(r.body.error).toBe("expired_timestamp");
    expect(committed).toHaveLength(0);
    expect(dlq[0].reason).toBe("expired_timestamp");
  });

  it("oversized via content-length → 413 + DLQ reason='oversized'", async () => {
    const { db, dlq } = makeDb(activeConnector());
    const r = await processWebhookRequest({
      tenant_slug: "acme",
      webhook_id: CONNECTOR_ROW_ID,
      raw_body: "tiny",
      signature_header: `sha256=${"a".repeat(64)}`,
      timestamp_header: String(now),
      content_length: MAX_BODY_BYTES + 1,
      now_ms: now,
      body_sha256: body_sha,
      db,
    });
    expect(r.http_status).toBe(413);
    expect(r.body.error).toBe("oversized");
    expect(dlq[0].reason).toBe("oversized");
  });

  it("mapping config malformed → 400 + DLQ reason='mapping_rejected'", async () => {
    const bad = activeConnector({ type: "note", title: "$.title" }); // missing source_ref
    const { db, committed, dlq } = makeDb(bad);
    const { sig } = signedRequest(body, now);
    const r = await processWebhookRequest({
      tenant_slug: "acme",
      webhook_id: CONNECTOR_ROW_ID,
      raw_body: body,
      signature_header: sig,
      timestamp_header: String(now),
      content_length: body.length,
      now_ms: now,
      body_sha256: body_sha,
      db,
    });
    expect(r.http_status).toBe(400);
    expect(r.body.error).toBe("mapping_rejected");
    expect(committed).toHaveLength(0);
    expect(dlq[0].reason).toBe("mapping_rejected");
  });

  it("payload doesn't match mapping JSONPaths → 400 + DLQ + payload preserved", async () => {
    const { db, committed, dlq } = makeDb(activeConnector());
    const missing = JSON.stringify({ id: "evt-1", nope: "no title here" });
    const { sig } = signedRequest(missing, now);
    const r = await processWebhookRequest({
      tenant_slug: "acme",
      webhook_id: CONNECTOR_ROW_ID,
      raw_body: missing,
      signature_header: sig,
      timestamp_header: String(now),
      content_length: missing.length,
      now_ms: now,
      body_sha256: body_sha,
      db,
    });
    expect(r.http_status).toBe(400);
    expect(committed).toHaveLength(0);
    expect(dlq[0].reason).toBe("mapping_rejected");
    // Payload is preserved on mapping_rejected so the user can debug.
    expect(dlq[0].payload).toEqual({ id: "evt-1", nope: "no title here" });
  });
});

// --------------------------------------------------------------------------
// Edge cases
// --------------------------------------------------------------------------

describe("processWebhookRequest — edge cases", () => {
  it("unknown tenant/webhook returns 404 and writes NO DLQ row", async () => {
    const { db, dlq } = makeDb(null);
    const r = await processWebhookRequest({
      tenant_slug: "nope",
      webhook_id: "missing",
      raw_body: "{}",
      signature_header: null,
      timestamp_header: null,
      content_length: 2,
      now_ms: now,
      body_sha256: "x",
      db,
    });
    expect(r.http_status).toBe(404);
    expect(dlq).toHaveLength(0);
  });

  it("inactive connector returns 404 (uninstalled cleanup)", async () => {
    const inactive = { ...activeConnector(), active: false };
    const { db, dlq } = makeDb(inactive);
    const r = await processWebhookRequest({
      tenant_slug: "acme",
      webhook_id: CONNECTOR_ROW_ID,
      raw_body: "{}",
      signature_header: null,
      timestamp_header: null,
      content_length: 2,
      now_ms: now,
      body_sha256: "x",
      db,
    });
    expect(r.http_status).toBe(404);
    expect(dlq).toHaveLength(0);
  });

  it("re-delivering the same event (same source_ref) is a 200 dedup no-op", async () => {
    const { db, committed, dlq } = makeDb(activeConnector(), {
      existingRefs: ["webhook:evt-1"],
    });
    const body = JSON.stringify({ id: "evt-1", title: "Hi", content: "" });
    const body_sha = createHash("sha256").update(body).digest("hex");
    const { sig } = signedRequest(body, now);
    const r = await processWebhookRequest({
      tenant_slug: "acme",
      webhook_id: CONNECTOR_ROW_ID,
      raw_body: body,
      signature_header: sig,
      timestamp_header: String(now),
      content_length: body.length,
      now_ms: now,
      body_sha256: body_sha,
      db,
    });
    expect(r.http_status).toBe(200);
    expect(r.body.deduped).toBe(true);
    expect(committed).toHaveLength(0);
    expect(dlq).toHaveLength(0);
  });

  it("rate-limit overflow → 429 + DLQ reason='rate_limited' (codex defensible)", async () => {
    const { db, dlq, committed } = makeDb(activeConnector());
    const body = JSON.stringify({ id: "evt-x", title: "Hi", content: "" });
    const body_sha = createHash("sha256").update(body).digest("hex");
    // Pre-fill: 60 valid requests in the window
    for (let i = 0; i < 60; i++) {
      const { sig } = signedRequest(body, now + i);
      await processWebhookRequest({
        tenant_slug: "acme",
        webhook_id: CONNECTOR_ROW_ID,
        raw_body: body,
        signature_header: sig,
        timestamp_header: String(now + i),
        content_length: body.length,
        now_ms: now + i,
        body_sha256: body_sha,
        db,
      });
    }
    // 61st should be rate-limited
    const { sig } = signedRequest(body, now + 60);
    const r = await processWebhookRequest({
      tenant_slug: "acme",
      webhook_id: CONNECTOR_ROW_ID,
      raw_body: body,
      signature_header: sig,
      timestamp_header: String(now + 60),
      content_length: body.length,
      now_ms: now + 60,
      body_sha256: body_sha,
      db,
    });
    expect(r.http_status).toBe(429);
    expect(r.body.error).toBe("rate_limited");
    expect(dlq.some((d) => d.reason === "rate_limited")).toBe(true);
    // The first request committed; subsequent ones were dedup'd by source_ref.
    expect(committed.length).toBeGreaterThanOrEqual(1);
  });
});
