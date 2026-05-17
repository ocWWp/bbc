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
  const { tenantId, isAdmin, expectedProviders } = options;

  const [
    pendingRes,
    lastAcceptedRes,
    memoryCountRes,
    memoryLastRes,
    extAcctRes,
    extAcctLastTestRes,
    connectorsRes,
    connectorsLastSyncRes,
    failedConnectorsRes,
    dlqCountRes,
  ] = await Promise.all([
    supabase
      .from("queue_items")
      .select("id, proposal_id, frontmatter, created_at", { count: "exact" })
      .eq("tenant_id", tenantId)
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("queue_items")
      .select("updated_at")
      .eq("tenant_id", tenantId)
      .eq("status", "accepted")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("memory_files")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId),
    supabase
      .from("memory_files")
      .select("updated_at")
      .eq("tenant_id", tenantId)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("external_accounts")
      .select("provider", { count: "exact" })
      .eq("tenant_id", tenantId),
    supabase
      .from("external_accounts")
      .select("last_tested_at")
      .eq("tenant_id", tenantId)
      .order("last_tested_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("tenant_connectors")
      .select("connector_id, last_sync_status", { count: "exact" })
      .eq("tenant_id", tenantId)
      .eq("active", true)
      .is("uninstalled_at", null),
    supabase
      .from("tenant_connectors")
      .select("last_sync_at")
      .eq("tenant_id", tenantId)
      .eq("active", true)
      .is("uninstalled_at", null)
      .order("last_sync_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("tenant_connectors")
      .select("connector_id, last_sync_status")
      .eq("tenant_id", tenantId)
      .eq("active", true)
      .is("uninstalled_at", null)
      .in("last_sync_status", ["error", "auth_expired"]),
    isAdmin
      ? supabase
          .from("webhook_dead_letters")
          .select("id", { count: "exact", head: true })
          .eq("tenant_id", tenantId)
      : Promise.resolve({ count: 0, error: null, data: null }),
  ]);

  type ProposalRow = {
    id: string;
    proposal_id: string;
    frontmatter: Record<string, unknown> | null;
    created_at: string;
  };

  const pendingProposals: OpsPendingProposal[] = (pendingRes.data ?? []).map(
    (r: ProposalRow) => {
      const fm = r.frontmatter ?? {};
      const get = (k: string, fallback = "") => {
        const v = (fm as Record<string, unknown>)[k];
        return typeof v === "string" ? v : fallback;
      };
      return {
        id: r.id,
        proposal_id: r.proposal_id,
        change_kind: get("change_kind", "edit"),
        summary: get("diff_summary"),
        target_file: get("target_file"),
        target_layer: get("target_layer", "main"),
        created_at: r.created_at,
      };
    }
  );

  const presentProviders = new Set(
    ((extAcctRes.data ?? []) as { provider: string }[]).map((r) => r.provider)
  );
  const missingProviderKeys = expectedProviders.filter(
    (p) => !presentProviders.has(p)
  );

  const failedConnectors = (failedConnectorsRes.data ?? []) as {
    connector_id: string;
    last_sync_status: string;
  }[];

  return {
    attention: {
      pendingProposals,
      missingProviderKeys,
      failedConnectors: failedConnectors.map((c) => ({
        connector_id: c.connector_id,
        status: c.last_sync_status,
      })),
      dlqCount: dlqCountRes.count ?? 0,
    },
    snapshot: {
      queue: {
        pending: pendingRes.count ?? 0,
        lastAcceptedAt: (lastAcceptedRes.data as { updated_at: string } | null)
          ?.updated_at ?? null,
      },
      memory: {
        files: memoryCountRes.count ?? 0,
        lastUpdatedAt: (memoryLastRes.data as { updated_at: string } | null)
          ?.updated_at ?? null,
      },
      providers: {
        configured: extAcctRes.count ?? 0,
        lastTestedAt: (extAcctLastTestRes.data as { last_tested_at: string } | null)
          ?.last_tested_at ?? null,
      },
      ingest: {
        connectors: connectorsRes.count ?? 0,
        lastSyncAt: (connectorsLastSyncRes.data as { last_sync_at: string } | null)
          ?.last_sync_at ?? null,
      },
    },
  };
}
