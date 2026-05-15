import "server-only";
import { getSupabaseServerClient } from "@/lib/supabase/server";

// Side query used by /queue/[id] to render the v1.6 "How BBC found this"
// section when a proposal was filed by the observer. The canonical
// Proposal shape (in @bbc/store) intentionally stays observer-agnostic;
// this helper pulls the extra frontmatter fields when they're present
// so the page can render them without bloating the cross-mode contract.

export type ObservationMeta = {
  observerRunId: string;
  signalSource: string;
  signalId: string;
  anomalySummary: {
    metric?: string;
    delta?: number;
    deltaUnits?: string;
    zScore?: number;
  };
  baselineWindow: {
    currentStart?: string;
    currentEnd?: string;
    baselineStart?: string;
    baselineEnd?: string;
  };
  citations: string[];
};

export async function readObservationMeta(
  proposalId: string,
): Promise<ObservationMeta | null> {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase
    .from("queue_items")
    .select("frontmatter")
    .eq("proposal_id", proposalId)
    .maybeSingle();
  if (error || !data) return null;
  const fm = data.frontmatter as Record<string, unknown> | null;
  if (!fm || fm.type !== "observation") return null;

  const observerRunId = typeof fm.observer_run_id === "string" ? fm.observer_run_id : "";
  const signalSource = typeof fm.signal_source === "string" ? fm.signal_source : "";
  const signalId = typeof fm.signal_id === "string" ? fm.signal_id : "";
  const anomaly =
    fm.anomaly_summary && typeof fm.anomaly_summary === "object"
      ? (fm.anomaly_summary as Record<string, unknown>)
      : {};
  const baseline =
    fm.baseline_window && typeof fm.baseline_window === "object"
      ? (fm.baseline_window as Record<string, unknown>)
      : {};
  const citations = Array.isArray(fm.citations)
    ? (fm.citations as unknown[]).filter((c): c is string => typeof c === "string")
    : [];

  if (!observerRunId) return null;

  return {
    observerRunId,
    signalSource,
    signalId,
    anomalySummary: {
      metric: typeof anomaly.metric === "string" ? anomaly.metric : undefined,
      delta: typeof anomaly.delta === "number" ? anomaly.delta : undefined,
      deltaUnits:
        typeof anomaly.deltaUnits === "string" ? anomaly.deltaUnits : undefined,
      zScore: typeof anomaly.zScore === "number" ? anomaly.zScore : undefined,
    },
    baselineWindow: {
      currentStart:
        typeof baseline.currentStart === "string" ? baseline.currentStart : undefined,
      currentEnd:
        typeof baseline.currentEnd === "string" ? baseline.currentEnd : undefined,
      baselineStart:
        typeof baseline.baselineStart === "string" ? baseline.baselineStart : undefined,
      baselineEnd:
        typeof baseline.baselineEnd === "string" ? baseline.baselineEnd : undefined,
    },
    citations,
  };
}
