// D-W4-3 acceptance tests for the Loop 3 recommendation lifecycle.
//
// Per docs/plans/2026-05-12-bbc-launch-plan.md §3 / Week 4:
//   - dismissed target stays gone 14 days (cooldown)
//   - 6th gen at cap is no-op (cap=5)
//   - install flips state and triggers actual install
//
// The lifecycle is tested against an in-memory LifecycleDb fake so behavior
// is deterministic and zero-DB. The Supabase impl + RLS lives in its own
// file and is exercised by the RLS test suite.

import { beforeEach, describe, expect, it } from "vitest";
import {
  COOLDOWN_DAYS,
  MAX_PENDING,
  dismissRecommendation,
  generateRecommendations,
  installRecommendation,
  snoozeRecommendation,
  type LifecycleDb,
  type NewRecRow,
  type RecRow,
  type StatePatch,
} from "./lifecycle";
import type { Signal } from "./recommend";

// --------------------------------------------------------------------------
// In-memory fake
// --------------------------------------------------------------------------

class FakeLifecycleDb implements LifecycleDb {
  rows: RecRow[] = [];
  signal: Signal;
  /** Mirrors the partial unique index on (tenant_id, target_kind, target_id)
   *  WHERE state='pending'. Tests can disable this to drive specific edge
   *  cases. */
  enforce_pending_unique = true;
  private nextId = 1;

  constructor(signal: Signal) {
    this.signal = signal;
  }

  async buildSignal(_tenant_id: string): Promise<Signal> {
    return this.signal;
  }

  async listPending(tenant_id: string): Promise<RecRow[]> {
    return this.rows.filter((r) => r.tenant_id === tenant_id && r.state === "pending");
  }

  async listDismissedSince(tenant_id: string, since: Date): Promise<RecRow[]> {
    return this.rows.filter(
      (r) =>
        r.tenant_id === tenant_id &&
        r.state === "dismissed" &&
        r.dismissed_at != null &&
        r.dismissed_at.getTime() >= since.getTime(),
    );
  }

  async listSnoozedActive(tenant_id: string, now: Date): Promise<RecRow[]> {
    return this.rows.filter(
      (r) =>
        r.tenant_id === tenant_id &&
        r.state === "snoozed" &&
        r.snoozed_until != null &&
        r.snoozed_until.getTime() > now.getTime(),
    );
  }

  async insertRecommendations(tenant_id: string, rows: NewRecRow[]): Promise<number> {
    let inserted = 0;
    for (const r of rows) {
      if (this.enforce_pending_unique) {
        const dup = this.rows.find(
          (x) =>
            x.tenant_id === tenant_id &&
            x.state === "pending" &&
            x.target_kind === r.target_kind &&
            x.target_id === r.target_id,
        );
        if (dup) continue; // index would have rejected
      }
      this.rows.push({
        id: `rec_${this.nextId++}`,
        tenant_id,
        target_kind: r.target_kind,
        target_id: r.target_id,
        reason_code: r.reason_code,
        reason_human: r.reason_human,
        state: "pending",
        recommended_at: new Date(),
        installed_at: null,
        dismissed_at: null,
        snoozed_until: null,
        observed_signal: r.observed_signal,
      });
      inserted++;
    }
    return inserted;
  }

  async getRecById(id: string): Promise<RecRow | null> {
    return this.rows.find((r) => r.id === id) ?? null;
  }

  async updateState(id: string, patch: StatePatch): Promise<void> {
    const row = this.rows.find((r) => r.id === id);
    if (!row) return;
    if (row.state !== "pending") return; // mirrors the impl's no-op on re-transition
    row.state = patch.state;
    if (patch.state === "installed") row.installed_at = patch.installed_at;
    if (patch.state === "dismissed") row.dismissed_at = patch.dismissed_at;
    if (patch.state === "snoozed") row.snoozed_until = patch.snoozed_until;
  }
}

// All-roles-zero-skills signal (forces recommendSkills to emit 5 candidates,
// plus the webhook catch-all for tenants with memory). Keeps tests focused
// on lifecycle behavior rather than rule selection.
function fullSignal(): Signal {
  return {
    tenant_roles: ["marketing", "engineering", "founder", "designer", "support"],
    installed_skills_by_role: {
      marketing: 0,
      engineering: 0,
      founder: 0,
      designer: 0,
      support: 0,
    },
    installed_connectors: new Set(),
    memory_counts_by_type: {},
  };
}

const TENANT = "t1";

let db: FakeLifecycleDb;
beforeEach(() => {
  db = new FakeLifecycleDb(fullSignal());
});

// --------------------------------------------------------------------------
// Cap behavior
// --------------------------------------------------------------------------

