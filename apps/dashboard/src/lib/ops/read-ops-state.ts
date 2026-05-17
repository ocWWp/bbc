// /ops aggregator. Reads all data sources used by the cockpit page in one
// place so the page component stays declarative. Every field maps to a row
// or section in docs/plans/2026-05-17-ops-page-design.md.
//
// Mode duality (see ADR-0004):
//   - Queue reads (pending proposals) go through getStore() so file-mode
//     users still get the cockpit; the store backend is LocalStore
//     (markdown files under queue/) or SupabaseStore (DB).
//   - Memory / providers / connectors / DLQ and last-accepted timestamp
//     are DB-mode-only — those queries hit Supabase directly. In file-mode
//     they error and the section renders as "unavailable" (honest:
//     file-mode genuinely doesn't track this state). The Queue snapshot
//     section keeps working because its pending count comes from the store.

import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { isApproved } from "@/lib/read-queue";
import type { Proposal, Store } from "@bbc/store";

export type OpsPendingProposal = {
  proposal_id: string;   // queue_items.proposal_id / queue/<slug>.md basename
  change_kind: string;
  summary: string;       // proposal.diff_summary
  target_file: string;
  target_layer: string;
  /** Whether the operator may click Accept on this proposal. Mirrors the
   *  /queue/[id] page rule: manager_review.verdict === "approved". The page
   *  used to pass {true} unconditionally, bypassing the manager-review gate
   *  the codepath was designed for. */
  canAccept: boolean;
};

export type OpsSnapshot = {
  queue: { pending: number; lastAcceptedAt: string | null };
  memory: { files: number; lastUpdatedAt: string | null };
  /** lastConfiguredAt = max(external_accounts.created_at). Renamed from
   *  lastTestedAt: the underlying table has no last_tested_at column (see
   *  migration 0025), only created_at + revoked_at. The page renders this
   *  as "last configured" so users aren't misled into thinking BBC actively
   *  health-checks their keys. */
  providers: { configured: number; lastConfiguredAt: string | null };
  ingest: { connectors: number; lastSyncAt: string | null };
};

export type OpsAttention = {
  pendingProposals: OpsPendingProposal[];
  /** True count of pending proposals in the store. `pendingProposals` above
   *  is capped at 20 for inline display; the header pill, "X pending" label,
   *  and "N more not shown" footer must use this honest total so a tenant
   *  with 30 pending doesn't read as "20 open". */
  pendingTotal: number;
  missingProviderKeys: string[]; // provider names expected by bindings.yaml but missing in external_accounts
  failedConnectors: { connector_id: string; status: string }[]; // last_sync_status in {error, auth_expired}
  dlqCount: number;              // admin section only; 0 for non-admin callers
};

export type OpsState = {
  attention: OpsAttention;
  snapshot: OpsSnapshot;
  /** Sections whose underlying queries errored. The page should render an
   *  "unavailable" treatment for these instead of trusting zero counts /
   *  empty arrays — a confident "0 pending" rendered because the query
   *  blew up is the [[feedback-no-placeholders]] failure mode. */
  degraded: {
    pendingProposals: boolean;
    lastAcceptedAt: boolean;
    memory: boolean;
    providers: boolean;
    ingest: boolean;
    failedConnectors: boolean;
    dlq: boolean;
  };
};

