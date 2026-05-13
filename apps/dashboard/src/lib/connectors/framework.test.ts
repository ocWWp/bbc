// D-W3-1 acceptance tests for the connector framework.
//
// Per docs/plans/2026-05-12-bbc-launch-plan.md §3 / Week 3:
//   - simulated 429 triggers backoff
//   - mid-sync error persists emitted rows + cursor + last_sync_status='partial'
//   - second run resumes from saved cursor
//   - duplicate source_ref skipped
//
// The framework is fully testable via the ConnectorDb / InstallDb ports, no DB.

import { describe, expect, it, vi } from "vitest";
import {
  AuthExpiredError,
  type Connector,
  type ConnectorDb,
  type ConnectorRow,
  type InstallDb,
  type MemoryProposal,
  type RunSyncResult,
  type SyncContext,
  type SyncCursor,
  type SyncEvent,
  installConnector,
  runSync,
} from "./framework";
import type { Actor } from "@/lib/auth/require-user";

// --------------------------------------------------------------------------
// Test helpers
// --------------------------------------------------------------------------

type SyncStateRecord = {
  sync_state?: Record<string, unknown>;
  last_sync_at?: Date;
  last_sync_status?: string;
  last_sync_error?: string | null;
};

function makeDb(opts: {
  row?: ConnectorRow | null;
  tokenExpiry?: Date | null;
  existingRefs?: Iterable<string>;
} = {}): {
  db: ConnectorDb;
  committed: MemoryProposal[];
  patches: SyncStateRecord[];
} {
  const committed: MemoryProposal[] = [];
  const patches: SyncStateRecord[] = [];
  const existing = new Set(opts.existingRefs ?? []);

  const db: ConnectorDb = {
    async getConnector() {
      return opts.row === undefined
        ? { id: "row-1", external_account_id: null, sync_state: {} }
        : opts.row;
    },
    async getTokenExpiry() {
      return opts.tokenExpiry ?? null;
    },
    async existingSourceRefs(_tenant, refs) {
      return new Set(refs.filter((r) => existing.has(r)));
    },
    async commitProposal(_tenant, _row, proposal) {
      committed.push(proposal);
      existing.add(proposal.source_ref);
    },
    async updateSyncState(_tenant, _row, patch) {
      patches.push(patch);
    },
  };
  return { db, committed, patches };
}

function proposal(sourceRef: string, title = sourceRef): MemoryProposal {
  return { type: "note", title, body: `body ${title}`, fields: {}, source_ref: sourceRef };
}

function makeConnector(overrides: Partial<Connector> = {}): Connector {
  return {
    id: "test-connector",
    name: "Test",
    description: "Test connector",
    writes_to: ["note"],
    permission_summary: "Reads stuff",
    authenticate: vi.fn(),
    complete_auth: vi.fn(),
    sync: async function* (_ctx: SyncContext): AsyncIterable<SyncEvent> {},
    sync_schedule: "on_demand",
    max_proposals_per_sync: 100,
    rate_limit_strategy: { base_delay_ms: 100, max_delay_ms: 5_000, max_retries: 3 },
    ...overrides,
  };
}

// --------------------------------------------------------------------------
// 1. Happy path
// --------------------------------------------------------------------------

describe("runSync — happy path", () => {
  it("commits all yielded proposals, advances cursor, status=ok", async () => {
    const { db, committed, patches } = makeDb();
    const connector = makeConnector({
      async *sync(_ctx) {
        yield { kind: "proposal", proposal: proposal("a") };
        yield { kind: "proposal", proposal: proposal("b") };
        yield { kind: "checkpoint", cursor: "page-2" };
        yield { kind: "proposal", proposal: proposal("c") };
      },
    });

    const result = await runSync(connector, "t1", db);

    expect(result.status).toBe("ok");
    expect(result.emitted).toBe(3);
    expect(result.skipped_duplicates).toBe(0);
    expect(result.cursor).toBe("page-2");
    expect(committed.map((p) => p.source_ref)).toEqual(["a", "b", "c"]);

    // Final patch carries status=ok + cursor=page-2.
    const final = patches[patches.length - 1];
    expect(final.last_sync_status).toBe("ok");
    expect((final.sync_state as { cursor?: string }).cursor).toBe("page-2");
  });

  it("returns error and no commits when connector is not installed", async () => {
    const { db, committed } = makeDb({ row: null });
    const connector = makeConnector();
    const result = await runSync(connector, "t1", db);
    expect(result.status).toBe("error");
    expect(result.error).toContain("not installed");
    expect(committed).toHaveLength(0);
  });
});

