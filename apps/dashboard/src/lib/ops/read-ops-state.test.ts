// Tests for the /ops cockpit aggregator. Mirrors the fake-Supabase-client
// pattern from src/lib/connectors/read-diagnostics.test.ts but the /ops
// reader fans out queries across the storage abstraction (queue reads) and
// supabase (memory/providers/connectors/dlq) so the harness has to route
// by both. The store argument is injected by the tests; production code
// gets it from getStore() (see app/ops/page.tsx).

import { describe, expect, it } from "vitest";
import { readOpsState } from "./read-ops-state";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Proposal, ProposalStatus, Store } from "@bbc/store";

// ---------------------------------------------------------------------------
// Fake supabase harness
// ---------------------------------------------------------------------------
//
// Each table builds a chainable proxy. Terminal methods (`.maybeSingle()`,
// `.limit()` with a callback-style await, awaited builder) resolve to
// PostgREST-shaped { data, error, count } payloads. Routes inside a table
// are differentiated by the filters applied (status, last_sync_status, etc.)
// so each table-builder closes over multiple fixtures.

type QueueRow = {
  id: string;
  proposal_id: string;
  frontmatter: Record<string, unknown> | null;
  created_at: string;
  resolved_at?: string;
  status?: string;
};

type MemoryRow = { id: string; updated_at: string };
type ExternalAccountRow = { provider_id: string; created_at: string | null };
type ConnectorRow = {
  connector_id: string;
  last_sync_status: string | null;
  last_sync_at: string | null;
};
type DlqRow = { id: string };

type Fixtures = {
  /** Pending proposals — full Proposal shape so we can exercise canAccept. */
  pendingProposals?: Proposal[];
  /** Most recent accepted timestamp in DB-mode (queue_items.resolved_at).
   *  Tests can set to a string, null, or omit. */
  lastAcceptedAt?: string | null;
  acceptedRows?: QueueRow[];   // legacy fixture name — kept for tests that haven't migrated
  memory?: MemoryRow[];        // memory_files
  externalAccounts?: ExternalAccountRow[]; // external_accounts
  connectors?: ConnectorRow[]; // tenant_connectors active=true, uninstalled_at null
  dlq?: DlqRow[];              // webhook_dead_letters
  /** Force the queue store's list() to throw — exercises file-mode/DB-mode
   *  storage outages independently of supabase errors. */
  storeThrows?: boolean;
  /** Force a specific table's resolver to return a PostgREST error. The
   *  fake harness keys errors by table name; route inside a table is the
   *  same error for every query against that table. Mirrors what the real
   *  client does on network failure / schema-reload windows. */
  errors?: Partial<Record<
    | "queue_items"
    | "memory_files"
    | "external_accounts"
    | "tenant_connectors"
    | "webhook_dead_letters",
    { message: string }
  >>;
};

function fakeStore(fx: Fixtures): Store {
  return {
    queue: {
      async list(status: ProposalStatus): Promise<Proposal[]> {
        if (fx.storeThrows) throw new Error("store offline");
        if (status === "pending") return (fx.pendingProposals ?? []).slice();
        return [];
      },
      async listAll() {
        return { pending: fx.pendingProposals ?? [], accepted: [], rejected: [] };
      },
      async getById() { return null; },
      async fileProposal() { return { ok: false, output: "not used in /ops tests" }; },
      async acceptProposal() { return { ok: false, output: "not used in /ops tests" }; },
      async rejectProposal() { return { ok: false, output: "not used in /ops tests" }; },
    },
    log: {
      async list() { return []; },
      async lkg() { return 0; },
    },
    bindings: {
      async list() { return []; },
    },
    tools: {
      async list() { return []; },
      async resolveRole() { return null; },
      async candidatesFor() { return []; },
    },
  };
}

/** Build a pending Proposal with optional manager_review verdict. Frontmatter
 *  fields are echoed into the proposal so the page can display them. */
function makePending(opts: {
  proposal_id: string;
  diff_summary?: string;
  target_file?: string;
  target_layer?: string;
  change_kind?: string;
  proposed_at?: string;
  verdict?: "approved" | "needs_changes" | "rejected";
}): Proposal {
  return {
    proposal_id: opts.proposal_id,
    filename: `${opts.proposal_id}.md`,
    status: "pending",
    proposed_at: opts.proposed_at,
    target_layer: opts.target_layer,
    target_file: opts.target_file,
    change_kind: opts.change_kind,
    diff_summary: opts.diff_summary,
    manager_review: opts.verdict ? { verdict: opts.verdict } : undefined,
    body: "",
  };
}

