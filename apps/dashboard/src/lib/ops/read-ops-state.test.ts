// Tests for the /ops cockpit aggregator. Mirrors the fake-Supabase-client
// pattern from src/lib/connectors/read-diagnostics.test.ts but the /ops
// reader fans out 10 parallel queries so the harness has to route by the
// shape of the chain (select + filters) and not just by table name.

import { describe, expect, it } from "vitest";
import { readOpsState } from "./read-ops-state";
import type { SupabaseClient } from "@supabase/supabase-js";

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
  updated_at?: string;
  status?: string;
};

type MemoryRow = { id: string; updated_at: string };
type ExternalAccountRow = { provider: string; last_tested_at: string | null };
type ConnectorRow = {
  connector_id: string;
  last_sync_status: string | null;
  last_sync_at: string | null;
};
type DlqRow = { id: string };

type Fixtures = {
  pending?: QueueRow[];        // queue_items status='pending'
  accepted?: QueueRow[];       // queue_items status='accepted'
  memory?: MemoryRow[];        // memory_files
  externalAccounts?: ExternalAccountRow[]; // external_accounts
  connectors?: ConnectorRow[]; // tenant_connectors active=true, uninstalled_at null
  dlq?: DlqRow[];              // webhook_dead_letters
};

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
    const status = s.filters["status"];
    if (status === "pending") {
      const rows = (fx.pending ?? []).slice();
      // Order newest-first as the reader requests; tests pass rows already in
      // newest-first or any order — sort if ordering was requested.
      if (s.order?.col === "created_at" && !s.order.ascending) {
        rows.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
      }
      const limited = s.limit ? rows.slice(0, s.limit) : rows;
      return { data: limited, error: null, count: rows.length };
    }
    if (status === "accepted") {
      const rows = (fx.accepted ?? []).slice();
      if (s.order?.col === "updated_at" && !s.order.ascending) {
        rows.sort((a, b) =>
          (a.updated_at ?? "") < (b.updated_at ?? "") ? 1 : -1,
        );
      }
      const top = rows[0] ?? null;
      // maybeSingle path
      return { data: top, error: null, count: rows.length };
    }
    return { data: null, error: null, count: 0 };
  });
}

function memoryBuilder(fx: Fixtures) {
  return makeChain(async (s) => {
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
    const rows = (fx.externalAccounts ?? []).slice();
    // last-tested-at lookup
    if (s.order?.col === "last_tested_at") {
      rows.sort((a, b) => {
        const av = a.last_tested_at ?? "";
        const bv = b.last_tested_at ?? "";
        return av < bv ? 1 : -1;
      });
      const top = rows[0] ?? null;
      return { data: top, error: null, count: rows.length };
    }
    // count + provider list
    return { data: rows, error: null, count: rows.length };
  });
}

function connectorsBuilder(fx: Fixtures) {
  return makeChain(async (s) => {
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
    const out = await readOpsState(fakeSupabase({}), baseOpts);
    expect(out.attention.pendingProposals).toEqual([]);
    expect(out.attention.missingProviderKeys).toEqual([]);
    expect(out.attention.failedConnectors).toEqual([]);
    expect(out.attention.dlqCount).toBe(0);
    expect(out.snapshot.queue).toEqual({ pending: 0, lastAcceptedAt: null });
    expect(out.snapshot.memory).toEqual({ files: 0, lastUpdatedAt: null });
    expect(out.snapshot.providers).toEqual({ configured: 0, lastTestedAt: null });
    expect(out.snapshot.ingest).toEqual({ connectors: 0, lastSyncAt: null });
  });

  it("surfaces 3 pending proposals with frontmatter fields, newest-first", async () => {
    const out = await readOpsState(
      fakeSupabase({
        pending: [
          {
            id: "u1",
            proposal_id: "prop-old",
            frontmatter: {
              diff_summary: "older change",
              target_file: "memory/foo.md",
              target_layer: "main",
              change_kind: "edit",
            },
            created_at: "2026-05-15T08:00:00Z",
          },
          {
            id: "u2",
            proposal_id: "prop-mid",
            frontmatter: {
              diff_summary: "middle change",
              target_file: "memory/bar.md",
              target_layer: "manager",
              change_kind: "add",
            },
            created_at: "2026-05-16T08:00:00Z",
          },
          {
            id: "u3",
            proposal_id: "prop-new",
            frontmatter: {
              diff_summary: "newest change",
              target_file: "memory/baz.md",
              target_layer: "main",
              change_kind: "supersede",
            },
            created_at: "2026-05-17T08:00:00Z",
          },
        ],
      }),
      baseOpts,
    );
    expect(out.attention.pendingProposals).toHaveLength(3);
    expect(out.attention.pendingProposals[0].proposal_id).toBe("prop-new");
    expect(out.attention.pendingProposals[0].summary).toBe("newest change");
    expect(out.attention.pendingProposals[0].target_file).toBe("memory/baz.md");
    expect(out.attention.pendingProposals[0].target_layer).toBe("main");
    expect(out.attention.pendingProposals[0].change_kind).toBe("supersede");
    expect(out.snapshot.queue.pending).toBe(3);
  });

  it("returns lastAcceptedAt from the most recent accepted queue_items row", async () => {
    const out = await readOpsState(
      fakeSupabase({
        accepted: [
          {
            id: "a1",
            proposal_id: "old-accepted",
            frontmatter: {},
            created_at: "2026-05-10T00:00:00Z",
            updated_at: "2026-05-10T00:00:00Z",
            status: "accepted",
          },
          {
            id: "a2",
            proposal_id: "recent-accepted",
            frontmatter: {},
            created_at: "2026-05-17T00:00:00Z",
            updated_at: "2026-05-17T10:00:00Z",
            status: "accepted",
          },
        ],
      }),
      baseOpts,
    );
    expect(out.snapshot.queue.lastAcceptedAt).toBe("2026-05-17T10:00:00Z");
  });

  it("computes missing provider keys against the expectedProviders list", async () => {
    const out = await readOpsState(
      fakeSupabase({
        externalAccounts: [{ provider: "anthropic", last_tested_at: null }],
      }),
      { ...baseOpts, expectedProviders: ["anthropic", "openai"] },
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
    const nonAdmin = await readOpsState(fakeSupabase(fx), { ...baseOpts, isAdmin: false });
    expect(nonAdmin.attention.dlqCount).toBe(0);
    const admin = await readOpsState(fakeSupabase(fx), { ...baseOpts, isAdmin: true });
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
    );
    expect(out.snapshot.memory.files).toBe(5);
    expect(out.snapshot.memory.lastUpdatedAt).toBe("2026-05-17T09:30:00Z");
  });
});
