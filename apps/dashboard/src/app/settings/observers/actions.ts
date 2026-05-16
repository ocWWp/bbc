"use server";

import { revalidatePath } from "next/cache";

import { requireActor, requireRole } from "@/lib/auth/require-user";
import { getSupabaseServerClient } from "@/lib/supabase/server";

const SIGNAL_ID_RE = /^[0-9a-fA-F-]{36}$/;

export type SignalSummary = {
  id: string;
  signalType: string;
  metricName: string;
  enabled: boolean;
  createdAt: string;
  disabledAt: string | null;
  lastRunAt: string | null;
  lastRunStatus: string | null;
};

type ListSignalsResult =
  | { ok: true; signals: SignalSummary[] }
  | { ok: false; error: string };

export async function listSignals(): Promise<ListSignalsResult> {
  const a = await requireActor();
  if (!a.ok) return { ok: false, error: a.output };

  const supabase = await getSupabaseServerClient();
  const { data: signals, error: sigErr } = await supabase
    .from("observer_signals")
    .select("id, signal_type, config_jsonb, enabled, created_at, disabled_at, deleted_at")
    .eq("tenant_id", a.actor.tenant_id)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (sigErr) return { ok: false, error: sigErr.message };

  const rows = (signals ?? []) as Array<{
    id: string;
    signal_type: string;
    config_jsonb: Record<string, unknown> | null;
    enabled: boolean;
    created_at: string;
    disabled_at: string | null;
  }>;

  // Fetch most-recent run per signal in a single roundtrip. Small enough
  // for v1.6 to do client-side; if signal count grows we'll move to a
  // SQL function with DISTINCT ON.
  const ids = rows.map((r) => r.id);
  let lastRuns: Record<string, { ran_at: string; status: string }> = {};
  if (ids.length > 0) {
    const { data: runs } = await supabase
      .from("observer_runs")
      .select("signal_id, ran_at, status")
      .in("signal_id", ids)
      .order("ran_at", { ascending: false });
    for (const r of (runs ?? []) as Array<{
      signal_id: string;
      ran_at: string;
      status: string;
    }>) {
      if (!lastRuns[r.signal_id]) {
        lastRuns[r.signal_id] = { ran_at: r.ran_at, status: r.status };
      }
    }
  }

  return {
    ok: true,
    signals: rows.map((r) => ({
      id: r.id,
      signalType: r.signal_type,
      metricName:
        typeof r.config_jsonb?.metric === "string"
          ? (r.config_jsonb.metric as string)
          : r.signal_type,
      enabled: r.enabled,
      createdAt: r.created_at,
      disabledAt: r.disabled_at,
      lastRunAt: lastRuns[r.id]?.ran_at ?? null,
      lastRunStatus: lastRuns[r.id]?.status ?? null,
    })),
  };
}

type MutResult = { ok: true } | { ok: false; error: string };

async function setSignalEnabled(signalId: string, enabled: boolean): Promise<MutResult> {
  const a = await requireActor();
  if (!a.ok) return { ok: false, error: a.output };
  const r = requireRole(a.actor, "operator");
  if (!r.ok) return { ok: false, error: r.output };

  if (!SIGNAL_ID_RE.test(signalId)) return { ok: false, error: "Invalid id." };

  const supabase = await getSupabaseServerClient();
  const update: Record<string, unknown> = { enabled };
  if (!enabled) update.disabled_at = new Date().toISOString();
  if (enabled) update.disabled_at = null;

  const { error } = await supabase
    .from("observer_signals")
    .update(update)
    .eq("id", signalId)
    .eq("tenant_id", a.actor.tenant_id);

  if (error) return { ok: false, error: error.message };
  revalidatePath("/settings/observers");
  return { ok: true };
}

export async function enableSignal(signalId: string): Promise<MutResult> {
  return setSignalEnabled(signalId, true);
}

export async function disableSignal(signalId: string): Promise<MutResult> {
  return setSignalEnabled(signalId, false);
}

export async function deleteSignal(signalId: string): Promise<MutResult> {
  const a = await requireActor();
  if (!a.ok) return { ok: false, error: a.output };
  const r = requireRole(a.actor, "operator");
  if (!r.ok) return { ok: false, error: r.output };

  if (!SIGNAL_ID_RE.test(signalId)) return { ok: false, error: "Invalid id." };

  const supabase = await getSupabaseServerClient();
  // Soft-delete: keep observer_runs audit intact via FK cascade-on-tenant
  // (not on signal). The signal stays queryable for past runs.
  const { error } = await supabase
    .from("observer_signals")
    .update({ deleted_at: new Date().toISOString(), enabled: false })
    .eq("id", signalId)
    .eq("tenant_id", a.actor.tenant_id);

  if (error) return { ok: false, error: error.message };
  revalidatePath("/settings/observers");
  return { ok: true };
}

export type SignalRun = {
  id: string;
  ranAt: string;
  status: string;
  windowStart: string;
  windowEnd: string;
  proposalsFiled: string[];
  errorClass: string | null;
  llmTokensUsed: number | null;
};

export async function listSignalRuns(
  signalId: string,
  limit = 50,
): Promise<{ ok: true; runs: SignalRun[] } | { ok: false; error: string }> {
  const a = await requireActor();
  if (!a.ok) return { ok: false, error: a.output };

  if (!SIGNAL_ID_RE.test(signalId)) return { ok: false, error: "Invalid id." };

  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase
    .from("observer_runs")
    .select(
      "id, ran_at, status, window_start, window_end, proposals_filed, error_class, llm_tokens_used, tenant_id",
    )
    .eq("signal_id", signalId)
    .eq("tenant_id", a.actor.tenant_id)
    .order("ran_at", { ascending: false })
    .limit(limit);

  if (error) return { ok: false, error: error.message };

  return {
    ok: true,
    runs: ((data ?? []) as Array<{
      id: string;
      ran_at: string;
      status: string;
      window_start: string;
      window_end: string;
      proposals_filed: string[] | null;
      error_class: string | null;
      llm_tokens_used: number | null;
    }>).map((r) => ({
      id: r.id,
      ranAt: r.ran_at,
      status: r.status,
      windowStart: r.window_start,
      windowEnd: r.window_end,
      proposalsFiled: r.proposals_filed ?? [],
      errorClass: r.error_class,
      llmTokensUsed: r.llm_tokens_used,
    })),
  };
}