// --------------------------------------------------------------------------
// 2. 429 backoff
// --------------------------------------------------------------------------

describe("runSync — 429 backoff", () => {
  it("sleeps with jittered exponential delay then resumes", async () => {
    const { db, committed } = makeDb();
    const connector = makeConnector({
      rate_limit_strategy: { base_delay_ms: 1_000, max_delay_ms: 30_000, max_retries: 3 },
      async *sync(_ctx) {
        yield { kind: "proposal", proposal: proposal("first") };
        yield { kind: "rate_limit" };
        yield { kind: "proposal", proposal: proposal("second") };
      },
    });

    const sleep = vi.fn(async (_ms: number) => {});
    const result = await runSync(connector, "t1", db, {
      sleep,
      random: () => 0.5, // deterministic jitter = base * 1.0
    });

    expect(result.status).toBe("ok");
    expect(committed.map((p) => p.source_ref)).toEqual(["first", "second"]);
    expect(sleep).toHaveBeenCalledTimes(1);
    // attempt=0 → base * 2^0 = 1000ms; jitter at random=0.5 → base * 1.0 = 1000
    expect(sleep).toHaveBeenCalledWith(1_000);
  });

  it("honors explicit retry_after_ms on the rate_limit event", async () => {
    const { db } = makeDb();
    const connector = makeConnector({
      rate_limit_strategy: { base_delay_ms: 100, max_delay_ms: 60_000, max_retries: 2 },
      async *sync(_ctx) {
        yield { kind: "rate_limit", retry_after_ms: 7_500 };
        yield { kind: "proposal", proposal: proposal("x") };
      },
    });
    const sleep = vi.fn(async () => {});
    const result = await runSync(connector, "t1", db, { sleep, random: () => 0.5 });
    expect(result.status).toBe("ok");
    // retry_after=7500, jitter=base * 1.0 -> 7500 (clamped under max_delay 60000)
    expect(sleep).toHaveBeenCalledWith(7_500);
  });

  it("escalates to status='rate_limited' after max_retries consecutive rate_limit events", async () => {
    const { db, patches } = makeDb();
    const connector = makeConnector({
      rate_limit_strategy: { base_delay_ms: 10, max_delay_ms: 1_000, max_retries: 2 },
      async *sync(_ctx) {
        // 3 consecutive rate_limit events with no progress between them
        yield { kind: "rate_limit" };
        yield { kind: "rate_limit" };
        yield { kind: "rate_limit" };
      },
    });
    const sleep = vi.fn(async () => {});
    const result = await runSync(connector, "t1", db, { sleep, random: () => 0.5 });
    expect(result.status).toBe("rate_limited");
    expect(sleep).toHaveBeenCalledTimes(2); // attempts 0 and 1; attempt 2 escalates
    const final = patches[patches.length - 1];
    expect(final.last_sync_status).toBe("rate_limited");
  });

  it("resets the retry counter after progress (proposal or checkpoint)", async () => {
    const { db, committed } = makeDb();
    const connector = makeConnector({
      rate_limit_strategy: { base_delay_ms: 10, max_delay_ms: 1_000, max_retries: 2 },
      async *sync(_ctx) {
        yield { kind: "rate_limit" };
        yield { kind: "rate_limit" };
        yield { kind: "proposal", proposal: proposal("a") }; // resets counter
        yield { kind: "rate_limit" };
        yield { kind: "rate_limit" };
        yield { kind: "proposal", proposal: proposal("b") };
      },
    });
    const sleep = vi.fn(async () => {});
    const result = await runSync(connector, "t1", db, { sleep, random: () => 0.5 });
    expect(result.status).toBe("ok");
    expect(committed.map((p) => p.source_ref)).toEqual(["a", "b"]);
    expect(sleep).toHaveBeenCalledTimes(4); // 2 + 2 sleeps
  });

  it("clamps jittered delay to max_delay_ms", async () => {
    const { db } = makeDb();
    const connector = makeConnector({
      rate_limit_strategy: { base_delay_ms: 1_000, max_delay_ms: 1_200, max_retries: 5 },
      async *sync(_ctx) {
        yield { kind: "rate_limit" };
        yield { kind: "proposal", proposal: proposal("x") };
      },
    });
    const sleep = vi.fn(async () => {});
    await runSync(connector, "t1", db, { sleep, random: () => 1.0 }); // jitter=1.5x
    // 1000 * 1.5 = 1500, clamped to 1200
    expect(sleep).toHaveBeenCalledWith(1_200);
  });
});

