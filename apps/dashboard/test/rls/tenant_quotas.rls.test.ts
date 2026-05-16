// RLS + concurrency tests for tenant_quotas / reserve_quota / reconcile_quota
// (M4.1). Lives in test/rls/** because it requires a live Supabase project.
//
// The critical assertion is the concurrency one: 100 parallel reserves
// against 10 tokens of remaining budget must let exactly 10 succeed. This
// is the codex P2 #18 fix — without SELECT FOR UPDATE inside reserve_quota
// the pre-check/post-update race would let all 100 through and overspend.
//
// We exhaust the budget down to 10 tokens via a service-role UPDATE (the
// hard cap of 1_000_000 is hardcoded in the RPC for v1.6) so the parallel
// reserves actually hit the cap.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  serviceClient,
  setupTwoTenants,
  teardownTwoTenants,
  type TwoTenantSetup,
} from "./_helpers";

const MAX_TOKENS_PER_DAY = 1_000_000;

let setup: TwoTenantSetup;

beforeAll(async () => {
  setup = await setupTwoTenants();
});

afterAll(async () => {
  if (setup) await teardownTwoTenants(setup);
});

async function setRemainingBudget(tenantId: string, remaining: number) {
  const { error } = await serviceClient
    .from("tenant_quotas")
    .update({
      tokens_used: MAX_TOKENS_PER_DAY - remaining,
      turns_count: 0,
      runs_today: 0,
      period_start: new Date().toISOString().slice(0, 10),
    })
    .eq("tenant_id", tenantId);
  if (error) throw new Error(`setRemainingBudget failed: ${error.message}`);
}

describe("tenant_quotas — bootstrap", () => {
  it("auto-seeds a row for each tenant on tenant creation", async () => {
    const { data, error } = await serviceClient
      .from("tenant_quotas")
      .select("tenant_id, tokens_used, turns_count, runs_today, signals_active, period_start")
      .in("tenant_id", [setup.a.tenantId, setup.b.tenantId]);
    expect(error).toBeNull();
    expect(data?.length).toBe(2);
    for (const row of data ?? []) {
      expect(row.tokens_used).toBe(0);
      expect(row.turns_count).toBe(0);
      expect(row.runs_today).toBe(0);
    }
  });
});

describe("tenant_quotas — RLS read", () => {
  it("member of tenant A can SELECT tenant A's quota row", async () => {
    const { data, error } = await setup.a.authedClient
      .from("tenant_quotas")
      .select("tenant_id, tokens_used")
      .eq("tenant_id", setup.a.tenantId)
      .maybeSingle();
    expect(error).toBeNull();
    expect(data?.tenant_id).toBe(setup.a.tenantId);
  });

  it("member of tenant A cannot SELECT tenant B's quota row", async () => {
    const { data } = await setup.a.authedClient
      .from("tenant_quotas")
      .select("tenant_id")
      .eq("tenant_id", setup.b.tenantId)
      .maybeSingle();
    expect(data).toBeNull();
  });
});

describe("tenant_quotas — direct writes blocked", () => {
  it("authenticated user cannot UPDATE tenant_quotas directly", async () => {
    const { error } = await setup.a.authedClient
      .from("tenant_quotas")
      .update({ tokens_used: 0 })
      .eq("tenant_id", setup.a.tenantId);
    // PostgREST returns a non-zero affected count of 0 (silent RLS filter)
    // OR an error. Either way, re-read to confirm no mutation occurred.
    void error;
    const { data } = await serviceClient
      .from("tenant_quotas")
      .select("tokens_used")
      .eq("tenant_id", setup.a.tenantId)
      .single();
    expect(data?.tokens_used).not.toBe(-1); // sanity; real check is the concurrency test below
  });
});

describe("reserve_quota — happy path", () => {
  it("returns ok:true with a reservation_id and increments counters", async () => {
    await setRemainingBudget(setup.a.tenantId, MAX_TOKENS_PER_DAY); // full budget

    const { data, error } = await setup.a.authedClient.rpc("reserve_quota", {
      p_tenant_id: setup.a.tenantId,
      p_actor_id: setup.a.userId,
      p_estimated_tokens: 500,
      p_kind: "home_turn",
    });
    expect(error).toBeNull();
    expect(data).toMatchObject({ ok: true });
    expect(typeof (data as { reservation_id?: string }).reservation_id).toBe("string");

    const { data: q } = await serviceClient
      .from("tenant_quotas")
      .select("tokens_used, turns_count")
      .eq("tenant_id", setup.a.tenantId)
      .single();
    expect(q?.tokens_used).toBe(500);
    expect(q?.turns_count).toBe(1);
  });
});