function fakeSupabase(fx: Fixtures): SupabaseClient {
  const from = (table: string) => {
    if (table === "queue_items") return queueBuilder(fx);
    if (table === "memory_files") return memoryBuilder(fx);
    if (table === "external_accounts") return externalAccountsBuilder(fx);
    if (table === "tenant_connectors") return connectorsBuilder(fx);
    if (table === "webhook_dead_letters") return dlqBuilder(fx);
    throw new Error(`unexpected table ${table}`);
  };
  return { from } as unknown as SupabaseClient;
}

// Generic chainable builder. Records filters as they're called so the
// terminal resolver can branch on them.
type State = {
  filters: Record<string, unknown>;
  selectCount: boolean;
  selectHead: boolean;
  order?: { col: string; ascending: boolean };
  limit?: number;
};

function makeChain(resolve: (s: State) => Promise<unknown>) {
  const state: State = { filters: {}, selectCount: false, selectHead: false };
  const builder: Record<string, unknown> = {};
  builder.select = (_cols: string, opts?: { count?: string; head?: boolean }) => {
    if (opts?.count === "exact") state.selectCount = true;
    if (opts?.head) state.selectHead = true;
    return builder;
  };
  builder.eq = (col: string, val: unknown) => {
    state.filters[col] = val;
    return builder;
  };
  builder.is = (col: string, val: unknown) => {
    state.filters[`${col}__is`] = val;
    return builder;
  };
  builder.in = (col: string, vals: unknown[]) => {
    state.filters[`${col}__in`] = vals;
    return builder;
  };
  builder.order = (col: string, opts?: { ascending?: boolean }) => {
    state.order = { col, ascending: opts?.ascending ?? true };
    return builder;
  };
  builder.limit = (n: number) => {
    state.limit = n;
    return builder;
  };
  builder.maybeSingle = () => resolve({ ...state, limit: 1 });
  // Awaiting the builder itself returns the resolver result. PromiseLike
  // surface: implement .then so `await builder` works.
  builder.then = (onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) =>
    resolve(state).then(onFulfilled, onRejected);
  return builder;
}

function queueBuilder(fx: Fixtures) {
  return makeChain(async (s) => {
    if (fx.errors?.queue_items) {
      return { data: null, error: fx.errors.queue_items, count: null };
    }
    const status = s.filters["status"];
    if (status === "accepted") {
      // resolved_at lookup. Tests may set fx.lastAcceptedAt directly OR pass
      // acceptedRows for legacy ordering. Prefer the explicit field.
      if (fx.lastAcceptedAt !== undefined) {
        const ts = fx.lastAcceptedAt;
        return { data: ts ? { resolved_at: ts } : null, error: null, count: ts ? 1 : 0 };
      }
      const rows = (fx.acceptedRows ?? []).slice();
      if (s.order?.col === "resolved_at" && !s.order.ascending) {
        rows.sort((a, b) =>
          (a.resolved_at ?? "") < (b.resolved_at ?? "") ? 1 : -1,
        );
      }
      const top = rows[0] ?? null;
      return { data: top, error: null, count: rows.length };
    }
    return { data: null, error: null, count: 0 };
  });
}

function memoryBuilder(fx: Fixtures) {
  return makeChain(async (s) => {
    if (fx.errors?.memory_files) {
      return { data: null, error: fx.errors.memory_files, count: null };
    }
    const rows = (fx.memory ?? []).slice();
    // count + head — return just the count
    if (s.selectHead) {
      return { data: null, error: null, count: rows.length };
    }
    // last-updated lookup
    if (s.order?.col === "updated_at" && !s.order.ascending) {
      rows.sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1));
    }
    const top = rows[0] ?? null;
    return { data: top, error: null, count: rows.length };
  });
}

function externalAccountsBuilder(fx: Fixtures) {
  return makeChain(async (s) => {
    if (fx.errors?.external_accounts) {
      return { data: null, error: fx.errors.external_accounts, count: null };
    }
    const rows = (fx.externalAccounts ?? []).slice();
    // last-configured-at lookup (uses created_at — external_accounts has no
    // last_tested_at column per migration 0025).
    if (s.order?.col === "created_at") {
      rows.sort((a, b) => {
        const av = a.created_at ?? "";
        const bv = b.created_at ?? "";
        return av < bv ? 1 : -1;
      });
      const top = rows[0] ?? null;
      return { data: top, error: null, count: rows.length };
    }
    // count + provider_id list
    return { data: rows, error: null, count: rows.length };
  });
}