describe("generateRecommendations — cap", () => {
  it("first run inserts at most MAX_PENDING rows", async () => {
    const res = await generateRecommendations(TENANT, db);
    expect(res.inserted).toBe(MAX_PENDING);
    expect(res.reason).toBe("ok");
    const pending = await db.listPending(TENANT);
    expect(pending).toHaveLength(MAX_PENDING);
  });

  it("6th gen at cap is a no-op", async () => {
    await generateRecommendations(TENANT, db);
    const before = await db.listPending(TENANT);
    expect(before).toHaveLength(MAX_PENDING);

    const res = await generateRecommendations(TENANT, db);
    expect(res.inserted).toBe(0);
    expect(res.reason).toBe("at_cap");
    expect(res.diagnostics.pending_before).toBe(MAX_PENDING);

    const after = await db.listPending(TENANT);
    expect(after).toHaveLength(MAX_PENDING);
  });

  it("dropping below cap (one dismissed) lets the next gen top up", async () => {
    await generateRecommendations(TENANT, db);
    const first = (await db.listPending(TENANT))[0];

    // 14 days in the past dismissal, so cooldown is already over for this target.
    const longAgo = new Date(Date.now() - (COOLDOWN_DAYS + 1) * 24 * 60 * 60 * 1000);
    await db.updateState(first.id, { state: "dismissed", dismissed_at: longAgo });

    const res = await generateRecommendations(TENANT, db);
    expect(res.inserted).toBe(1);
    expect(res.reason).toBe("ok");
    const after = await db.listPending(TENANT);
    expect(after).toHaveLength(MAX_PENDING);
  });
});

// --------------------------------------------------------------------------
// Cooldown
// --------------------------------------------------------------------------

describe("generateRecommendations — 14-day cooldown after dismissal", () => {
  it("dismissed target stays gone for 14 days", async () => {
    // Seed the dismissal with a controllable clock.
    const t0 = new Date("2026-05-01T12:00:00Z");
    const clock = { now: () => t0 };

    // First gen at t0 inserts 5 pending recs.
    await generateRecommendations(TENANT, db, { clock });
    const sk001 = db.rows.find((r) => r.target_id === "sk_001")!;
    expect(sk001.state).toBe("pending");

    // User dismisses sk_001 at t0.
    await dismissRecommendation(sk001.id, db, { clock });
    expect(
      (await db.listPending(TENANT)).find((r) => r.target_id === "sk_001"),
    ).toBeUndefined();

    // Day 7: try to re-generate. sk_001 must NOT come back.
    const tDay7 = new Date(t0.getTime() + 7 * 24 * 60 * 60 * 1000);
    const res7 = await generateRecommendations(TENANT, db, { clock: { now: () => tDay7 } });
    expect(res7.inserted).toBe(0); // still at cap from t0 minus sk_001 = 4, but sk_001 in cooldown so nothing new
    const pending7 = await db.listPending(TENANT);
    expect(pending7.find((r) => r.target_id === "sk_001")).toBeUndefined();

    // Day 13.5: still inside cooldown.
    const tDay135 = new Date(t0.getTime() + 13.5 * 24 * 60 * 60 * 1000);
    const res135 = await generateRecommendations(TENANT, db, {
      clock: { now: () => tDay135 },
    });
    expect(res135.inserted).toBe(0);
    expect(
      (await db.listPending(TENANT)).find((r) => r.target_id === "sk_001"),
    ).toBeUndefined();

    // Day 14 + 1ms: cooldown is over → sk_001 returns.
    const tAfter = new Date(t0.getTime() + COOLDOWN_DAYS * 24 * 60 * 60 * 1000 + 1);
    const resAfter = await generateRecommendations(TENANT, db, {
      clock: { now: () => tAfter },
    });
    expect(resAfter.inserted).toBe(1);
    expect(
      (await db.listPending(TENANT)).find((r) => r.target_id === "sk_001"),
    ).toBeDefined();
  });

  it("cooldown is per-target — dismissing X does not block Y", async () => {
    await generateRecommendations(TENANT, db);
    const sk001 = db.rows.find((r) => r.target_id === "sk_001")!;
    await dismissRecommendation(sk001.id, db);

    // Re-gen: sk_001 stays gone, but sk_002–sk_005 are still present.
    const res = await generateRecommendations(TENANT, db);
    expect(res.inserted).toBe(0);
    const pending = await db.listPending(TENANT);
    expect(pending.map((r) => r.target_id).sort()).toEqual([
      "sk_002",
      "sk_003",
      "sk_004",
      "sk_005",
    ]);
  });
});

// --------------------------------------------------------------------------
// Dedupe
// --------------------------------------------------------------------------

describe("generateRecommendations — dedupe", () => {
  it("re-running gen with all candidates already pending is a no-op", async () => {
    await generateRecommendations(TENANT, db);
    const before = await db.listPending(TENANT);
    const res = await generateRecommendations(TENANT, db);
    expect(res.inserted).toBe(0);
    expect(res.reason).toBe("at_cap");
    const after = await db.listPending(TENANT);
    expect(after.map((r) => r.id).sort()).toEqual(before.map((r) => r.id).sort());
  });

  it("DB unique-violation fallback still produces a coherent count", async () => {
    // Pre-seed one pending target so the lifecycle's pre-filter and the DB's
    // unique index would both agree. We then disable the in-memory enforcement
    // to exercise the path where the DB accepts but the pre-filter dropped it.
    await db.insertRecommendations(TENANT, [
      {
        tenant_id: TENANT,
        target_kind: "skill",
        target_id: "sk_001",
        reason_code: "role_gap_marketing",
        reason_human: "seeded",
        observed_signal: {},
      },
    ]);
    db.enforce_pending_unique = false;

    const res = await generateRecommendations(TENANT, db);
    expect(res.diagnostics.dropped_existing_pending).toBeGreaterThanOrEqual(1);
    expect(res.inserted).toBeLessThanOrEqual(MAX_PENDING - 1);
  });
});

