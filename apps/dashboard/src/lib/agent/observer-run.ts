// observerRun — the async, idempotent, audit-heavy orchestration path
// for Loop 3 (observer findings). Composes QuotaGate + injected adapter
// poll + injected anomaly detector + ContextBuilder + injected LLM +
// GroundingVerifier + ProposalEmitter into one terminal RPC call.
//
// Per the M0 codex review, the entire run terminates in a single
// propose_observation() call regardless of outcome — completed (anomaly +
// proposal), no_anomaly, skipped_*, quota_exhausted, adapter_error, or
// llm_error. The observer_runs row is the audit trace; every run produces
// exactly one row.
//
// Stateless: every dependency injected. The function never imports a
// Supabase, Anthropic, or PostHog client directly.

import type { AgentContext } from "./types";
import { verifyGrounding } from "./grounding";
import type {
  EmitResult,
  ObservationStatus,
  StagedFinding,
} from "./proposal-emitter";
import type { LlmResult } from "./home-turn";

// ────────────────────────────────────────────────────────────────────
// Public types
// ────────────────────────────────────────────────────────────────────

export type ObserverRunArgs = {
  tenantId: string;
  /** Authenticated user id in v1.6 (always present); null for v1.7 cron. */
  requestedBy: string | null;
  signalId: string;
  signalType: "posthog.metric";
  metricName: string;
  windowStart: string;
  windowEnd: string;
  baselineStart: string;
  baselineEnd: string;
};

export type SignalPollResult = {
  current: number[];
  baseline: number[];
  /** Opaque adapter snapshot, persisted to observer_runs.window_snapshot. */
  windowSnapshot: unknown;
};

export type AnomalyDetection = {
  found: boolean;
  delta: number;
  deltaUnits: "ratio" | "percent" | "absolute";
  zScore: number;
  /** Adapter-shaped anomalies array persisted to observer_runs.anomalies_jsonb. */
  anomalies: unknown;
};

export type PollSignalFn = (input: {
  signalId: string;
  windowStart: string;
  windowEnd: string;
  baselineStart: string;
  baselineEnd: string;
}) => Promise<SignalPollResult>;

export type DetectAnomalyFn = (input: {
  current: number[];
  baseline: number[];
}) => AnomalyDetection;

export type BuildAnomalyContextFn = (input: {
  tenantId: string;
  signalType: "posthog.metric";
  signalId: string;
  metricName: string;
  delta: number;
  windowSnapshot: unknown;
}) => Promise<AgentContext>;

export type InvokeObserverLlmFn = (input: {
  ctx: AgentContext;
}) => Promise<LlmResult>;

export type EmitProposalFn = (args: {
  tenantId: string;
  signalId: string;
  windowStart: string;
  windowEnd: string;
  windowSnapshot: unknown;
  anomalies: unknown;
  llmCallId: string | null;
  llmTokensUsed: number | null;
  status: ObservationStatus;
  stagedFinding?: StagedFinding;
  proposalBody?: string;
  proposalSummary?: string;
  errorClass?: string;
}) => Promise<EmitResult>;

export type ObserverRunDeps = {
  reserveQuota: (args: {
    tenantId: string;
    actorId: string | null;
    estimatedTokens: number;
    kind: "home_turn" | "observer_run";
  }) =>
    | Promise<{ ok: true; reservationId: string }>
    | Promise<{ ok: false; reason: string }>;
  reconcileQuota: (args: {
    reservation_id: string;
    actual_tokens: number;
  }) => Promise<{ ok: boolean }>;
  pollSignal: PollSignalFn;
  detectAnomaly: DetectAnomalyFn;
  buildContext: BuildAnomalyContextFn;
  invokeLlm: InvokeObserverLlmFn;
  emitProposal: EmitProposalFn;
  retrievedMemoryIds: readonly string[];
};

export type ObserverRunResult =
  | { ok: true; observerRunId: string; proposalId: string | null }
  | { ok: false; reason: string };

// ────────────────────────────────────────────────────────────────────
// Constants
// ────────────────────────────────────────────────────────────────────

const ESTIMATED_TOKENS_PER_RUN = 2500;

// ────────────────────────────────────────────────────────────────────
// Orchestrator
// ────────────────────────────────────────────────────────────────────