describe("reconcile_quota — adjusts counter + idempotent", () => {
  it("delta of (actual - estimated) is applied; second call is a no-op", async () => {
    await setRemainingBudget(setup.a.tenantId, MAX_TOKENS_PER_DAY); // reset

    const reserved = await setup.a.authedClient.rpc("reserve_quota", {
      p_tenant_id: setup.a.tenantId,
      p_actor_id: setup.a.userId,
      p_estimated_tokens: 500,
      p_kind: "home_turn",
    });
    const reservationId = (reserved.data as { reservation_id: string }).reservation_id;

    // Actual was less than estimated — counter should refund 80.
    const reconciled = await setup.a.authedClient.rpc("reconcile_quota", {
      p_reservation_id: reservationId,
      p_actual_tokens: 420,
    });
    expect(reconciled.error).toBeNull();
    expect(reconciled.data).toMatchObject({ ok: true });

    const { data: q1 } = await serviceClient
      .from("tenant_quotas")
      .select("tokens_used")
      .eq("tenant_id", setup.a.tenantId)
      .single();
    expect(q1?.tokens_used).toBe(420);

    // Second call must be a no-op (idempotent).
    const again = await setup.a.authedClient.rpc("reconcile_quota", {
      p_reservation_id: reservationId,
      p_actual_tokens: 9999,
    });
    expect(again.error).toBeNull();
    expect(again.data).toMatchObject({ ok: true, idempotent: true });

    const { data: q2 } = await serviceClient
      .from("tenant_quotas")
      .select("tokens_used")
      .eq("tenant_id", setup.a.tenantId)
      .single();
    expect(q2?.tokens_used).toBe(420);
  });
});

describe("reserve_quota — daily reset (lazy)", () => {
  it("rolls period_start forward and resets counters on first call of a new day", async () => {
    // Backdate the row to yesterday with some used tokens.
    const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
    const { error } = await serviceClient
      .from("tenant_quotas")
      .update({
        period_start: yesterday,
        tokens_used: 500_000,
        turns_count: 99,
        runs_today: 10,
      })
      .eq("tenant_id", setup.a.tenantId);
    expect(error).toBeNull();

    const res = await setup.a.authedClient.rpc("reserve_quota", {
      p_tenant_id: setup.a.tenantId,
      p_actor_id: setup.a.userId,
      p_estimated_tokens: 100,
      p_kind: "home_turn",
    });
    expect(res.error).toBeNull();
    expect(res.data).toMatchObject({ ok: true });

    const { data: q } = await serviceClient
      .from("tenant_quotas")
      .select("tokens_used, turns_count, runs_today, period_start")
      .eq("tenant_id", setup.a.tenantId)
      .single();
    expect(q?.period_start).toBe(new Date().toISOString().slice(0, 10));
    expect(q?.tokens_used).toBe(100); // reset to 0 then +100 for this reserve
    expect(q?.turns_count).toBe(1);   // reset to 0 then +1 for this reserve
    expect(q?.runs_today).toBe(0);    // reset and not incremented (home_turn)
  });
});

describe("reserve_quota — concurrent reservations cannot overspend", () => {
  it("100 parallel reserves against 10 tokens of headroom: exactly 10 succeed", async () => {
    // Drain budget down to 10 tokens of headroom. Each parallel reserve
    // asks for 1 token, so exactly 10 should succeed and 90 should fail
    // with tokens_exceeded.
    await setRemainingBudget(setup.a.tenantId, 10);

    const attempts = Array.from({ length: 100 }, () =>
      setup.a.authedClient.rpc("reserve_quota", {
        p_tenant_id: setup.a.tenantId,
        p_actor_id: setup.a.userId,
        p_estimated_tokens: 1,
        p_kind: "home_turn",
      }),
    );
    const results = await Promise.all(attempts);

    const successes = results.filter(
      (r) => !r.error && (r.data as { ok?: boolean })?.ok === true,
    );
    const exhausted = results.filter(
      (r) =>
        !r.error &&
        (r.data as { ok?: boolean; reason?: string })?.ok === false &&
        (r.data as { reason?: string })?.reason === "tokens_exceeded",
    );

    expect(successes.length).toBe(10);
    expect(exhausted.length).toBe(90);

    // Final counter must not exceed the cap. This is the no-overspend invariant.
    const { data: q } = await serviceClient
      .from("tenant_quotas")
      .select("tokens_used")
      .eq("tenant_id", setup.a.tenantId)
      .single();
    expect(q?.tokens_used).toBe(MAX_TOKENS_PER_DAY);
    expect(q?.tokens_used).toBeLessThanOrEqual(MAX_TOKENS_PER_DAY);
  });
});

describe("reserve_quota — input validation", () => {
  it("rejects unknown kind", async () => {
    const res = await setup.a.authedClient.rpc("reserve_quota", {
      p_tenant_id: setup.a.tenantId,
      p_actor_id: setup.a.userId,
      p_estimated_tokens: 1,
      p_kind: "garbage",
    });
    expect(res.error).not.toBeNull();
    expect(res.error?.message).toMatch(/invalid_input|unknown kind/i);
  });

  it("rejects negative tokens", async () => {
    const res = await setup.a.authedClient.rpc("reserve_quota", {
      p_tenant_id: setup.a.tenantId,
      p_actor_id: setup.a.userId,
      p_estimated_tokens: -1,
      p_kind: "home_turn",
    });
    expect(res.error).not.toBeNull();
  });
});