// --------------------------------------------------------------------------
// State transitions
// --------------------------------------------------------------------------

describe("installRecommendation", () => {
  it("flips state to installed and calls the installer", async () => {
    await generateRecommendations(TENANT, db);
    const rec = db.rows[0];

    let installerCalled = false;
    const result = await installRecommendation(rec.id, db, {
      installer: async () => {
        installerCalled = true;
        return { ok: true };
      },
    });

    expect(result.ok).toBe(true);
    expect(installerCalled).toBe(true);

    const after = await db.getRecById(rec.id);
    expect(after?.state).toBe("installed");
    expect(after?.installed_at).toBeInstanceOf(Date);
  });

  it("does not flip state if the installer fails", async () => {
    await generateRecommendations(TENANT, db);
    const rec = db.rows[0];

    const result = await installRecommendation(rec.id, db, {
      installer: async () => ({ ok: false, error: "nope" }),
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("installer_failed");

    const after = await db.getRecById(rec.id);
    expect(after?.state).toBe("pending");
  });

  it("flips state even without an installer (UI-managed integration path)", async () => {
    await generateRecommendations(TENANT, db);
    const rec = db.rows[0];

    const result = await installRecommendation(rec.id, db);
    expect(result.ok).toBe(true);
    expect((await db.getRecById(rec.id))?.state).toBe("installed");
  });

  it("rejects when the recommendation is already installed/dismissed", async () => {
    await generateRecommendations(TENANT, db);
    const rec = db.rows[0];
    await installRecommendation(rec.id, db);

    const second = await installRecommendation(rec.id, db);
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.code).toBe("not_pending");
  });

  it("returns not_found for an unknown id", async () => {
    const result = await installRecommendation("rec_does_not_exist", db);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("not_found");
  });
});

describe("dismissRecommendation", () => {
  it("flips state to dismissed and stamps dismissed_at", async () => {
    await generateRecommendations(TENANT, db);
    const rec = db.rows[0];

    const result = await dismissRecommendation(rec.id, db);
    expect(result.ok).toBe(true);

    const after = await db.getRecById(rec.id);
    expect(after?.state).toBe("dismissed");
    expect(after?.dismissed_at).toBeInstanceOf(Date);
  });
});

describe("snoozeRecommendation", () => {
  it("flips state to snoozed with a snoozed_until timestamp", async () => {
    await generateRecommendations(TENANT, db);
    const rec = db.rows[0];

    const until = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const result = await snoozeRecommendation(rec.id, until, db);
    expect(result.ok).toBe(true);

    const after = await db.getRecById(rec.id);
    expect(after?.state).toBe("snoozed");
    expect(after?.snoozed_until?.getTime()).toBe(until.getTime());
  });

  it("snoozed target does NOT regenerate before snoozed_until", async () => {
    // Codex [P2]: the partial unique index only covers state='pending', so
    // without an explicit snooze filter a fresh pending row could land for
    // the same target on the next generate.
    const t0 = new Date("2026-05-01T12:00:00Z");
    const tDay7 = new Date(t0.getTime() + 7 * 24 * 60 * 60 * 1000);
    const tDay14 = new Date(t0.getTime() + 14 * 24 * 60 * 60 * 1000);

    await generateRecommendations(TENANT, db, { clock: { now: () => t0 } });
    const sk001 = db.rows.find((r) => r.target_id === "sk_001")!;
    await snoozeRecommendation(sk001.id, tDay14, db);

    // 7 days in: still snoozed; rerun should not insert a fresh sk_001.
    const res = await generateRecommendations(TENANT, db, {
      clock: { now: () => tDay7 },
    });
    expect(res.diagnostics.dropped_snoozed).toBeGreaterThanOrEqual(1);
    const pendingAt7 = await db.listPending(TENANT);
    expect(pendingAt7.find((r) => r.target_id === "sk_001")).toBeUndefined();

    // Past snoozed_until: the target can come back. The snooze state doesn't
    // auto-transition, so the row stays as 'snoozed' but a new pending row
    // is permitted because the dedup filter only blocks active snoozes.
    const tAfter = new Date(tDay14.getTime() + 1);
    const resAfter = await generateRecommendations(TENANT, db, {
      clock: { now: () => tAfter },
    });
    expect(resAfter.inserted).toBeGreaterThanOrEqual(1);
    const pendingAfter = await db.listPending(TENANT);
    expect(pendingAfter.find((r) => r.target_id === "sk_001")).toBeDefined();
  });
});
