import "server-only";

import { NextRequest } from "next/server";

import {
  observerRun,
  type AgentContext,
  type AnomalyDetection,
  type EmitArgs,
  type ObserverRunDeps,
  type SignalPollResult,
} from "@/lib/agent";
import { requireActor, requireRole } from "@/lib/auth/require-user";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { detectZScoreAnomaly, isInCooldown } from "@/lib/observer/anomaly";
import { findMetric, pollMetric } from "@/lib/integrations/posthog";

export const runtime = "nodejs";

type SignalConfig = {
  metric: string;
  projectId: string;
  region: "us" | "eu";
  posthogApiKey?: string;
  windowDays?: number;
  baselineDays?: number;
  zThreshold?: number;
  minSamples?: number;
  cooldownHours?: number;
};

export async function POST(
  _req: NextRequest,
  ctx: { params: Promise<{ signalId: string }> },
) {
  const actorRes = await requireActor();
  if (!actorRes.ok) {
    return json({ ok: false, error: "unauthorized" }, 401);
  }
  const roleCheck = requireRole(actorRes.actor, "operator");
  if (!roleCheck.ok) {
    return json({ ok: false, error: roleCheck.output }, 403);
  }
  const actor = actorRes.actor;
  const { signalId } = await ctx.params;

  const supabase = await getSupabaseServerClient();

  // Load + verify the signal. RLS already scopes to the actor's tenant
  // (operator can read its own tenant's signals), but we double-check
  // tenant_id + enabled to fail fast with a clear error rather than a
  // generic 'signal disabled' from the RPC.
  const { data: signal, error: sigErr } = await supabase
    .from("observer_signals")
    .select("id, tenant_id, signal_type, config_jsonb, enabled, deleted_at")
    .eq("id", signalId)
    .maybeSingle();
  if (sigErr) return json({ ok: false, error: sigErr.message }, 500);
  if (!signal || signal.tenant_id !== actor.tenant_id || signal.deleted_at) {
    return json({ ok: false, error: "signal not found" }, 404);
  }
  if (!signal.enabled) {
    return json({ ok: false, error: "signal is disabled" }, 409);
  }
  if (signal.signal_type !== "posthog.metric") {
    return json(
      { ok: false, error: `unsupported signal_type ${signal.signal_type}` },
      400,
    );
  }

  const cfg = (signal.config_jsonb ?? {}) as SignalConfig;
  const metric = findMetric(cfg.metric);
  if (!metric) {
    return json({ ok: false, error: `unknown metric ${cfg.metric}` }, 400);
  }
  // PostHog key — v1.6 reads from env; per-tenant BYOK lookup via the
  // secrets vault lands later. Without a key we still want the route to
  // return a clean adapter_error rather than blow up.
  const posthogApiKey =
    cfg.posthogApiKey ?? process.env.POSTHOG_API_KEY ?? "";

  const windowDays = cfg.windowDays ?? metric.defaultWindowDays;
  const baselineDays = cfg.baselineDays ?? metric.defaultBaselineDays;
  const zThreshold = cfg.zThreshold ?? metric.defaultZThreshold;
  const minSamples = cfg.minSamples ?? 5;
  const cooldownHours = cfg.cooldownHours ?? 24;

  const now = new Date();
  const windowEnd = now.toISOString();
  const windowStart = daysAgoISO(now, windowDays);
  const baselineEnd = windowStart;
  const baselineStart = daysAgoISO(now, windowDays + baselineDays);

  // Cooldown gate. Look up the most recent completed run for this signal;
  // if within cooldownHours, emit a skipped_cooldown audit row via the
  // orchestrator without polling PostHog.
  const { data: lastCompleted } = await supabase
    .from("observer_runs")
    .select("ran_at")
    .eq("signal_id", signalId)
    .eq("status", "completed")
    .order("ran_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const inCooldown = isInCooldown({
    lastCompletedAt: lastCompleted?.ran_at ?? null,
    now,
    cooldownHours,
  });

  // ---- Build deps for observerRun -----------------------------------

  const noopReserveQuota: ObserverRunDeps["reserveQuota"] = async () => ({
    ok: true,
    reservationId: "noop-pre-m4",
  });
  const noopReconcileQuota: ObserverRunDeps["reconcileQuota"] = async () => ({
    ok: true,
  });

  const pollSignalDep: ObserverRunDeps["pollSignal"] = async (input) => {
    if (!posthogApiKey) {
      throw new Error("posthog api key not configured");
    }
    const out = await pollMetric({
      metricId: metric.id,
      windowStart: input.windowStart,
      windowEnd: input.windowEnd,
      baselineStart: input.baselineStart,
      baselineEnd: input.baselineEnd,
      posthogApiKey,
      projectId: cfg.projectId,
      region: cfg.region ?? "us",
    });
    const result: SignalPollResult = {
      current: out.current,
      baseline: out.baseline,
      windowSnapshot: out.windowSnapshot,
    };
    return result;
  };

  const detectAnomalyDep: ObserverRunDeps["detectAnomaly"] = (input) => {
    if (inCooldown) {
      const skipped: AnomalyDetection = {
        kind: "skipped_cooldown",
        anomalies: { cooldownHours, lastCompletedAt: lastCompleted?.ran_at },
      };
      return skipped;
    }
    return detectZScoreAnomaly({
      current: input.current,
      baseline: input.baseline,
      config: { zThreshold, minSamples },
    });
  };

  const stubBuildContext: ObserverRunDeps["buildContext"] = async (
    input,
  ): Promise<AgentContext> => ({
    tenantId: input.tenantId,
    actorId: null,
    role: "operator",
    rolePack: { voice: "", vendors: [], decisions: [], glossary: {} },
    buffer: {
      kind: "anomaly",
      anomaly: {
        signalType: input.signalType,
        signalId: input.signalId,
        metricName: input.metricName,
        delta: input.delta,
        windowSnapshot: input.windowSnapshot,
      },
    },
    alwaysOn: { memoryIndexExcerpt: "", workspaceName: actor.tenant_slug },
  });

  const stubInvokeLlm: ObserverRunDeps["invokeLlm"] = async ({ ctx }) => {
    const anomaly = ctx.buffer.kind === "anomaly" ? ctx.buffer.anomaly : null;
    const metricName = anomaly?.metricName ?? "the metric";
    const delta = anomaly?.delta ?? 0;
    return {
      text:
        `${metricName} moved by ${delta} relative to the baseline window. ` +
        `Worth a closer look — re-running with real LLM context will land in M5 polish.`,
      toolCalls: [],
      tokens: 0,
    };
  };

  const emitProposalDep: ObserverRunDeps["emitProposal"] = async (
    args: EmitArgs,
  ) => {
    const isCompleted = args.status === "completed";
    const { data, error } = await supabase.rpc("propose_observation", {
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
      p_error_class: !isCompleted ? args.errorClass ?? null : null,
      p_proposal_body: isCompleted ? args.proposalBody : null,
      p_proposal_summary: isCompleted ? args.proposalSummary : null,
    });
    if (error) return { ok: false, error: error.message };
    const r = (data ?? {}) as {
      ok?: boolean;
      observerRunId?: string;
      proposalId?: string | null;
      error?: string;
    };
    if (r.ok === false) return { ok: false, error: r.error ?? "rpc failed" };
    return {
      ok: true,
      observerRunId: r.observerRunId ?? "",
      proposalId: r.proposalId ?? null,
    };
  };

  const result = await observerRun(
    {
      tenantId: actor.tenant_id,
      requestedBy: actor.user_id,
      signalId: signal.id,
      signalType: "posthog.metric",
      metricName: metric.id,
      windowStart,
      windowEnd,
      baselineStart,
      baselineEnd,
    },
    {
      reserveQuota: noopReserveQuota,
      reconcileQuota: noopReconcileQuota,
      pollSignal: pollSignalDep,
      detectAnomaly: detectAnomalyDep,
      buildContext: stubBuildContext,
      invokeLlm: stubInvokeLlm,
      emitProposal: emitProposalDep,
      retrievedMemoryIds: [],
    },
  );

  if (!result.ok) return json(result, 200);
  return json(result, 200);
}

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function daysAgoISO(now: Date, days: number): string {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
}
