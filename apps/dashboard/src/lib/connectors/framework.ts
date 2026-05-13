// v1.5 D-W3-1: connector framework.
//
// Defines the Connector interface (per docs/plans/2026-05-12-bbc-launch-design.md
// §4) and the runSync() orchestrator that handles the operational requirements
// every connector shares:
//
//   * token refresh < 24h before expiry (auth_expired → surface in Library card)
//   * 429 backoff with exponential delay + 50%–150% jitter
//   * cursor persistence in tenant_connectors.sync_state
//   * partial-failure commit (proposals collected before an error stay; status
//     becomes 'partial')
//   * source_ref dedup against memory_files.fields.source_ref via a ConnectorDb
//     port (concrete Supabase implementation lives elsewhere; this module is
//     framework-only and test-friendly)
//   * max_proposals_per_sync cap (default per-connector)
//
// installConnector() is the admin-gated install handshake — OAuth already
// happened, this just wires the tenant_connectors row to the existing
// external_accounts row.
//
// The DB layer is abstracted behind ConnectorDb so the orchestrator is unit-
// testable without spinning up Postgres. A SupabaseConnectorDb impl can live in
// a sibling file once W3-2/3/4 land.

import type { Supertag } from "@/lib/memory/types";
import { type Actor, requireRole } from "@/lib/auth/require-user";

// --------------------------------------------------------------------------
// Public types
// --------------------------------------------------------------------------

export type SyncCursor = string | null;

export type MemoryProposal = {
  type: Supertag;
  title: string;
  body: string;
  fields: Record<string, unknown>;
  /** Provider's stable ID for the item — framework dedupes on (tenant_id, source_ref). */
  source_ref: string;
};

/** A connector yields a stream of these. Interleave `checkpoint` events between
 *  proposals so a mid-sync failure resumes from the last persisted cursor on
 *  the next call.
 *
 *  Rate-limit signaling is yield-based, not throw-based: yielding
 *  `{ kind: "rate_limit", retry_after_ms }` causes runSync to sleep with
 *  exponential backoff + jitter and resume iteration. (Throwing instead would
 *  exhaust the generator, since async generators can't resume after a throw.) */
export type SyncEvent =
  | { kind: "proposal"; proposal: MemoryProposal }
  | { kind: "checkpoint"; cursor: SyncCursor }
  | { kind: "rate_limit"; retry_after_ms?: number };

export type SyncContext = {
  tenant_id: string;
  external_account_id: string | null;
  cursor: SyncCursor;
  /** Connector-specific config from tenant_connectors.mapping. Each connector
   *  validates its expected shape — e.g., GitHub expects { owner, repo, paths,
   *  include_prs, include_collaborators }. */
  config: Record<string, unknown>;
};

export type AuthURL = { url: string; state: string };

export type RateLimitStrategy = {
  /** First retry delay, scaled by 2^attempt up to max_delay_ms. */
  base_delay_ms: number;
  max_delay_ms: number;
  max_retries: number;
};

export interface Connector {
  id: string;
  name: string;
  description: string;
  writes_to: Supertag[];
  oauth_scopes?: string[];
  permission_summary: string;

  authenticate(tenant_id: string, redirect_url: string): Promise<AuthURL>;
  complete_auth(tenant_id: string, code: string): Promise<{ external_account_id: string }>;
  /** Called automatically by runSync when token expiry < 24h. */
  refresh_token?(external_account_id: string): Promise<void>;

  sync(ctx: SyncContext): AsyncIterable<SyncEvent>;
  /** Preview hook for trust-through-preview install flow (D-W3-5). */
  preview?(ctx: SyncContext): Promise<MemoryProposal[]>;

  sync_schedule: "on_demand" | { interval_minutes: number };
  max_proposals_per_sync: number;
  rate_limit_strategy: RateLimitStrategy;
}

// --------------------------------------------------------------------------
// Sentinel errors
// --------------------------------------------------------------------------

/** Thrown by refresh_token() (or from inside sync() as a final escalation after
 *  the connector exhausted its own retry budget). runSync persists
 *  last_sync_status='rate_limited' and stops. For mid-sync transient 429s use
 *  the yield-based `rate_limit` event instead. */
export class RateLimitError extends Error {
  readonly retry_after_ms?: number;
  constructor(retry_after_ms?: number) {
    super("rate_limited");
    this.name = "RateLimitError";
    this.retry_after_ms = retry_after_ms;
  }
}

export class AuthExpiredError extends Error {
  constructor(message = "auth_expired") {
    super(message);
    this.name = "AuthExpiredError";
  }
}

// --------------------------------------------------------------------------
// DB port — abstracted so runSync is testable without Supabase.
// --------------------------------------------------------------------------

export type ConnectorRow = {
  id: string;
  external_account_id: string | null;
  mapping: Record<string, unknown>;
  sync_state: { cursor?: SyncCursor; [k: string]: unknown };
};