// --------------------------------------------------------------------------
// 3. Mid-sync error → partial commit
// --------------------------------------------------------------------------

describe("runSync — mid-sync error", () => {
  it("commits buffered proposals and records last_sync_status='partial'", async () => {
    const { db, committed, patches } = makeDb({
      row: { id: "row-1", external_account_id: null, sync_state: { cursor: "page-0" } },
    });
    const connector = makeConnector({
      async *sync(_ctx) {
        yield { kind: "proposal", proposal: proposal("a") };
        yield { kind: "proposal", proposal: proposal("b") };
        yield { kind: "checkpoint", cursor: "page-1" };
        yield { kind: "proposal", proposal: proposal("c") };
        throw new Error("upstream blew up");
      },
    });

    const result = await runSync(connector, "t1", db);

    expect(result.status).toBe("partial");
    expect(result.emitted).toBe(3);
    expect(result.error).toBe("upstream blew up");
    expect(result.cursor).toBe("page-1");
    expect(committed.map((p) => p.source_ref)).toEqual(["a", "b", "c"]);

    const final = patches[patches.length - 1];
    expect(final.last_sync_status).toBe("partial");
    expect(final.last_sync_error).toBe("upstream blew up");
    expect((final.sync_state as { cursor?: string }).cursor).toBe("page-1");
  });

  it("reports status='error' when no proposals were committed before throwing", async () => {
    const { db, patches } = makeDb();
    const connector = makeConnector({
      async *sync(_ctx) {
        throw new Error("connection refused");
      },
    });
    const result = await runSync(connector, "t1", db);
    expect(result.status).toBe("error");
    expect(result.emitted).toBe(0);
    expect(patches[patches.length - 1].last_sync_status).toBe("error");
  });
});

// --------------------------------------------------------------------------
// 4. Resume from saved cursor
// --------------------------------------------------------------------------

describe("runSync — resume", () => {
  it("passes the saved cursor into connector.sync()", async () => {
    const { db } = makeDb({
      row: { id: "row-1", external_account_id: null, sync_state: { cursor: "page-42" } },
    });
    const seen: SyncContext[] = [];
    const connector = makeConnector({
      async *sync(ctx) {
        seen.push(ctx);
        yield { kind: "proposal", proposal: proposal("x") };
      },
    });
    await runSync(connector, "t1", db);
    expect(seen).toHaveLength(1);
    expect(seen[0].cursor).toBe("page-42");
    expect(seen[0].tenant_id).toBe("t1");
  });
});

// --------------------------------------------------------------------------
// 5. Source-ref dedup
// --------------------------------------------------------------------------