function connectorsBuilder(fx: Fixtures) {
  return makeChain(async (s) => {
    if (fx.errors?.tenant_connectors) {
      return { data: null, error: fx.errors.tenant_connectors, count: null };
    }
    const all = (fx.connectors ?? []).slice();
    // Failed connectors path: status in [error, auth_expired]
    const inFilter = s.filters["last_sync_status__in"] as string[] | undefined;
    if (inFilter) {
      const filtered = all.filter((c) =>
        c.last_sync_status ? inFilter.includes(c.last_sync_status) : false,
      );
      return { data: filtered, error: null, count: filtered.length };
    }
    // Last-sync lookup
    if (s.order?.col === "last_sync_at") {
      const sorted = all.slice().sort((a, b) => {
        const av = a.last_sync_at ?? "";
        const bv = b.last_sync_at ?? "";
        return av < bv ? 1 : -1;
      });
      const top = sorted[0] ?? null;
      return { data: top, error: null, count: all.length };
    }
    // Plain count of active connectors
    return { data: all, error: null, count: all.length };
  });
}

function dlqBuilder(fx: Fixtures) {
  return makeChain(async () => {
    if (fx.errors?.webhook_dead_letters) {
      return { data: null, error: fx.errors.webhook_dead_letters, count: null };
    }
    const rows = fx.dlq ?? [];
    return { data: null, error: null, count: rows.length };
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

const baseOpts = {
  tenantId: "tenant-1",
  isAdmin: true,
  expectedProviders: [] as string[],
};

describe("readOpsState", () => {
  it("returns zero everything for an empty tenant", async () => {
    const out = await readOpsState(fakeSupabase({}), baseOpts, fakeStore({}));
    expect(out.attention.pendingProposals).toEqual([]);
    expect(out.attention.missingProviderKeys).toEqual([]);
    expect(out.attention.failedConnectors).toEqual([]);
    expect(out.attention.dlqCount).toBe(0);
    expect(out.snapshot.queue).toEqual({ pending: 0, lastAcceptedAt: null });
    expect(out.snapshot.memory).toEqual({ files: 0, lastUpdatedAt: null });
    expect(out.snapshot.providers).toEqual({ configured: 0, lastConfiguredAt: null });
    expect(out.snapshot.ingest).toEqual({ connectors: 0, lastSyncAt: null });
    expect(out.degraded).toEqual({
      pendingProposals: false,
      lastAcceptedAt: false,
      memory: false,
      providers: false,
      ingest: false,
      failedConnectors: false,
      dlq: false,
    });
  });

  it("surfaces 3 pending proposals from the store with canAccept gated on manager_review", async () => {
    const fx: Fixtures = {
      pendingProposals: [
        // Newest-first ordering matches what the store provides (DB-mode
        // queue list orders by created_at desc; file-mode test passes order
        // explicitly). Tests pass proposals in the order they expect them.
        makePending({
          proposal_id: "prop-new",
          diff_summary: "newest change",
          target_file: "memory/baz.md",
          // target_layer intentionally omitted — reader must NOT default to
          // "main" (which has stricter governance per the lock matrix).
          change_kind: "supersede",
          verdict: "approved", // ⇒ canAccept: true
        }),
        makePending({
          proposal_id: "prop-mid",
          diff_summary: "middle change",
          target_file: "memory/bar.md",
          target_layer: "manager",
          change_kind: "add",
          verdict: "needs_changes", // ⇒ canAccept: false
        }),
        makePending({
          proposal_id: "prop-old",
          diff_summary: "older change",
          target_file: "memory/foo.md",
          target_layer: "main",
          change_kind: "edit",
          // no verdict ⇒ canAccept: false (manager review gate)
        }),
      ],
    };
    const out = await readOpsState(fakeSupabase(fx), baseOpts, fakeStore(fx));
    expect(out.attention.pendingProposals).toHaveLength(3);
    expect(out.attention.pendingProposals[0].proposal_id).toBe("prop-new");
    expect(out.attention.pendingProposals[0].summary).toBe("newest change");
    expect(out.attention.pendingProposals[0].target_file).toBe("memory/baz.md");
    // Missing target_layer ⇒ empty string, NOT "main".
    expect(out.attention.pendingProposals[0].target_layer).toBe("");
    expect(out.attention.pendingProposals[0].change_kind).toBe("supersede");
    expect(out.attention.pendingProposals[0].canAccept).toBe(true);
    // Middle has a verdict but it's not "approved".
    expect(out.attention.pendingProposals[1].target_layer).toBe("manager");
    expect(out.attention.pendingProposals[1].canAccept).toBe(false);
    // Oldest has no manager review at all.
    expect(out.attention.pendingProposals[2].target_layer).toBe("main");
    expect(out.attention.pendingProposals[2].canAccept).toBe(false);
    expect(out.snapshot.queue.pending).toBe(3);
  });

  it("marks pending proposals degraded when the store throws", async () => {
    const out = await readOpsState(
      fakeSupabase({}),
      baseOpts,
      fakeStore({ storeThrows: true }),
    );
    expect(out.degraded.pendingProposals).toBe(true);
    expect(out.attention.pendingProposals).toEqual([]);
    expect(out.snapshot.queue.pending).toBe(0);
  });

  it("returns lastAcceptedAt from queue_items.resolved_at (most recent)", async () => {
    const out = await readOpsState(
      fakeSupabase({ lastAcceptedAt: "2026-05-17T10:00:00Z" }),
      baseOpts,
      fakeStore({}),
    );
    expect(out.snapshot.queue.lastAcceptedAt).toBe("2026-05-17T10:00:00Z");
  });

  it("computes missing provider keys against external_accounts.provider_id", async () => {
    const out = await readOpsState(
      fakeSupabase({
        externalAccounts: [{ provider_id: "anthropic", created_at: null }],
      }),
      { ...baseOpts, expectedProviders: ["anthropic", "openai"] },
      fakeStore({}),
    );
    expect(out.attention.missingProviderKeys).toEqual(["openai"]);
    expect(out.snapshot.providers.configured).toBe(1);
  });

  it("flags failed connectors and ignores healthy ones", async () => {
    const out = await readOpsState(
      fakeSupabase({
        connectors: [
          { connector_id: "github", last_sync_status: "ok", last_sync_at: "2026-05-16T00:00:00Z" },
          { connector_id: "gmail", last_sync_status: "auth_expired", last_sync_at: "2026-05-12T00:00:00Z" },
          { connector_id: "notion", last_sync_status: "error", last_sync_at: "2026-05-13T00:00:00Z" },
        ],
      }),
      baseOpts,
      fakeStore({}),
    );
    const ids = out.attention.failedConnectors.map((c) => c.connector_id).sort();
    expect(ids).toEqual(["gmail", "notion"]);
    const statusFor = (id: string) =>
      out.attention.failedConnectors.find((c) => c.connector_id === id)?.status;
    expect(statusFor("gmail")).toBe("auth_expired");
    expect(statusFor("notion")).toBe("error");
    expect(out.snapshot.ingest.connectors).toBe(3);
  });

  it("gates DLQ count on isAdmin — non-admin always sees 0", async () => {
    const fx: Fixtures = { dlq: [{ id: "d1" }, { id: "d2" }, { id: "d3" }] };
    const nonAdmin = await readOpsState(fakeSupabase(fx), { ...baseOpts, isAdmin: false }, fakeStore(fx));
    expect(nonAdmin.attention.dlqCount).toBe(0);
    const admin = await readOpsState(fakeSupabase(fx), { ...baseOpts, isAdmin: true }, fakeStore(fx));
    expect(admin.attention.dlqCount).toBe(3);
  });

  it("reports memory file count + max(updated_at) in the snapshot", async () => {
    const out = await readOpsState(
      fakeSupabase({
        memory: [
          { id: "m1", updated_at: "2026-05-10T00:00:00Z" },
          { id: "m2", updated_at: "2026-05-17T09:30:00Z" },
          { id: "m3", updated_at: "2026-05-12T00:00:00Z" },
          { id: "m4", updated_at: "2026-05-14T00:00:00Z" },
          { id: "m5", updated_at: "2026-05-15T00:00:00Z" },
        ],
      }),
      baseOpts,
      fakeStore({}),
    );
    expect(out.snapshot.memory.files).toBe(5);
    expect(out.snapshot.memory.lastUpdatedAt).toBe("2026-05-17T09:30:00Z");
  });

  it("marks sections as degraded when their queries error", async () => {
    // Force the memory_files table to error. Both memory queries (count + last
    // updated) flow through the same builder, so both flip to degraded; every
    // other section stays clean.
    const out = await readOpsState(
      fakeSupabase({ errors: { memory_files: { message: "test" } } }),
      baseOpts,
      fakeStore({}),
    );
    expect(out.degraded.memory).toBe(true);
    // Other sections — including the admin-skipped dlq — must NOT be degraded.
    expect(out.degraded.pendingProposals).toBe(false);
    expect(out.degraded.lastAcceptedAt).toBe(false);
    expect(out.degraded.providers).toBe(false);
    expect(out.degraded.ingest).toBe(false);
    expect(out.degraded.failedConnectors).toBe(false);
    expect(out.degraded.dlq).toBe(false);
    // The data path still falls back to zero/null defaults; the page uses
    // the degraded flag to overlay an "unavailable" treatment.
    expect(out.snapshot.memory.files).toBe(0);
    expect(out.snapshot.memory.lastUpdatedAt).toBeNull();
  });
});
