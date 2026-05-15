// ProposalEmitter — TS wrapper around the propose_observation() RPC
// designed in M0's migration policy and shipping in M3.
//
// Per the M0 codex review (P1 #5/#6/#7): observation proposals do NOT
// route through propose_change() — that would force extending the
// canonical queue RPC and breaking file-mode/DB-mode parity. Instead,
// v1.6 ships a dedicated SECURITY DEFINER RPC that writes both the
// queue row and the observer_runs row in one transaction with a shared
// pre-generated observer_run_id.
//
// This wrapper handles the camelCase↔snake_case boundary and enforces
// the same status-dependent argument validation the SQL RPC will (defense
// in depth — a TypeError here saves an RPC round-trip and a DB raise).

export type ObservationStatus =
  | "completed"
  | "no_anomaly"
  | "skipped_cooldown"
  | "skipped_min_sample"
  | "quota_exhausted"
  | "adapter_error"
  | "llm_error";

export type StagedFinding = {
  /** Agent-generated hypothesis, post-GroundingVerifier. */
  hypothesis: string;
  /** De-duplicated memory IDs the hypothesis cites. */
  citations: string[];
  anomalySummary: {
    metric: string;
    delta: number;
    deltaUnits: "ratio" | "percent" | "absolute";
    zScore: number;
  };
  baselineWindow: {
    currentStart: string;
    currentEnd: string;
    baselineStart: string;
    baselineEnd: string;
  };
};

export type EmitArgsCommon = {
  tenantId: string;
  signalId: string;
  windowStart: string;
  windowEnd: string;
  windowSnapshot: unknown;
  anomalies: unknown;
  llmCallId: string | null;
  llmTokensUsed: number | null;
};

export type EmitArgs =
  | (EmitArgsCommon & {
      status: "completed";
      stagedFinding: StagedFinding;
      proposalBody: string;
      proposalSummary: string;
    })
  | (EmitArgsCommon & {
      status: Exclude<ObservationStatus, "completed">;
      errorClass?: string;
    });

export type EmitResult =
  | { ok: true; observerRunId: string; proposalId: string | null }
  | { ok: false; error: string };

/**
 * Snake-cased shape matching the propose_observation() RPC signature.
 * All keys defined to either a value or null so the RPC layer doesn't
 * have to handle 'undefined' separately.
 */
export type ProposeObservationRpc = (args: {
  p_tenant_id: string;
  p_signal_id: string;
  p_window_start: string;
  p_window_end: string;
  p_window_snapshot: unknown;
  p_anomalies: unknown;
  p_staged_finding: unknown;
  p_llm_call_id: string | null;
  p_llm_tokens_used: number | null;
  p_status: ObservationStatus;
  p_error_class: string | null;
  p_proposal_body: string | null;
  p_proposal_summary: string | null;
}) => Promise<
  | { ok: true; observerRunId: string; proposalId: string | null }
  | { ok: false; error: string }
>;

export async function emitObservationProposal(
  args: EmitArgs,
  rpc: ProposeObservationRpc,
): Promise<EmitResult> {
  // Defense in depth: enforce the same status-conditional invariant the
  // SQL RPC enforces. Catching this in-process saves an RPC round-trip.
  if (args.status === "completed") {
    const { stagedFinding, proposalBody, proposalSummary } = args;
    if (!stagedFinding || !proposalBody || !proposalSummary) {
      throw new Error(
        "staged_finding required for status='completed'; got null/undefined",
      );
    }
  }

  const isCompleted = args.status === "completed";

  return rpc({
    p_tenant_id: args.tenantId,
    p_signal_id: args.signalId,
    p_window_start: args.windowStart,
    p_window_end: args.windowEnd,
    p_window_snapshot: args.windowSnapshot,
    p_anomalies: args.anomalies,
    p_staged_finding: isCompleted ? args.stagedFinding : null,
    p_llm_call_id: args.llmCallId,
    p_llm_tokens_used: args.llmTokensUsed,
    p_status: args.status,
    p_error_class: !isCompleted ? (args.errorClass ?? null) : null,
    p_proposal_body: isCompleted ? args.proposalBody : null,
    p_proposal_summary: isCompleted ? args.proposalSummary : null,
  });
}
