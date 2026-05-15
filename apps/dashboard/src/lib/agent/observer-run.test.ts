import { describe, it, expect, vi } from "vitest";
import { observerRun } from "./observer-run";
import type { AgentContext } from "./types";

const baseSignalCtx = (): AgentContext => ({
  tenantId: "t1",
  actorId: "u1",
  role: "operator",
  rolePack: { voice: "", vendors: [], decisions: [], glossary: {} },
  buffer: {
    kind: "anomaly",
    anomaly: {
      signalType: "posthog.metric",
      signalId: "sig-1",
      metricName: "churn",
      delta: 0.12,
      windowSnapshot: { p: 1 },
    },
  },
  alwaysOn: { memoryIndexExcerpt: "", workspaceName: "acme" },
});

const baseArgs = {
  tenantId: "t1",
  requestedBy: "u1",
  signalId: "sig-1",
  signalType: "posthog.metric" as const,
  metricName: "churn",
  windowStart: "2026-05-15T00:00:00Z",
  windowEnd: "2026-05-15T23:59:59Z",
  baselineStart: "2026-05-08T00:00:00Z",
  baselineEnd: "2026-05-14T23:59:59Z",
};

const happyDeps = () => ({
  reserveQuota: vi
    .fn()
    .mockResolvedValue({ ok: true, reservationId: "r1" }),
  reconcileQuota: vi.fn().mockResolvedValue({ ok: true }),
  pollSignal: vi.fn().mockResolvedValue({
    current: [12, 13, 14],
    baseline: [1, 1, 1],
    windowSnapshot: { current: [12, 13, 14], baseline: [1, 1, 1] },
  }),
  detectAnomaly: vi.fn().mockReturnValue({
    kind: "anomaly" as const,
    delta: 0.12,
    deltaUnits: "ratio" as const,
    zScore: 3.2,
    anomalies: [{ metric: "churn", delta: 0.12 }],
  }),
  buildContext: vi.fn().mockResolvedValue(baseSignalCtx()),
  invokeLlm: vi.fn().mockResolvedValue({
    text: "Churn rose 12% [mem:m0042].",
    toolCalls: [],
    tokens: 500,
  }),
  retrievedMemoryIds: ["m0042"],
  emitProposal: vi.fn().mockResolvedValue({
    ok: true,
    observerRunId: "run-1",
    proposalId: "prop_abc",
  }),
});