export type SyncStatus = "ok" | "error" | "partial" | "auth_expired" | "rate_limited";

export interface ConnectorDb {
  /** Fetch the active tenant_connectors row for (tenant, connector). null if not installed. */
  getConnector(tenant_id: string, connector_id: string): Promise<ConnectorRow | null>;

  /** OAuth token expiry from external_accounts. null if we don't track expiry. */
  getTokenExpiry(external_account_id: string): Promise<Date | null>;

  /** Returns the subset of provided source_refs that already exist for this tenant
   *  in either memory_files.fields.source_ref or pending proposals. */
  existingSourceRefs(tenant_id: string, source_refs: string[]): Promise<Set<string>>;

  /** Persist one proposal as a draft memory_files row (status='draft') plus the
   *  provenance link via memory_file_sources / ingestion_sources. */
  commitProposal(tenant_id: string, connector_row_id: string, proposal: MemoryProposal): Promise<void>;

  /** Patch tenant_connectors row — sync_state cursor, last_sync_at, status, error. */
  updateSyncState(
    tenant_id: string,
    connector_row_id: string,
    patch: {
      sync_state?: Record<string, unknown>;
      last_sync_at?: Date;
      last_sync_status?: SyncStatus;
      last_sync_error?: string | null;
    },
  ): Promise<void>;
}

// --------------------------------------------------------------------------
// runSync orchestrator
// --------------------------------------------------------------------------

export type RunSyncResult = {
  status: SyncStatus;
  emitted: number;
  skipped_duplicates: number;
  cursor: SyncCursor;
  error?: string;
};

export type Clock = { now(): Date };
export type Sleeper = (ms: number) => Promise<void>;

export type RunSyncOpts = {
  max_proposals?: number;
  rate_limit?: RateLimitStrategy;
  clock?: Clock;
  sleep?: Sleeper;
  random?: () => number;
  /** Flush the in-memory proposal buffer to commitProposal at this many items.
   *  Smaller = more dedup queries but smaller blast radius on error. */
  dedup_batch_size?: number;
};

const TOKEN_REFRESH_WINDOW_MS = 24 * 60 * 60 * 1000;
const DEFAULT_DEDUP_BATCH = 50;

const defaultClock: Clock = { now: () => new Date() };
const defaultSleep: Sleeper = (ms) => new Promise((r) => setTimeout(r, ms));