export async function observerRun(
  args: ObserverRunArgs,
  deps: ObserverRunDeps,
): Promise<ObserverRunResult> {
  // 1) Quota gate. If refused, return without polling or emitting —
  // observer runs are best-effort under budget exhaustion, NOT logged.
  // Rationale: manual triggers in v1.6 mean the user clicked "run now";
  // they get an HTTP error response from the route handler with the
  // exhaustion reason. v1.7's cron path will need a different strategy.
  const reservation = await deps.reserveQuota({
    tenantId: args.tenantId,
    actorId: args.requestedBy,
    estimatedTokens: ESTIMATED_TOKENS_PER_RUN,
    kind: "observer_run",
  });
  if (!reservation.ok) {
    return { ok: false, reason: "quota_exhausted" };
  }

  let actualTokens = 0;
  let signal: SignalPollResult | null = null;

  try {
    // 2) Poll the adapter. If this throws, log the run as adapter_error.
    try {
      signal = await deps.pollSignal({
        signalId: args.signalId,
        windowStart: args.windowStart,
        windowEnd: args.windowEnd,
        baselineStart: args.baselineStart,
        baselineEnd: args.baselineEnd,
      });
    } catch (err) {
      const result = await deps.emitProposal({
        tenantId: args.tenantId,
        signalId: args.signalId,
        windowStart: args.windowStart,
        windowEnd: args.windowEnd,
        windowSnapshot: {},
        anomalies: [],
        llmCallId: null,
        llmTokensUsed: null,
        status: "adapter_error",
        errorClass: `adapter:${classify(err)}`,
      });
      return toResult(result, "adapter_error");
    }

    // 3) Detect anomaly. Pure; no IO; cannot throw.
    const detection = deps.detectAnomaly({
      current: signal.current,
      baseline: signal.baseline,
    });

    if (!detection.found) {
      const result = await deps.emitProposal({
        tenantId: args.tenantId,
        signalId: args.signalId,
        windowStart: args.windowStart,
        windowEnd: args.windowEnd,
        windowSnapshot: signal.windowSnapshot,
        anomalies: detection.anomalies,
        llmCallId: null,
        llmTokensUsed: null,
        status: "no_anomaly",
      });
      return toResult(result, "no_anomaly");
    }

    // 4) Anomaly detected — assemble context.
    const ctx = await deps.buildContext({
      tenantId: args.tenantId,
      signalType: args.signalType,
      signalId: args.signalId,
      metricName: args.metricName,
      delta: detection.delta,
      windowSnapshot: signal.windowSnapshot,
    });

    // 5) Invoke LLM. If this throws, log the run as llm_error.
    let llm: LlmResult;
    try {
      llm = await deps.invokeLlm({ ctx });
    } catch (err) {
      const result = await deps.emitProposal({
        tenantId: args.tenantId,
        signalId: args.signalId,
        windowStart: args.windowStart,
        windowEnd: args.windowEnd,
        windowSnapshot: signal.windowSnapshot,
        anomalies: detection.anomalies,
        llmCallId: null,
        llmTokensUsed: null,
        status: "llm_error",
        errorClass: `llm:${classify(err)}`,
      });
      return toResult(result, "llm_error");
    }
    actualTokens = llm.tokens;

    // 6) Verify grounding. Strip ungrounded claims before persisting.
    const grounded = verifyGrounding(llm.text, deps.retrievedMemoryIds);

    // 7) Stage the finding + emit.
    const stagedFinding: StagedFinding = {
      hypothesis: grounded.text,
      citations: grounded.citations,
      anomalySummary: {
        metric: args.metricName,
        delta: detection.delta,
        deltaUnits: detection.deltaUnits,
        zScore: detection.zScore,
      },
      baselineWindow: {
        currentStart: args.windowStart,
        currentEnd: args.windowEnd,
        baselineStart: args.baselineStart,
        baselineEnd: args.baselineEnd,
      },
    };

    const result = await deps.emitProposal({
      tenantId: args.tenantId,
      signalId: args.signalId,
      windowStart: args.windowStart,
      windowEnd: args.windowEnd,
      windowSnapshot: signal.windowSnapshot,
      anomalies: detection.anomalies,
      llmCallId: null,
      llmTokensUsed: llm.tokens,
      status: "completed",
      stagedFinding,
      proposalBody: grounded.text,
      proposalSummary: summarize(args.metricName, detection),
    });

    return toResult(result, "completed");
  } finally {
    await deps.reconcileQuota({
      reservation_id: reservation.reservationId,
      actual_tokens: actualTokens || ESTIMATED_TOKENS_PER_RUN,
    });
  }
}

// ────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────

function summarize(metric: string, d: AnomalyDetection): string {
  const sign = d.delta >= 0 ? "+" : "";
  const pct =
    d.deltaUnits === "ratio"
      ? `${sign}${(d.delta * 100).toFixed(1)}%`
      : `${sign}${d.delta.toFixed(2)} ${d.deltaUnits}`;
  return `${metric} anomaly: ${pct} vs baseline`;
}

function classify(err: unknown): string {
  if (err instanceof Error) {
    return err.constructor.name;
  }
  return "Unknown";
}

function toResult(
  emit: EmitResult,
  _statusLabel: ObservationStatus,
): ObserverRunResult {
  if (emit.ok) {
    return {
      ok: true,
      observerRunId: emit.observerRunId,
      proposalId: emit.proposalId,
    };
  }
  return { ok: false, reason: emit.error };
}
