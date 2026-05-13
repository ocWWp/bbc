// v1.5 D-W4-3: Loop 3 recommendation lifecycle.
//
// Pure logic that wraps the rule-based recommender (W4-2) with persistence,
// dedupe, cooldown, and cap controls. The DB port (LifecycleDb) keeps the
// engine zero-DB-testable; the concrete Supabase impl lives next to the
// server actions.
//
// Spam controls (per ADR-0012):
//   - Dedupe: at most one pending row per (tenant, target_kind, target_id).
//     Enforced both here (pre-insert filter) and in the DB (partial unique
//     index on state='pending'). The pre-insert filter keeps generate runs
//     idempotent without relying on insert-conflict noise.
//   - Cooldown: a target that was dismissed in the last 14 days is dropped
//     before insert. Re-running generate within the window does nothing.
//   - Cap: at most 5 active pending recs per tenant. If the tenant is at or
//     above the cap, the whole generate run is a no-op — we don't pick a
//     subset, because rule ordering already implicitly prioritized.
//
// State machine: pending -> installed | dismissed | snoozed.
//   - installRecommendation(id): pending -> installed. Optional installer
//     callback runs first; state only flips on installer success. This is
//     the "install flips state and triggers actual install" acceptance.
//   - dismissRecommendation(id): pending -> dismissed. Sets dismissed_at
//     so the cooldown filter can read it back next gen.
//   - snoozeRecommendation(id, until): pending -> snoozed. Sets
//     snoozed_until; UI hides until that time.

import { recommend, type Recommendation, type Signal } from "./recommend";

// --------------------------------------------------------------------------
// Constants
// --------------------------------------------------------------------------

export const COOLDOWN_DAYS = 14;
export const MAX_PENDING = 5;

const COOLDOWN_MS = COOLDOWN_DAYS * 24 * 60 * 60 * 1000;

// --------------------------------------------------------------------------
// DB port
// --------------------------------------------------------------------------

export type RecState = "pending" | "installed" | "dismissed" | "snoozed";

export type RecRow = {
  id: string;
  tenant_id: string;
  target_kind: Recommendation["target_kind"];
  target_id: string;
  reason_code: string;
  reason_human: string;
  state: RecState;
  recommended_at: Date;
  installed_at: Date | null;
  dismissed_at: Date | null;
  snoozed_until: Date | null;
  observed_signal: Record<string, unknown> | null;
};

export type NewRecRow = {
  tenant_id: string;
  target_kind: Recommendation["target_kind"];
  target_id: string;
  reason_code: string;
  reason_human: string;
  observed_signal: Record<string, unknown>;
};

export type StatePatch =
  | { state: "installed"; installed_at: Date }
  | { state: "dismissed"; dismissed_at: Date }
  | { state: "snoozed"; snoozed_until: Date };

export interface LifecycleDb {
  /** Snapshot the inputs the recommender needs. Joins live in the impl. */
  buildSignal(tenant_id: string): Promise<Signal>;

  /** Active pending recommendations for this tenant. */
  listPending(tenant_id: string): Promise<RecRow[]>;

  /** Recommendations dismissed at or after `since` for this tenant. */
  listDismissedSince(tenant_id: string, since: Date): Promise<RecRow[]>;

  /** Recommendations currently snoozed past `now` for this tenant. The
   *  partial unique index on pending does not cover snoozed rows, so the
   *  generate pass must filter these out explicitly — otherwise re-running
   *  generate before snoozed_until lets the same target reappear. */
  listSnoozedActive(tenant_id: string, now: Date): Promise<RecRow[]>;

  /** Insert new recommendations. Returns the count actually inserted (the
   *  partial unique index may reject some — implementations should swallow
   *  unique-violation rather than fail the whole batch). */
  insertRecommendations(tenant_id: string, rows: NewRecRow[]): Promise<number>;

  /** Read one rec by id. Returns null if missing or not visible (RLS). */
  getRecById(id: string): Promise<RecRow | null>;

  /** Atomically flip state. No-op if the row isn't currently pending — the
   *  state machine forbids re-transitions. */
  updateState(id: string, patch: StatePatch): Promise<void>;
}

// --------------------------------------------------------------------------
// generateRecommendations — the per-tenant generate pass
// --------------------------------------------------------------------------

export type GenerateResult = {
  /** Number of new rows actually inserted. */
  inserted: number;
  /** Why we ended up with that count. Useful for /library diagnostics. */
  reason: "ok" | "at_cap" | "all_filtered";
  /** Diagnostic counts for debugging. */
  diagnostics: {
    candidates: number;
    dropped_existing_pending: number;
    dropped_cooldown: number;
    dropped_snoozed: number;
    pending_before: number;
  };
};

export type Clock = { now(): Date };
const defaultClock: Clock = { now: () => new Date() };