export async function runSync(
  connector: Connector,
  tenant_id: string,
  db: ConnectorDb,
  opts: RunSyncOpts = {},
): Promise<RunSyncResult> {
  const clock = opts.clock ?? defaultClock;
  const sleep = opts.sleep ?? defaultSleep;
  const random = opts.random ?? Math.random;
  const maxProposals = opts.max_proposals ?? connector.max_proposals_per_sync;
  const strategy = opts.rate_limit ?? connector.rate_limit_strategy;
  const batchSize = opts.dedup_batch_size ?? DEFAULT_DEDUP_BATCH;

  const row = await db.getConnector(tenant_id, connector.id);
  if (!row) {
    return { status: "error", emitted: 0, skipped_duplicates: 0, cursor: null, error: "connector not installed" };
  }

  const startingCursor: SyncCursor = (row.sync_state.cursor as SyncCursor | undefined) ?? null;
  let cursor: SyncCursor = startingCursor;

  // ---- token refresh ---------------------------------------------------
  if (row.external_account_id && connector.refresh_token) {
    const expiry = await db.getTokenExpiry(row.external_account_id);
    if (expiry && expiry.getTime() - clock.now().getTime() < TOKEN_REFRESH_WINDOW_MS) {
      try {
        await connector.refresh_token(row.external_account_id);
      } catch (err) {
        const e = err as Error;
        const status: SyncStatus =
          e.name === "AuthExpiredError"
            ? "auth_expired"
            : e.name === "RateLimitError"
              ? "rate_limited"
              : "error";
        const msg =
          status === "auth_expired"
            ? "auth_expired"
            : status === "rate_limited"
              ? "rate_limited during token refresh"
              : `token refresh failed: ${e.message}`;
        await db.updateSyncState(tenant_id, row.id, {
          last_sync_at: clock.now(),
          last_sync_status: status,
          last_sync_error: msg,
        });
        return { status, emitted: 0, skipped_duplicates: 0, cursor: startingCursor, error: msg };
      }
    }
  }

  // ---- sync loop -------------------------------------------------------
  let emitted = 0;
  let skipped = 0;
  let buffer: MemoryProposal[] = [];

  const ctx: SyncContext = {
    tenant_id,
    external_account_id: row.external_account_id,
    cursor: startingCursor,
    config: row.mapping,
  };

  const flush = async (): Promise<void> => {
    if (buffer.length === 0) return;
    // Bound the commit by remaining cap budget so a single oversized batch can't
    // overshoot max_proposals_per_sync. Items past the cap are dropped entirely;
    // they neither commit nor count as skipped duplicates.
    const remaining = Math.max(0, maxProposals - emitted);
    const { committed, skipped_count } = await commitBatch(buffer, db, tenant_id, row.id, remaining);
    emitted += committed;
    skipped += skipped_count;
    buffer = [];
  };

  let rateLimitAttempts = 0;

  try {
    for await (const event of connector.sync(ctx)) {
      if (event.kind === "rate_limit") {
        if (rateLimitAttempts >= strategy.max_retries) {
          throw new RateLimitError(event.retry_after_ms);
        }
        const exp = Math.min(
          strategy.max_delay_ms,
          strategy.base_delay_ms * 2 ** rateLimitAttempts,
        );
        const base = event.retry_after_ms ?? exp;
        // jitter: 50%–150% of base
        const jittered = Math.floor(base * (0.5 + random()));
        const delay = Math.min(strategy.max_delay_ms, jittered);
        await sleep(delay);
        rateLimitAttempts++;
        continue;
      }
      if (event.kind === "checkpoint") {
        // Flush before advancing cursor so a crash here doesn't lose un-committed
        // proposals belonging to the previous cursor position.
        await flush();
        cursor = event.cursor;
        await db.updateSyncState(tenant_id, row.id, {
          sync_state: { ...row.sync_state, cursor },
        });
        if (emitted >= maxProposals) break;
        rateLimitAttempts = 0;
        continue;
      }
      buffer.push(event.proposal);
      if (buffer.length >= batchSize) {
        await flush();
        if (emitted >= maxProposals) break;
      }
      rateLimitAttempts = 0;
    }
    await flush();

    await db.updateSyncState(tenant_id, row.id, {
      sync_state: { ...row.sync_state, cursor },
      last_sync_at: clock.now(),
      last_sync_status: "ok",
      last_sync_error: null,
    });
    return { status: "ok", emitted, skipped_duplicates: skipped, cursor };
  } catch (err) {
    const e = err as Error;
    // Best-effort: flush whatever made it into the buffer before the throw.
    try {
      await flush();
    } catch {
      /* If commit itself fails we can't do better — fall through to status. */
    }

    const status: SyncStatus =
      e.name === "AuthExpiredError"
        ? "auth_expired"
        : e.name === "RateLimitError"
          ? "rate_limited"
          : emitted > 0
            ? "partial"
            : "error";

    await db.updateSyncState(tenant_id, row.id, {
      sync_state: { ...row.sync_state, cursor },
      last_sync_at: clock.now(),
      last_sync_status: status,
      last_sync_error: e.message,
    });
    return { status, emitted, skipped_duplicates: skipped, cursor, error: e.message };
  }
}

// --------------------------------------------------------------------------
// Internals
// --------------------------------------------------------------------------

async function commitBatch(
  proposals: MemoryProposal[],
  db: ConnectorDb,
  tenant_id: string,
  connector_row_id: string,
  remaining_budget: number,
): Promise<{ committed: number; skipped_count: number }> {
  if (remaining_budget <= 0) return { committed: 0, skipped_count: 0 };
  const refs = Array.from(new Set(proposals.map((p) => p.source_ref)));
  const existing = await db.existingSourceRefs(tenant_id, refs);
  let committed = 0;
  let skipped = 0;
  for (const p of proposals) {
    if (existing.has(p.source_ref)) {
      skipped++;
      continue;
    }
    if (committed >= remaining_budget) break; // cap reached — drop the rest of the batch
    await db.commitProposal(tenant_id, connector_row_id, p);
    existing.add(p.source_ref); // guard against intra-batch duplicates
    committed++;
  }
  return { committed, skipped_count: skipped };
}

// --------------------------------------------------------------------------
// installConnector — admin gate around tenant_connectors insert.
// --------------------------------------------------------------------------

export type InstallConnectorInput = {
  connector_id: string;
  external_account_id: string | null;
  mapping?: Record<string, unknown>;
};

export interface InstallDb {
  insertTenantConnector(input: {
    tenant_id: string;
    connector_id: string;
    external_account_id: string | null;
    mapping: Record<string, unknown>;
    installed_by: string;
  }): Promise<{ id: string }>;
}

export type InstallResult =
  | { ok: true; tenant_connector_id: string }
  | { ok: false; error: string };

export async function installConnector(
  actor: Actor,
  input: InstallConnectorInput,
  db: InstallDb,
): Promise<InstallResult> {
  const gate = requireRole(actor, "admin");
  if (!gate.ok) return { ok: false, error: gate.output };

  const trimmed = input.connector_id.trim();
  if (!trimmed) return { ok: false, error: "connector_id required" };

  try {
    const { id } = await db.insertTenantConnector({
      tenant_id: actor.tenant_id,
      connector_id: trimmed,
      external_account_id: input.external_account_id,
      mapping: input.mapping ?? {},
      installed_by: actor.user_id,
    });
    return { ok: true, tenant_connector_id: id };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}