export async function readOpsState(
  supabase: SupabaseClient,
  options: { tenantId: string; isAdmin: boolean; expectedProviders: string[] },
  store: Pick<Store, "queue">,
): Promise<OpsState> {
  const { tenantId, isAdmin, expectedProviders } = options;

  // Queue pending — via the storage abstraction so file-mode users get the
  // cockpit. Catch errors so a store outage degrades gracefully instead of
  // taking down the page.
  const pendingResult = await store.queue
    .list("pending")
    .then((rows: Proposal[]) => ({ ok: true as const, rows }))
    .catch((_err: unknown) => ({ ok: false as const, rows: [] as Proposal[] }));

  const [
    lastAcceptedRes,
    memoryCountRes,
    memoryLastRes,
    extAcctRes,
    extAcctLastConfRes,
    connectorsRes,
    connectorsLastSyncRes,
    failedConnectorsRes,
    dlqCountRes,
  ] = await Promise.all([
    supabase
      .from("queue_items")
      .select("resolved_at")
      .eq("tenant_id", tenantId)
      .eq("status", "accepted")
      .order("resolved_at", { ascending: false })
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
    // External accounts: only count rows that represent actually-usable BYOK
    // secrets — exclude revoked credentials (status='revoked' per migration
    // 0025's external_account_status enum) and OAuth/connection-string rows
    // (kind != 'api_key' per the external_account_kind enum). Without these
    // filters, /ops would over-count "configured" and miss a freshly-revoked
    // key as "still present", lying to the operator either way.
    supabase
      .from("external_accounts")
      .select("provider_id", { count: "exact" })
      .eq("tenant_id", tenantId)
      .eq("status", "active")
      .eq("kind", "api_key"),
    supabase
      .from("external_accounts")
      .select("created_at")
      .eq("tenant_id", tenantId)
      .eq("status", "active")
      .eq("kind", "api_key")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("tenant_connectors")
      .select("connector_id, last_sync_status", { count: "exact" })
      .eq("tenant_id", tenantId)
      .eq("active", true)
      .is("uninstalled_at", null),
    // last_sync_at is nullable for newly-installed-never-synced rows; Postgres
    // sorts NULLs first by default in DESC order, so without `nullsFirst:
    // false` a never-synced connector wins the row even when other connectors
    // synced recently — the snapshot would always read "last sync never".
    supabase
      .from("tenant_connectors")
      .select("last_sync_at")
      .eq("tenant_id", tenantId)
      .eq("active", true)
      .is("uninstalled_at", null)
      .order("last_sync_at", { ascending: false, nullsFirst: false })
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

  const pendingRows = pendingResult.rows;
  // Cap at 20 to match the page's display limit; the snapshot count below
  // reflects the full pending tally.
  const pendingProposals: OpsPendingProposal[] = pendingRows.slice(0, 20).map(
    (p) => ({
      proposal_id: p.proposal_id,
      change_kind: p.change_kind ?? "edit",
      summary: p.diff_summary ?? "",
      target_file: p.target_file ?? "",
      // Default to "" (not "main") — Main-layer accepts have stricter
      // governance per CLAUDE.md lock matrix, so we never invent that
      // label. Page should surface "—" / "unknown" for empty values so the
      // operator inspects the proposal before clicking accept.
      target_layer: p.target_layer ?? "",
      // Manager-review gate: only proposals approved by the manager can be
      // accepted inline. Mirrors lib/read-queue.isApproved + the /queue/[id]
      // detail page.
      canAccept: isApproved(p),
    }),
  );

  const presentProviders = new Set(
    ((extAcctRes.data ?? []) as { provider_id: string }[]).map(
      (r) => r.provider_id,
    ),
  );
  const missingProviderKeys = expectedProviders.filter(
    (p) => !presentProviders.has(p),
  );

  const failedConnectors = (failedConnectorsRes.data ?? []) as {
    connector_id: string;
    last_sync_status: string;
  }[];

  return {
    attention: {
      pendingProposals,
      // Honest total for header pill + "X pending" label + truncation footer.
      // `pendingProposals` above is sliced to 20 for inline display; the
      // store returns the full list so a tenant with 30 pending reads as
      // "30 open" in the header even though only 20 rows render below.
      pendingTotal: pendingRows.length,
      missingProviderKeys,
      failedConnectors: failedConnectors.map((c) => ({
        connector_id: c.connector_id,
        status: c.last_sync_status,
      })),
      dlqCount: dlqCountRes.count ?? 0,
    },
    snapshot: {
      queue: {
        pending: pendingRows.length,
        lastAcceptedAt: (lastAcceptedRes.data as { resolved_at: string } | null)
          ?.resolved_at ?? null,
      },
      memory: {
        files: memoryCountRes.count ?? 0,
        lastUpdatedAt: (memoryLastRes.data as { updated_at: string } | null)
          ?.updated_at ?? null,
      },
      providers: {
        configured: extAcctRes.count ?? 0,
        lastConfiguredAt:
          (extAcctLastConfRes.data as { created_at: string } | null)
            ?.created_at ?? null,
      },
      ingest: {
        connectors: connectorsRes.count ?? 0,
        lastSyncAt:
          (connectorsLastSyncRes.data as { last_sync_at: string } | null)
            ?.last_sync_at ?? null,
      },
    },
    degraded: {
      pendingProposals: !pendingResult.ok,
      lastAcceptedAt: lastAcceptedRes.error != null,
      // Both memory queries (count + last-updated) feed the same section;
      // either error degrades it.
      memory: memoryCountRes.error != null || memoryLastRes.error != null,
      providers:
        extAcctRes.error != null || extAcctLastConfRes.error != null,
      ingest:
        connectorsRes.error != null || connectorsLastSyncRes.error != null,
      failedConnectors: failedConnectorsRes.error != null,
      // dlq: the non-admin Promise.resolve path is an intentional skip
      // (error: null), so this stays false unless an admin query actually
      // errored.
      dlq: dlqCountRes.error != null,
    },
  };
}
