// D-W6-4 tests for the admin /library/diagnostics reader.

import { describe, expect, it } from "vitest";
import { readDiagnostics } from "./read-diagnostics";
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
      const builder = {
        select: () => Promise.resolve({ data: opts.dlq ?? null, error: opts.dlqErr ?? null }),
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