describe("runSync — dedup", () => {
  it("skips proposals whose source_ref already exists in memory", async () => {
    const { db, committed } = makeDb({ existingRefs: ["b"] });
    const connector = makeConnector({
      async *sync(_ctx) {
        yield { kind: "proposal", proposal: proposal("a") };
        yield { kind: "proposal", proposal: proposal("b") };
        yield { kind: "proposal", proposal: proposal("c") };
      },
    });
    const result = await runSync(connector, "t1", db);
    expect(result.emitted).toBe(2);
    expect(result.skipped_duplicates).toBe(1);
    expect(committed.map((p) => p.source_ref)).toEqual(["a", "c"]);
  });

  it("skips intra-batch duplicates", async () => {
    const { db, committed } = makeDb();
    const connector = makeConnector({
      async *sync(_ctx) {
        yield { kind: "proposal", proposal: proposal("a", "title-1") };
        yield { kind: "proposal", proposal: proposal("a", "title-2") };
      },
    });
    const result = await runSync(connector, "t1", db);
    expect(result.emitted).toBe(1);
    expect(result.skipped_duplicates).toBe(1);
    expect(committed).toHaveLength(1);
  });
});

// --------------------------------------------------------------------------
// 6. Max cap
// --------------------------------------------------------------------------

describe("runSync — max cap", () => {
  it("stops at max_proposals_per_sync without losing buffered proposals", async () => {
    const { db, committed } = makeDb();
    const connector = makeConnector({
      max_proposals_per_sync: 2,
      async *sync(_ctx) {
        yield { kind: "proposal", proposal: proposal("a") };
        yield { kind: "proposal", proposal: proposal("b") };
        yield { kind: "checkpoint", cursor: "p1" };
        yield { kind: "proposal", proposal: proposal("c") };
        yield { kind: "checkpoint", cursor: "p2" };
      },
    });
    const result = await runSync(connector, "t1", db, { dedup_batch_size: 1 });
    expect(result.status).toBe("ok");
    expect(committed.map((p) => p.source_ref)).toEqual(["a", "b"]);
    // Cap hit before the next checkpoint — cursor stays where it started (null).
    // Re-running picks up at cursor=null and dedup skips a + b.
    expect(result.cursor).toBeNull();
  });

  it("enforces the cap even when a single batch yields more than max_proposals (codex-flagged)", async () => {
    const { db, committed } = makeDb();
    const connector = makeConnector({
      max_proposals_per_sync: 3,
      async *sync(_ctx) {
        // 10 proposals, no checkpoints — they all land in one batch flush.
        for (const id of ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"]) {
          yield { kind: "proposal", proposal: proposal(id) };
        }
      },
    });
    // Default dedup_batch_size (50) > cap (3) — without the cap guard inside
    // commitBatch the flush would commit all 10.
    const result = await runSync(connector, "t1", db);
    expect(result.status).toBe("ok");
    expect(committed.map((p) => p.source_ref)).toEqual(["a", "b", "c"]);
  });

  it("opts.max_proposals overrides the connector default and stops at the last seen checkpoint", async () => {
    const { db, committed } = makeDb();
    const connector = makeConnector({
      max_proposals_per_sync: 100,
      async *sync(_ctx) {
        for (const id of ["a", "b", "c", "d"]) {
          yield { kind: "proposal", proposal: proposal(id) };
          yield { kind: "checkpoint", cursor: id };
        }
      },
    });
    const result = await runSync(connector, "t1", db, { max_proposals: 2, dedup_batch_size: 1 });
    expect(committed).toHaveLength(2);
    // Connector yields: a, checkpoint(a), b. Cap is hit immediately after b commits;
    // checkpoint(b) is never seen. Cursor stays at the last seen checkpoint (a).
    expect(result.cursor).toBe("a");
  });
});

// --------------------------------------------------------------------------
// 7. Token refresh
// --------------------------------------------------------------------------

