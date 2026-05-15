import { describe, it, expect, vi } from "vitest";
import { reserveQuota, reconcileQuota } from "./quota";

describe("QuotaGate", () => {
  it("returns ok + reservation id when reservation succeeds", async () => {
    const rpc = vi
      .fn()
      .mockResolvedValue({ ok: true, reservationId: "r1" });
    const r = await reserveQuota(
      {
        tenantId: "t1",
        actorId: "u1",
        estimatedTokens: 500,
        kind: "home_turn",
      },
      rpc,
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.reservationId).toBe("r1");
    expect(rpc).toHaveBeenCalledOnce();
  });

  it("returns exhausted with reason when budget is gone", async () => {
    const rpc = vi
      .fn()
      .mockResolvedValue({ ok: false, reason: "tokens_exceeded" });
    const r = await reserveQuota(
      {
        tenantId: "t1",
        actorId: "u1",
        estimatedTokens: 500,
        kind: "home_turn",
      },
      rpc,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("tokens_exceeded");
  });

  it("passes observer_run kind through unchanged", async () => {
    const rpc = vi
      .fn()
      .mockResolvedValue({ ok: true, reservationId: "r2" });
    await reserveQuota(
      {
        tenantId: "t1",
        actorId: null,
        estimatedTokens: 800,
        kind: "observer_run",
      },
      rpc,
    );
    expect(rpc).toHaveBeenCalledWith({
      tenantId: "t1",
      actorId: null,
      estimatedTokens: 800,
      kind: "observer_run",
    });
  });

  it("reconcileQuota forwards actual_tokens to the RPC under snake_case keys", async () => {
    const rpc = vi.fn().mockResolvedValue({ ok: true });
    await reconcileQuota(
      { reservationId: "r1", actualTokens: 420 },
      rpc,
    );
    expect(rpc).toHaveBeenCalledWith({
      reservation_id: "r1",
      actual_tokens: 420,
    });
  });

  it("reconcileQuota returns the RPC's ok value (no transformation)", async () => {
    const rpc = vi.fn().mockResolvedValue({ ok: true });
    const r = await reconcileQuota(
      { reservationId: "r1", actualTokens: 420 },
      rpc,
    );
    expect(r.ok).toBe(true);
  });
});
