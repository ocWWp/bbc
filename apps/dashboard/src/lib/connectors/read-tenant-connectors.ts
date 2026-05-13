// v1.5 D-W3-6: read installed-connector state for the Library tab.
//
// Parallel to read-tenant-skills.ts — returns a map keyed on connector_id
// (the framework id like "github" / "webhook-generic" / "notion") so the
// Library page can overlay install status on top of the static CONNECTORS
// catalog in _data.ts.
//
// RLS narrows the SELECT to the caller's tenant via the supabase client;
// we don't filter by tenant_id explicitly to avoid drift.

import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

export type ConnectorStatus = "ok" | "error" | "partial" | "auth_expired" | "rate_limited";

export type InstalledConnector = {
  /** tenant_connectors.id (uuid) — used for re-auth deeplinks and webhook URLs. */
  row_id: string;
  /** Provider id (e.g., 'github', 'webhook-generic'). */
  connector_id: string;
  status: ConnectorStatus | null;
  last_sync_at: string | null;
  last_sync_error: string | null;
  installed_at: string;
};

type RawRow = {
  id: string;
  connector_id: string;
  last_sync_status: string | null;
  last_sync_at: string | null;
  last_sync_error: string | null;
  installed_at: string;
};

const KNOWN_STATUSES: ReadonlyArray<ConnectorStatus> = [
  "ok",
  "error",
  "partial",
  "auth_expired",
  "rate_limited",
];

export async function readTenantConnectors(supabase: SupabaseClient): Promise<Map<string, InstalledConnector>> {
  const { data, error } = await supabase
    .from("tenant_connectors")
    .select("id, connector_id, last_sync_status, last_sync_at, last_sync_error, installed_at")
    .eq("active", true)
    .is("uninstalled_at", null)
    .order("installed_at", { ascending: false });

  if (error || !data) return new Map();

  const out = new Map<string, InstalledConnector>();
  for (const raw of data as RawRow[]) {
    const status = raw.last_sync_status && (KNOWN_STATUSES as readonly string[]).includes(raw.last_sync_status)
      ? (raw.last_sync_status as ConnectorStatus)
      : null;
    // Most-recent install wins on the rare case that an old row is still active.
    if (out.has(raw.connector_id)) continue;
    out.set(raw.connector_id, {
      row_id: raw.id,
      connector_id: raw.connector_id,
      status,
      last_sync_at: raw.last_sync_at,
      last_sync_error: raw.last_sync_error,
      installed_at: raw.installed_at,
    });
  }
  return out;
}
