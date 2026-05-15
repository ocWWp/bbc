import { describe, it, expect, vi } from "vitest";
import { emitObservationProposal } from "./proposal-emitter";

const baseArgs = {
  tenantId: "t1",
  signalId: "sig-1",
  windowStart: "2026-05-15T00:00:00Z",
  windowEnd: "2026-05-15T23:59:59Z",
  windowSnapshot: { current: [1, 2, 3], baseline: [1, 1, 1] },
  anomalies: [{ metric: "churn", delta: 0.12 }],
  llmCallId: "msg_abc",
  llmTokensUsed: 1234,
};

describe("emitObservationProposal", () => {
  it("dispatches the completed path with full staged_finding + proposal body", async () => {
    const rpc = vi.fn().mockResolvedValue({
      ok: true,
      observerRunId: "run-1",
      proposalId: "prop_abc",
    });

    const r = await emitObservationProposal(
      {
        ...baseArgs,
        status: "completed",
        stagedFinding: {
          hypothesis: "Churn rose 12% [mem:m0042].",
          citations: ["m0042"],
          anomalySummary: {
            metric: "churn",
            delta: 0.12,
            deltaUnits: "ratio",
            zScore: 3.2,
          },
          baselineWindow: {
            currentStart: "2026-05-15T00:00:00Z",
            currentEnd: "2026-05-15T23:59:59Z",
            baselineStart: "2026-05-08T00:00:00Z",
            baselineEnd: "2026-05-14T23:59:59Z",
          },
        },
        proposalBody: "Churn rose 12% [mem:m0042].",
        proposalSummary: "Churn spike — possible memory tie-in",
      },
      rpc,
    );

    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.observerRunId).toBe("run-1");
      expect(r.proposalId).toBe("prop_abc");
    }
    expect(rpc).toHaveBeenCalledOnce();
    const payload = rpc.mock.calls[0][0];
    expect(payload.p_status).toBe("completed");
    expect(payload.p_signal_id).toBe("sig-1");
    expect(payload.p_staged_finding).toMatchObject({
      hypothesis: "Churn rose 12% [mem:m0042].",
      citations: ["m0042"],
    });
    expect(payload.p_proposal_summary).toBe(
      "Churn spike — possible memory tie-in",
    );
  });

  it("dispatches the no-anomaly path with staged_finding + body null", async () => {
    const rpc = vi.fn().mockResolvedValue({
      ok: true,
      observerRunId: "run-2",
      proposalId: null,
    });

    const r = await emitObservationProposal(
      { ...baseArgs, status: "no_anomaly" },
      rpc,
    );

    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.proposalId).toBeNull();
    }
    const payload = rpc.mock.calls[0][0];
    expect(payload.p_status).toBe("no_anomaly");
    expect(payload.p_staged_finding).toBeNull();
    expect(payload.p_proposal_body).toBeNull();
    expect(payload.p_proposal_summary).toBeNull();
  });

  it("forwards quota_exhausted as a terminal status (no proposal)", async () => {
    const rpc = vi.fn().mockResolvedValue({
      ok: true,
      observerRunId: "run-3",
      proposalId: null,
    });
    await emitObservationProposal(
      { ...baseArgs, status: "quota_exhausted" },
      rpc,
    );
    const payload = rpc.mock.calls[0][0];
    expect(payload.p_status).toBe("quota_exhausted");
    expect(payload.p_staged_finding).toBeNull();
  });

  it("rejects in-process if 'completed' is passed without staged_finding (defense in depth)", async () => {
    const rpc = vi.fn();
    await expect(
      emitObservationProposal(
        { ...baseArgs, status: "completed" } as any,
        rpc,
      ),
    ).rejects.toThrow(/staged_finding required/i);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("forwards RPC failures to the caller (no swallowing)", async () => {
    const rpc = vi
      .fn()
      .mockResolvedValue({ ok: false, error: "operator role required" });
    const r = await emitObservationProposal(
      { ...baseArgs, status: "no_anomaly" },
      rpc,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/operator/);
  });
});
