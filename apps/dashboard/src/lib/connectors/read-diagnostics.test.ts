// D-W6-4 tests for the admin /library/diagnostics reader.

import { describe, expect, it } from "vitest";
import { computeHealthBuckets, readDiagnostics, type DiagnosticsRow } from "./read-diagnostics";
import type { SupabaseClient } from "@supabase/supabase-js";

type ConnectorRow = {
  id: string;
  connector_id: string;
  installed_at: string;
  last_sync_at: string | null;
  last_sync_status: string | null;
  last_sync_error: string | null;
};

type DlqRow = { connector_id: string; reason: string };

function fakeSupabase(opts: {
  connectors?: ConnectorRow[] | null;
  connectorsErr?: unknown;
  dlq?: DlqRow[] | null;
  dlqErr?: unknown;
}): SupabaseClient {
  const from = (table: string) => {
    if (table === "tenant_connectors") {
      const builder = {
        select: () => builder,
        eq: () => builder,
        is: () => builder,
        order: () => Promise.resolve({ data: opts.connectors ?? null, error: opts.connectorsErr ?? null }),
      };
      return builder;
    }
    if (table === "webhook_dead_letters") {
      // Mirror PostgREST pagination: .select(...).range(lo, hi) returns the
      // slice [lo..hi] of opts.dlq. The reader pages in 1000-row strides
      // until a short page comes back.
      const builder = {
        select: () => ({
          range: (lo: number, hi: number) => {
            if (opts.dlqErr) return Promise.resolve({ data: null, error: opts.dlqErr });
            const all = opts.dlq ?? [];
            return Promise.resolve({ data: all.slice(lo, hi + 1), error: null });
          },
        }),
      };
      return builder;
    }
    throw new Error(`unexpected table ${table}`);
  };
  return { from } as unknown as SupabaseClient;
}

const sampleConnector = (over: Partial<ConnectorRow> = {}): ConnectorRow => ({
  id: "row-webhook-1",
  connector_id: "webhook-generic",
  installed_at: "2026-05-01T00:00:00Z",
  last_sync_at: "2026-05-12T12:00:00Z",
  last_sync_status: "ok",
  last_sync_error: null,
  ...over,
});

describe("readDiagnostics", () => {
  it("returns an empty diagnostics on connector DB error", async () => {
    const out = await readDiagnostics(fakeSupabase({ connectors: null, connectorsErr: new Error("boom") }));
    expect(out.connectors).toEqual([]);
    expect(out.total_dlq).toBe(0);
    expect(out.dlq_by_reason.invalid_signature).toBe(0);
  });

  it("returns connectors with 0 dlq counts when DLQ table is empty", async () => {
    const out = await readDiagnostics(
      fakeSupabase({
        connectors: [sampleConnector({ id: "row-1", connector_id: "github" })],
        dlq: [],
      }),
    );
    expect(out.connectors).toEqual([
      expect.objectContaining({ row_id: "row-1", connector_id: "github", dlq_count: 0 }),
    ]);
    expect(out.total_dlq).toBe(0);
  });

  it("aggregates DLQ counts per connector_id (matches tenant_connectors.id)", async () => {
    const out = await readDiagnostics(
      fakeSupabase({
        connectors: [
          sampleConnector({ id: "row-webhook-1", connector_id: "webhook-generic" }),
          sampleConnector({ id: "row-github-1", connector_id: "github" }),
        ],
        dlq: [
          { connector_id: "row-webhook-1", reason: "invalid_signature" },
          { connector_id: "row-webhook-1", reason: "invalid_signature" },
          { connector_id: "row-webhook-1", reason: "oversized" },
        ],
      }),
    );
    const byId = Object.fromEntries(out.connectors.map((c) => [c.row_id, c]));
    expect(byId["row-webhook-1"].dlq_count).toBe(3);
    expect(byId["row-github-1"].dlq_count).toBe(0);
    expect(out.total_dlq).toBe(3);
    expect(out.dlq_by_reason.invalid_signature).toBe(2);
    expect(out.dlq_by_reason.oversized).toBe(1);
  });

  it("ignores unknown DLQ reasons in the by-reason aggregate but still counts toward total", async () => {
    const out = await readDiagnostics(
      fakeSupabase({
        connectors: [sampleConnector({ id: "row-1" })],
        dlq: [
          { connector_id: "row-1", reason: "rate_limited" },
          { connector_id: "row-1", reason: "definitely_not_a_reason" },
        ],
      }),
    );
    expect(out.total_dlq).toBe(2);
    expect(out.dlq_by_reason.rate_limited).toBe(1);
  });

  it("pages past the PostgREST 1000-row default to count all DLQ rows (codex [P2])", async () => {
    // 2,500 DLQ rows: more than 2 full pages + a partial third.
    const big: DlqRow[] = [];
    for (let i = 0; i < 2_500; i++) {
      big.push({ connector_id: "row-1", reason: i % 2 === 0 ? "invalid_signature" : "rate_limited" });
    }
    const out = await readDiagnostics(
      fakeSupabase({ connectors: [sampleConnector({ id: "row-1" })], dlq: big }),
    );
    expect(out.total_dlq).toBe(2_500);
    expect(out.dlq_by_reason.invalid_signature).toBe(1_250);
    expect(out.dlq_by_reason.rate_limited).toBe(1_250);
    expect(out.connectors[0].dlq_count).toBe(2_500);
  });

  it("treats DLQ DB error as no-DLQ-rows (connectors still returned)", async () => {
    const out = await readDiagnostics(
      fakeSupabase({
        connectors: [sampleConnector({ id: "row-1", connector_id: "github" })],
        dlq: null,
        dlqErr: new Error("rls blocked"),
      }),
    );
    expect(out.connectors).toHaveLength(1);
    expect(out.total_dlq).toBe(0);
  });
});

const mkRow = (last_sync_status: string | null): DiagnosticsRow => ({
  row_id: "r" + Math.random(),
  connector_id: "github",
  installed_at: "2026-01-01T00:00:00Z",
  last_sync_at: null,
  last_sync_status,
  last_sync_error: null,
  dlq_count: 0,
});

describe("computeHealthBuckets", () => {
  it("counts ok as healthy", () => {
    const b = computeHealthBuckets([mkRow("ok"), mkRow("ok")]);
    expect(b).toEqual({ healthy: 2, needs_attention: 0, never_synced: 0 });
  });

  it("counts auth_expired, error, partial, rate_limited as needs_attention", () => {
    const b = computeHealthBuckets([
      mkRow("auth_expired"),
      mkRow("error"),
      mkRow("partial"),
      mkRow("rate_limited"),
    ]);
    expect(b).toEqual({ healthy: 0, needs_attention: 4, never_synced: 0 });
  });

  it("counts null last_sync_status as never_synced", () => {
    const b = computeHealthBuckets([mkRow(null), mkRow(null)]);
    expect(b).toEqual({ healthy: 0, needs_attention: 0, never_synced: 2 });
  });

  it("handles empty input", () => {
    expect(computeHealthBuckets([])).toEqual({ healthy: 0, needs_attention: 0, never_synced: 0 });
  });

  it("classifies a mixed fleet", () => {
    const b = computeHealthBuckets([
      mkRow("ok"), mkRow("ok"), mkRow("ok"),
      mkRow("auth_expired"),
      mkRow(null),
    ]);
    expect(b).toEqual({ healthy: 3, needs_attention: 1, never_synced: 1 });
  });
});