export async function generateRecommendations(
  tenant_id: string,
  db: LifecycleDb,
  opts: { clock?: Clock } = {},
): Promise<GenerateResult> {
  const clock = opts.clock ?? defaultClock;
  const now = clock.now();

  const pending = await db.listPending(tenant_id);
  if (pending.length >= MAX_PENDING) {
    return {
      inserted: 0,
      reason: "at_cap",
      diagnostics: {
        candidates: 0,
        dropped_existing_pending: 0,
        dropped_cooldown: 0,
        dropped_snoozed: 0,
        pending_before: pending.length,
      },
    };
  }

  const signal = await db.buildSignal(tenant_id);
  const candidates = recommend(signal);

  const since = new Date(now.getTime() - COOLDOWN_MS);
  const [dismissedRecently, snoozedActive] = await Promise.all([
    db.listDismissedSince(tenant_id, since),
    db.listSnoozedActive(tenant_id, now),
  ]);

  const pendingKeys = new Set(pending.map((r) => `${r.target_kind}:${r.target_id}`));
  const cooldownKeys = new Set(
    dismissedRecently.map((r) => `${r.target_kind}:${r.target_id}`),
  );
  const snoozedKeys = new Set(
    snoozedActive.map((r) => `${r.target_kind}:${r.target_id}`),
  );

  let dropped_existing_pending = 0;
  let dropped_cooldown = 0;
  let dropped_snoozed = 0;
  const toInsert: NewRecRow[] = [];
  for (const c of candidates) {
    const key = `${c.target_kind}:${c.target_id}`;
    if (pendingKeys.has(key)) {
      dropped_existing_pending++;
      continue;
    }
    if (cooldownKeys.has(key)) {
      dropped_cooldown++;
      continue;
    }
    if (snoozedKeys.has(key)) {
      dropped_snoozed++;
      continue;
    }
    toInsert.push({
      tenant_id,
      target_kind: c.target_kind,
      target_id: c.target_id,
      reason_code: c.reason_code,
      reason_human: c.reason_human,
      observed_signal: c.observed_signal,
    });
    // Respect the cap mid-loop — once pending+new == MAX_PENDING, stop adding.
    if (pending.length + toInsert.length >= MAX_PENDING) break;
  }

  if (toInsert.length === 0) {
    return {
      inserted: 0,
      reason: "all_filtered",
      diagnostics: {
        candidates: candidates.length,
        dropped_existing_pending,
        dropped_cooldown,
        dropped_snoozed,
        pending_before: pending.length,
      },
    };
  }

  const inserted = await db.insertRecommendations(tenant_id, toInsert);
  return {
    inserted,
    reason: "ok",
    diagnostics: {
      candidates: candidates.length,
      dropped_existing_pending,
      dropped_cooldown,
      dropped_snoozed,
      pending_before: pending.length,
    },
  };
}

// --------------------------------------------------------------------------
// State transitions
// --------------------------------------------------------------------------

export type TransitionResult =
  | { ok: true }
  | { ok: false; error: string; code: "not_found" | "not_pending" | "installer_failed" };

export async function installRecommendation(
  id: string,
  db: LifecycleDb,
  opts: { clock?: Clock; installer?: () => Promise<{ ok: boolean; error?: string }> } = {},
): Promise<TransitionResult> {
  const clock = opts.clock ?? defaultClock;
  const row = await db.getRecById(id);
  if (!row) return { ok: false, error: "Recommendation not found.", code: "not_found" };
  if (row.state !== "pending") {
    return { ok: false, error: `Already ${row.state}.`, code: "not_pending" };
  }

  if (opts.installer) {
    const result = await opts.installer();
    if (!result.ok) {
      return {
        ok: false,
        error: result.error ?? "Installer failed.",
        code: "installer_failed",
      };
    }
  }

  await db.updateState(id, { state: "installed", installed_at: clock.now() });
  return { ok: true };
}

export async function dismissRecommendation(
  id: string,
  db: LifecycleDb,
  opts: { clock?: Clock } = {},
): Promise<TransitionResult> {
  const clock = opts.clock ?? defaultClock;
  const row = await db.getRecById(id);
  if (!row) return { ok: false, error: "Recommendation not found.", code: "not_found" };
  if (row.state !== "pending") {
    return { ok: false, error: `Already ${row.state}.`, code: "not_pending" };
  }
  await db.updateState(id, { state: "dismissed", dismissed_at: clock.now() });
  return { ok: true };
}

export async function snoozeRecommendation(
  id: string,
  until: Date,
  db: LifecycleDb,
): Promise<TransitionResult> {
  const row = await db.getRecById(id);
  if (!row) return { ok: false, error: "Recommendation not found.", code: "not_found" };
  if (row.state !== "pending") {
    return { ok: false, error: `Already ${row.state}.`, code: "not_pending" };
  }
  await db.updateState(id, { state: "snoozed", snoozed_until: until });
  return { ok: true };
}