describe("runSync — token refresh", () => {
  it("calls refresh_token when expiry is within 24h", async () => {
    const expiring = new Date(Date.now() + 60 * 60 * 1000); // 1h from now
    const { db } = makeDb({
      row: { id: "row-1", external_account_id: "acc-1", sync_state: {} },
      tokenExpiry: expiring,
    });
    const refresh = vi.fn(async () => {});
    const connector = makeConnector({
      refresh_token: refresh,
      async *sync(_ctx) {
        yield { kind: "proposal", proposal: proposal("x") };
      },
    });
    await runSync(connector, "t1", db);
    expect(refresh).toHaveBeenCalledWith("acc-1");
  });

  it("skips refresh when expiry is comfortably far away", async () => {
    const farFuture = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const { db } = makeDb({
      row: { id: "row-1", external_account_id: "acc-1", sync_state: {} },
      tokenExpiry: farFuture,
    });
    const refresh = vi.fn(async () => {});
    const connector = makeConnector({ refresh_token: refresh });
    await runSync(connector, "t1", db);
    expect(refresh).not.toHaveBeenCalled();
  });

  it("marks rate_limited when refresh throws RateLimitError (codex-flagged)", async () => {
    const expiring = new Date(Date.now() + 60 * 60 * 1000);
    const { db, patches } = makeDb({
      row: { id: "row-1", external_account_id: "acc-1", sync_state: {} },
      tokenExpiry: expiring,
    });
    const { RateLimitError } = await import("./framework");
    const connector = makeConnector({
      refresh_token: async () => {
        throw new RateLimitError(5_000);
      },
    });
    const result = await runSync(connector, "t1", db);
    expect(result.status).toBe("rate_limited");
    expect(result.emitted).toBe(0);
    const final = patches[patches.length - 1];
    expect(final.last_sync_status).toBe("rate_limited");
    expect(final.last_sync_error).toMatch(/refresh/i);
  });

  it("marks auth_expired when refresh throws AuthExpiredError", async () => {
    const expiring = new Date(Date.now() + 60 * 60 * 1000);
    const { db, patches } = makeDb({
      row: { id: "row-1", external_account_id: "acc-1", sync_state: {} },
      tokenExpiry: expiring,
    });
    const connector = makeConnector({
      refresh_token: async () => {
        throw new AuthExpiredError();
      },
    });
    const result = await runSync(connector, "t1", db);
    expect(result.status).toBe("auth_expired");
    expect(result.emitted).toBe(0);
    expect(patches[patches.length - 1].last_sync_status).toBe("auth_expired");
  });

  it("propagates AuthExpiredError thrown mid-sync", async () => {
    const { db, patches, committed } = makeDb();
    const connector = makeConnector({
      async *sync(_ctx) {
        yield { kind: "proposal", proposal: proposal("a") };
        throw new AuthExpiredError("token revoked");
      },
    });
    const result = await runSync(connector, "t1", db);
    expect(result.status).toBe("auth_expired");
    // Pre-error proposal still committed (provenance preserved even when auth dies).
    expect(committed.map((p) => p.source_ref)).toEqual(["a"]);
    expect(patches[patches.length - 1].last_sync_status).toBe("auth_expired");
  });
});

// --------------------------------------------------------------------------
// 8. installConnector
// --------------------------------------------------------------------------

function fakeActor(role: Actor["role"] = "admin"): Actor {
  return {
    user_id: "u1",
    provider: "github",
    identifier: "alice",
    actor: "human:github:alice",
    tenant_id: "t1",
    tenant_slug: "acme",
    role,
  };
}