describe("observerRun", () => {
  it("skips classifier — anomaly intent is fixed (verify classify is NOT in deps)", async () => {
    // observerRun's deps shape does not include a classifier. Type-level
    // guarantee — this test asserts the runtime path doesn't try to import
    // one either. We satisfy this by verifying the function completes with
    // happy deps that have no classify field.
    const deps = happyDeps();
    expect("classify" in deps).toBe(false);
    const r = await observerRun(baseArgs, deps);
    expect(r.ok).toBe(true);
  });

  it("anomaly path: emits proposal with status='completed' + stagedFinding + body", async () => {
    const deps = happyDeps();
    await observerRun(baseArgs, deps);

    expect(deps.emitProposal).toHaveBeenCalledOnce();
    const payload = deps.emitProposal.mock.calls[0][0];
    expect(payload.status).toBe("completed");
    expect(payload.stagedFinding.hypothesis).toContain("Churn");
    expect(payload.stagedFinding.citations).toEqual(["m0042"]);
    expect(payload.proposalBody).toBeTypeOf("string");
    expect(payload.proposalSummary.length).toBeGreaterThan(0);
  });

  it("no-anomaly path: emits proposal with status='no_anomaly', no LLM call", async () => {
    const deps = {
      ...happyDeps(),
      detectAnomaly: vi.fn().mockReturnValue({
        kind: "no_anomaly" as const,
        delta: 0,
        deltaUnits: "ratio" as const,
        zScore: 0.4,
        anomalies: [],
      }),
    };
    await observerRun(baseArgs, deps);
    expect(deps.invokeLlm).not.toHaveBeenCalled();
    expect(deps.emitProposal).toHaveBeenCalledOnce();
    const payload = deps.emitProposal.mock.calls[0][0];
    expect(payload.status).toBe("no_anomaly");
  });

  it("quota-exhausted path: emits status='quota_exhausted' audit row, skips pollSignal + invokeLlm", async () => {
    const deps = {
      ...happyDeps(),
      reserveQuota: vi
        .fn()
        .mockResolvedValue({ ok: false, reason: "tokens_exceeded" }),
    };
    const r = await observerRun(baseArgs, deps);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("quota_exhausted");
    // No external traffic.
    expect(deps.pollSignal).not.toHaveBeenCalled();
    expect(deps.invokeLlm).not.toHaveBeenCalled();
    // No reservation → no reconcile.
    expect(deps.reconcileQuota).not.toHaveBeenCalled();
    // BUT emit IS called so the audit trail records the attempt.
    expect(deps.emitProposal).toHaveBeenCalledOnce();
    const payload = deps.emitProposal.mock.calls[0][0];
    expect(payload.status).toBe("quota_exhausted");
    expect(payload.errorClass).toMatch(/quota/);
  });

  it("skipped_cooldown path: emits status='skipped_cooldown', no LLM call", async () => {
    const deps = {
      ...happyDeps(),
      detectAnomaly: vi
        .fn()
        .mockReturnValue({ kind: "skipped_cooldown" as const }),
    };
    await observerRun(baseArgs, deps);
    expect(deps.invokeLlm).not.toHaveBeenCalled();
    expect(deps.emitProposal).toHaveBeenCalledOnce();
    expect(deps.emitProposal.mock.calls[0][0].status).toBe(
      "skipped_cooldown",
    );
  });

  it("skipped_min_sample path: emits status='skipped_min_sample', no LLM call", async () => {
    const deps = {
      ...happyDeps(),
      detectAnomaly: vi
        .fn()
        .mockReturnValue({ kind: "skipped_min_sample" as const }),
    };
    await observerRun(baseArgs, deps);
    expect(deps.invokeLlm).not.toHaveBeenCalled();
    expect(deps.emitProposal).toHaveBeenCalledOnce();
    expect(deps.emitProposal.mock.calls[0][0].status).toBe(
      "skipped_min_sample",
    );
  });

  it("adapter-error path: pollSignal throws → emit with status='adapter_error'", async () => {
    const deps = {
      ...happyDeps(),
      pollSignal: vi.fn().mockRejectedValue(new Error("posthog 503")),
    };
    await observerRun(baseArgs, deps);
    expect(deps.emitProposal).toHaveBeenCalledOnce();
    const payload = deps.emitProposal.mock.calls[0][0];
    expect(payload.status).toBe("adapter_error");
    expect(payload.errorClass).toMatch(/adapter/i);
    expect(deps.invokeLlm).not.toHaveBeenCalled();
  });

  it("llm-error path: invokeLlm throws → emit with status='llm_error'", async () => {
    const deps = {
      ...happyDeps(),
      invokeLlm: vi.fn().mockRejectedValue(new Error("rate limit")),
    };
    await observerRun(baseArgs, deps);
    expect(deps.emitProposal).toHaveBeenCalledOnce();
    const payload = deps.emitProposal.mock.calls[0][0];
    expect(payload.status).toBe("llm_error");
    expect(payload.errorClass).toMatch(/llm/i);
  });

  it("reconciles quota on every reservation-holding path (anomaly, no-anomaly, errors)", async () => {
    const paths = [
      happyDeps(),
      {
        ...happyDeps(),
        detectAnomaly: vi.fn().mockReturnValue({
          kind: "no_anomaly" as const,
          delta: 0,
          deltaUnits: "ratio" as const,
          zScore: 0.4,
          anomalies: [],
        }),
      },
      {
        ...happyDeps(),
        invokeLlm: vi.fn().mockRejectedValue(new Error("rate limit")),
      },
    ];
    for (const deps of paths) {
      await observerRun(baseArgs, deps);
      expect(deps.reconcileQuota).toHaveBeenCalled();
    }
  });

  it("does not throw when reconcileQuota itself fails (logs and swallows)", async () => {
    const deps = {
      ...happyDeps(),
      reconcileQuota: vi
        .fn()
        .mockRejectedValue(new Error("DB unavailable")),
    };
    const r = await observerRun(baseArgs, deps);
    // Run succeeded from the user's perspective; reconcile orphan will
    // be reaped by the next reserve_quota call's lazy cleanup.
    expect(r.ok).toBe(true);
  });

  it("strips ungrounded LLM claims before emitting the proposal", async () => {
    const deps = {
      ...happyDeps(),
      invokeLlm: vi.fn().mockResolvedValue({
        text: "Churn rose 12% [mem:m9999].",
        toolCalls: [],
        tokens: 400,
      }),
      retrievedMemoryIds: [] as string[],
    };
    await observerRun(baseArgs, deps);
    const payload = deps.emitProposal.mock.calls[0][0];
    // When grounding fails completely, no proposal_body would be useful;
    // observerRun should record the run as 'completed' but with the
    // grounded fallback (or downgrade to no_anomaly). v1.6 choice:
    // emit the grounded text (which carries the fallback sentence) and
    // record status='completed' since the adapter DID find an anomaly.
    expect(payload.stagedFinding.hypothesis).not.toContain("m9999");
    expect(payload.stagedFinding.citations).toEqual([]);
  });
});
