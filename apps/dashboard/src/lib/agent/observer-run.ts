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
  EmitArgs,
  EmitResult,
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

/**
 * Discriminated union — the detector reports one of four outcomes so the
 * orchestrator can route each terminal status type explicitly (codex M1
 * review P1 #2). The M3.3 Z-score implementation populates this shape.
 */
export type AnomalyDetection =
  | {
      kind: "anomaly";
      delta: number;
      deltaUnits: "ratio" | "percent" | "absolute";
      zScore: number;
      /** Adapter-shaped anomalies array persisted to observer_runs.anomalies_jsonb. */
      anomalies: unknown;
    }
  | {
      kind: "no_anomaly";
      delta: number;
      deltaUnits: "ratio" | "percent" | "absolute";
      zScore: number;
      anomalies: unknown;
    }
  | {
      kind: "skipped_cooldown";
      /** Optional informational fields; orchestrator ignores them. */
      anomalies?: unknown;
    }
  | {
      kind: "skipped_min_sample";
      anomalies?: unknown;
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

/**
 * Use the proposal-emitter's `EmitArgs` shape directly so the
 * discriminated-union compile-time enforcement (status='completed'
 * requires stagedFinding + proposalBody + proposalSummary; everything
 * else requires those absent) is preserved at the orchestrator boundary
 * too (codex M1 review P2 #7).
 */
export type EmitProposalFn = (args: EmitArgs) => Promise<EmitResult>;

export type ObserverRunDeps = {
  reserveQuota: (args: {
    tenantId: string;
    actorId: string | null;
    estimatedTokens: number;
    kind: "home_turn" | "observer_run";
  }) => Promise<
    | { ok: true; reservationId: string }
    | { ok: false; reason: string }
  >;
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
  // 1) Quota gate. Even under exhaustion we still emit a
  // status='quota_exhausted' observer_runs row so the audit trail is
  // complete (codex M1 review P2 #6). No external traffic happens — the
  // emit goes directly through propose_observation() which inserts the
  // audit row and skips the queue insert because proposal_body is null.
  const reservation = await deps.reserveQuota({
    tenantId: args.tenantId,
    actorId: args.requestedBy,
    estimatedTokens: ESTIMATED_TOKENS_PER_RUN,
    kind: "observer_run",
  });
  if (!reservation.ok) {
    await deps.emitProposal({
      tenantId: args.tenantId,
      signalId: args.signalId,
      windowStart: args.windowStart,
      windowEnd: args.windowEnd,
      windowSnapshot: {},
      anomalies: [],
      llmCallId: null,
      llmTokensUsed: null,
      status: "quota_exhausted",
      errorClass: `quota:${reservation.reason}`,
    });
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
      return toResult(result);
    }

    // 3) Detect anomaly. Pure; no IO; cannot throw.
    const detection = deps.detectAnomaly({
      current: signal.current,
      baseline: signal.baseline,
    });

    // 3a) Skipped paths (cooldown, min-sample) — emit terminal status, no LLM call.
    if (
      detection.kind === "skipped_cooldown" ||
      detection.kind === "skipped_min_sample"
    ) {
      const result = await deps.emitProposal({
        tenantId: args.tenantId,
        signalId: args.signalId,
        windowStart: args.windowStart,
        windowEnd: args.windowEnd,
        windowSnapshot: signal.windowSnapshot,
        anomalies: detection.anomalies ?? [],
        llmCallId: null,
        llmTokensUsed: null,
        status: detection.kind,
      });
      return toResult(result);
    }

    // 3b) No anomaly — emit terminal status, no LLM call.
    if (detection.kind === "no_anomaly") {
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
      return toResult(result);
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
      return toResult(result);
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

    return toResult(result);
  } finally {
    // Reconcile — guarded with try/catch so a reconciliation failure
    // doesn't poison the user-facing result (codex M1 review P2 #5).
    // If reconcile throws, we log and move on; the next reserve_quota
    // will lazy-clean orphaned reservations after 5 minutes per the
    // M0 migration policy.
    try {
      await deps.reconcileQuota({
        reservation_id: reservation.reservationId,
        actual_tokens: actualTokens || ESTIMATED_TOKENS_PER_RUN,
      });
    } catch (reconcileErr) {
      // Intentionally swallow — see comment above. The reservation row
      // is now an orphan that lazy-cleanup will reap on the next
      // reserve_quota() invocation for this tenant.
      void reconcileErr;
    }
  }
}

// ────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────

function summarize(
  metric: string,
  d: Extract<AnomalyDetection, { kind: "anomaly" }>,
): string {
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

function toResult(emit: EmitResult): ObserverRunResult {
  if (emit.ok) {
    return {
      ok: true,
      observerRunId: emit.observerRunId,
      proposalId: emit.proposalId,
    };
  }
  return { ok: false, reason: emit.error };
}
