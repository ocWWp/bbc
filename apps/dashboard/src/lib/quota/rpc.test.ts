import { describe, it, expect, vi } from "vitest";

import { makeReserveQuota, makeReconcileQuota } from "./rpc";

function fakeClient(impl: (fn: string, params: Record<string, unknown>) => unknown) {
  return {
    rpc: vi.fn(async (fn: string, params: Record<string, unknown>) => {
      const value = impl(fn, params);
      if (value instanceof Error) return { data: null, error: { message: value.message } };
      return { data: value, error: null };
    }),
  };
}

describe("makeReserveQuota", () => {
  it("translates camelCase args to snake_case RPC params", async () => {
    const client = fakeClient(() => ({
      ok: true,
      reservation_id: "res-1",
    }));
    const reserve = makeReserveQuota(client);

    const result = await reserve({
      tenantId: "tenant-1",
      actorId: "actor-1",
      estimatedTokens: 500,
      kind: "home_turn",
    });

    expect(result).toEqual({ ok: true, reservationId: "res-1" });
    expect(client.rpc).toHaveBeenCalledWith("reserve_quota", {
      p_tenant_id: "tenant-1",
      p_actor_id: "actor-1",
      p_estimated_tokens: 500,
      p_kind: "home_turn",
    });
  });

  it("returns ok:false with the rpc reason when exhausted", async () => {
    const client = fakeClient(() => ({ ok: false, reason: "tokens_exceeded" }));
    const reserve = makeReserveQuota(client);

    const result = await reserve({
      tenantId: "t",
      actorId: "a",
      estimatedTokens: 1,
      kind: "home_turn",
    });

    expect(result).toEqual({ ok: false, reason: "tokens_exceeded" });
  });

  it("wraps RPC errors as ok:false with rpc_error reason", async () => {
    const client = fakeClient(() => new Error("connection lost"));
    const reserve = makeReserveQuota(client);

    const result = await reserve({
      tenantId: "t",
      actorId: null,
      estimatedTokens: 1,
      kind: "observer_run",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toMatch(/rpc_error: connection lost/);
    }
  });

  it("handles malformed RPC responses defensively", async () => {
    const client = fakeClient(() => null);
    const reserve = makeReserveQuota(client);

    const result = await reserve({
      tenantId: "t",
      actorId: "a",
      estimatedTokens: 1,
      kind: "home_turn",
    });

    expect(result).toEqual({ ok: false, reason: "unknown" });
  });
});

describe("makeReconcileQuota", () => {
  it("passes snake_case params through and returns ok:true on success", async () => {
    const client = fakeClient(() => ({ ok: true }));
    const reconcile = makeReconcileQuota(client);

    const result = await reconcile({
      reservation_id: "res-1",
      actual_tokens: 420,
    });

    expect(result).toEqual({ ok: true });
    expect(client.rpc).toHaveBeenCalledWith("reconcile_quota", {
      p_reservation_id: "res-1",
      p_actual_tokens: 420,
    });
  });

  it("returns ok:false on RPC error", async () => {
    const client = fakeClient(() => new Error("dropped"));
    const reconcile = makeReconcileQuota(client);
    const result = await reconcile({
      reservation_id: "res-1",
      actual_tokens: 100,
    });
    expect(result).toEqual({ ok: false });
  });

  it("idempotent re-reconcile still returns ok:true", async () => {
    const client = fakeClient(() => ({ ok: true, idempotent: true }));
    const reconcile = makeReconcileQuota(client);
    const result = await reconcile({
      reservation_id: "res-1",
      actual_tokens: 100,
    });
    expect(result).toEqual({ ok: true });
  });
});
