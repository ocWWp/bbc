// /ops aggregator. Reads all data sources used by the cockpit page in one
// place so the page component stays declarative. Every field maps to a row
// or section in docs/plans/2026-05-17-ops-page-design.md.

import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

export type OpsPendingProposal = {
  id: string;            // queue_items.id (uuid)
  proposal_id: string;   // queue_items.proposal_id (text slug)
  change_kind: string;
  summary: string;       // frontmatter.diff_summary
  target_file: string;   // frontmatter.target_file
  target_layer: string;  // frontmatter.target_layer
  created_at: string;
};

export type OpsSnapshot = {
  queue: { pending: number; lastAcceptedAt: string | null };
  memory: { files: number; lastUpdatedAt: string | null };
  providers: { configured: number; lastTestedAt: string | null };
  ingest: { connectors: number; lastSyncAt: string | null };
};

export type OpsAttention = {
  pendingProposals: OpsPendingProposal[];
  missingProviderKeys: string[]; // provider names expected by bindings.yaml but missing in external_accounts
  failedConnectors: { connector_id: string; status: string }[]; // last_sync_status in {error, auth_expired}
  dlqCount: number;              // admin section only; 0 for non-admin callers
};

export type OpsState = {
  attention: OpsAttention;
  snapshot: OpsSnapshot;
};

export async function readOpsState(
  supabase: SupabaseClient,
  options: { tenantId: string; isAdmin: boolean; expectedProviders: string[] }
): Promise<OpsState> {
  void supabase;
  void options;
  throw new Error("not implemented");
}