describe("installConnector", () => {
  it("admin can install — inserts a tenant_connectors row", async () => {
    const inserted: Parameters<InstallDb["insertTenantConnector"]>[0][] = [];
    const db: InstallDb = {
      async insertTenantConnector(input) {
        inserted.push(input);
        return { id: "tc-1" };
      },
    };
    const result = await installConnector(
      fakeActor("admin"),
      { connector_id: "notion", external_account_id: "ea-1", mapping: { foo: "bar" } },
      db,
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.tenant_connector_id).toBe("tc-1");
    expect(inserted).toHaveLength(1);
    expect(inserted[0]).toMatchObject({
      tenant_id: "t1",
      connector_id: "notion",
      external_account_id: "ea-1",
      installed_by: "u1",
      mapping: { foo: "bar" },
    });
  });

  it("member is rejected", async () => {
    const db: InstallDb = {
      insertTenantConnector: vi.fn(),
    };
    const result = await installConnector(
      fakeActor("member"),
      { connector_id: "notion", external_account_id: null },
      db,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/admin/);
    expect(db.insertTenantConnector).not.toHaveBeenCalled();
  });

  it("viewer is rejected", async () => {
    const db: InstallDb = { insertTenantConnector: vi.fn() };
    const result = await installConnector(
      fakeActor("viewer"),
      { connector_id: "notion", external_account_id: null },
      db,
    );
    expect(result.ok).toBe(false);
  });

  it("rejects empty connector_id", async () => {
    const db: InstallDb = { insertTenantConnector: vi.fn() };
    const result = await installConnector(
      fakeActor("admin"),
      { connector_id: "   ", external_account_id: null },
      db,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/required/);
  });

  it("surfaces DB errors as { ok: false, error }", async () => {
    const db: InstallDb = {
      async insertTenantConnector() {
        throw new Error("unique constraint violation");
      },
    };
    const result = await installConnector(
      fakeActor("admin"),
      { connector_id: "notion", external_account_id: null },
      db,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("unique constraint");
  });
});

// --------------------------------------------------------------------------
// 9. Combined scenario — second run after partial resumes from cursor + dedups
// --------------------------------------------------------------------------

describe("runSync — partial then resume composite scenario", () => {
  it("first run: partial. second run: starts at saved cursor and skips already-committed refs.", async () => {
    // Shared "DB" — accumulated committed refs survive across both runs.
    const committed: MemoryProposal[] = [];
    let storedCursor: SyncCursor = null;
    let storedStatus: string | null = null;
    const existing = new Set<string>();

    const db: ConnectorDb = {
      async getConnector() {
        return { id: "row-1", external_account_id: null, sync_state: { cursor: storedCursor } };
      },
      async getTokenExpiry() {
        return null;
      },
      async existingSourceRefs(_t, refs) {
        return new Set(refs.filter((r) => existing.has(r)));
      },
      async commitProposal(_t, _r, p) {
        committed.push(p);
        existing.add(p.source_ref);
      },
      async updateSyncState(_t, _r, patch) {
        if (patch.sync_state) storedCursor = ((patch.sync_state as { cursor?: SyncCursor }).cursor) ?? storedCursor;
        if (patch.last_sync_status) storedStatus = patch.last_sync_status;
      },
    };

    // Run 1: yields a, b, checkpoint=p1, then crashes.
    const run1Connector = makeConnector({
      async *sync(_ctx) {
        yield { kind: "proposal", proposal: proposal("a") };
        yield { kind: "proposal", proposal: proposal("b") };
        yield { kind: "checkpoint", cursor: "p1" };
        throw new Error("rug pulled");
      },
    });

    const r1: RunSyncResult = await runSync(run1Connector, "t1", db);
    expect(r1.status).toBe("partial");
    expect(committed.map((p) => p.source_ref)).toEqual(["a", "b"]);
    expect(storedCursor).toBe("p1");
    expect(storedStatus).toBe("partial");

    // Run 2: starts at p1, yields b (duplicate, dedups) and c, ends clean.
    let receivedCursor: SyncCursor = null;
    const run2Connector = makeConnector({
      async *sync(ctx) {
        receivedCursor = ctx.cursor;
        yield { kind: "proposal", proposal: proposal("b") }; // already committed → skip
        yield { kind: "proposal", proposal: proposal("c") };
        yield { kind: "checkpoint", cursor: "p2" };
      },
    });

    const r2 = await runSync(run2Connector, "t1", db);
    expect(receivedCursor).toBe("p1");
    expect(r2.status).toBe("ok");
    expect(r2.skipped_duplicates).toBe(1);
    expect(committed.map((p) => p.source_ref)).toEqual(["a", "b", "c"]);
    expect(storedCursor).toBe("p2");
    expect(storedStatus).toBe("ok");
  });
});
