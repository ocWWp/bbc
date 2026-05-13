// v1.5 D-W6-4: backing reader for the admin /library/diagnostics page.
//
// Aggregates per-connector sync state with DLQ counts (webhook_dead_letters)
// in a single trip. RLS narrows both queries to the caller's tenant; admin
// gate is enforced at the route, not here.

import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

export type DiagnosticsRow = {
  /** tenant_connectors.id (uuid). */
  row_id: string;
  /** Provider id, e.g. "github", "notion", "webhook-generic", "gmail", "drive". */
  connector_id: string;
  installed_at: string;
  last_sync_at: string | null;
  last_sync_status: string | null;
  last_sync_error: string | null;
  /** Count of webhook_dead_letters rows linked to this connector row. 0 for
   *  non-webhook connectors (the DLQ table is webhook-only). */
  dlq_count: number;
};

export type DiagnosticsReason =
  | "invalid_signature"
  | "expired_timestamp"
  | "oversized"
  | "mapping_rejected"
  | "malformed_json"
  | "rate_limited";

export type Diagnostics = {
  connectors: DiagnosticsRow[];
  /** Tenant-wide DLQ counts grouped by reason — useful as a sanity column on
   *  the page header even before drilling into a specific connector. */
  dlq_by_reason: Record<DiagnosticsReason, number>;
  total_dlq: number;
};

type ConnectorRaw = {
  id: string;
  connector_id: string;
  installed_at: string;
  last_sync_at: string | null;
  last_sync_status: string | null;
  last_sync_error: string | null;
};

type DlqRaw = {
  connector_id: string;
  reason: DiagnosticsReason | string;
};

export async function readDiagnostics(supabase: SupabaseClient): Promise<Diagnostics> {
  const empty: Diagnostics = {
    connectors: [],
    dlq_by_reason: emptyReasonCounts(),
    total_dlq: 0,
  };

  const { data: rawConnectors, error: connErr } = await supabase
    .from("tenant_connectors")
    .select("id, connector_id, installed_at, last_sync_at, last_sync_status, last_sync_error")
    .eq("active", true)
    .is("uninstalled_at", null)
    .order("installed_at", { ascending: false });
  if (connErr || !rawConnectors) return empty;

  // Fetch DLQ rows for THIS tenant (RLS narrows). We only need (connector_id,
  // reason) to compute the two aggregates; the row body is intentionally
  // excluded — there can be thousands.
  //
  // Codex [P2]: an unbounded select silently caps at the PostgREST
  // max_rows (default 1000), so totals + per-reason counts would
  // under-report on a noisy tenant exactly when the diagnostics page is
  // most useful. Page through with .range() until we get a short page.
  const dlqByConnector = new Map<string, number>();
  const dlqByReason: Record<DiagnosticsReason, number> = emptyReasonCounts();
  let total = 0;
  const PAGE = 1_000;
  for (let offset = 0; ; offset += PAGE) {
    const { data: page, error: dlqErr } = await supabase
      .from("webhook_dead_letters")
      .select("connector_id, reason")
      .range(offset, offset + PAGE - 1);
    if (dlqErr || !Array.isArray(page)) break;
    for (const row of page as DlqRaw[]) {
      dlqByConnector.set(row.connector_id, (dlqByConnector.get(row.connector_id) ?? 0) + 1);
      if (isKnownReason(row.reason)) {
        dlqByReason[row.reason]++;
      }
      total++;
    }
    if (page.length < PAGE) break;
  }

  const connectors: DiagnosticsRow[] = (rawConnectors as ConnectorRaw[]).map((c) => ({
    row_id: c.id,
    connector_id: c.connector_id,
    installed_at: c.installed_at,
    last_sync_at: c.last_sync_at,
    last_sync_status: c.last_sync_status,
    last_sync_error: c.last_sync_error,
    dlq_count: dlqByConnector.get(c.id) ?? 0,
  }));

  return { connectors, dlq_by_reason: dlqByReason, total_dlq: total };
}

function emptyReasonCounts(): Record<DiagnosticsReason, number> {
  return {
    invalid_signature: 0,
    expired_timestamp: 0,
    oversized: 0,
    mapping_rejected: 0,
    malformed_json: 0,
    rate_limited: 0,
  };
}

function isKnownReason(r: string): r is DiagnosticsReason {
  return (
    r === "invalid_signature" ||
    r === "expired_timestamp" ||
    r === "oversized" ||
    r === "mapping_rejected" ||
    r === "malformed_json" ||
    r === "rate_limited"
  );
}
