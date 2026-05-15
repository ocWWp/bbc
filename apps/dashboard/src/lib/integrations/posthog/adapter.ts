// PostHog adapter — implements the read-only signal capability class
// used by the observer.
//
// Capability class declaration:
//   scope:        read-only event aggregations (no writes, no event ingestion)
//   retention:    values polled per run; we do not persist raw PostHog rows
//                 — only the daily series snapshot in observer_runs.window_snapshot
//   pii:          PostHog stores person_ids; the adapter discards person-level data,
//                 only daily aggregates leave PostHog
//   baseline:     rolling N-day window (per metric default) vs longer baseline
//   kill-switch:  observer_signals.enabled=false stops polling immediately
//   cost-model:   1 HogQL query per signal per run; PostHog charges by query

import {
  findMetric,
  POSTHOG_METRIC_CATALOG,
  type MetricSpec,
} from "./metric-catalog";

// Capability declaration object, exported for the role-tool-bundle
// lookup path (ADR-0008) so the observer skill manifest can show users
// exactly what the adapter is allowed to do.
export const POSTHOG_CAPABILITY = {
  signalType: "posthog.metric" as const,
  scope: "read-only" as const,
  retention: "daily-aggregate-snapshot" as const,
  pii: "none-after-aggregate" as const,
  baseline: "rolling-window-vs-baseline" as const,
  killSwitch: "observer_signals.enabled" as const,
  costModel: "one-hogql-query-per-run" as const,
};

export type ListAvailableMetricsInput = {
  /**
   * Tenant binding for PostHog. Used to gate the catalog when an
   * adapter version restricts metrics to specific projects; v1.6 ships
   * a static catalog so this is informational only.
   */
  binding: {
    projectId: string | null;
    region: "us" | "eu" | null;
  };
};

/**
 * Returns the catalog of metrics available to the caller. v1.6: static
 * — every tenant sees the same shortlist. v1.7+ can prune based on
 * project capabilities (e.g., metric requires "session recording"
 * pageviews which not every PostHog project has).
 */
export function listAvailableMetrics(
  _input: ListAvailableMetricsInput,
): readonly MetricSpec[] {
  return POSTHOG_METRIC_CATALOG;
}

// ────────────────────────────────────────────────────────────────────
// pollMetric — the only PostHog-hitting code path in v1.6
// ────────────────────────────────────────────────────────────────────

export type PollMetricInput = {
  metricId: string;
  /** ISO timestamps. PostHog's HogQL uses string comparisons. */
  windowStart: string;
  windowEnd: string;
  baselineStart: string;
  baselineEnd: string;
  posthogApiKey: string;
  projectId: string;
  region: "us" | "eu";
  /** Injected fetch so tests stub the HTTP boundary. Defaults to global. */
  fetchImpl?: typeof fetch;
};

export type PollMetricResult = {
  current: number[];
  baseline: number[];
  /** Snapshot persisted into observer_runs.window_snapshot. */
  windowSnapshot: {
    metricId: string;
    windowStart: string;
    windowEnd: string;
    baselineStart: string;
    baselineEnd: string;
    rowsCurrent: number;
    rowsBaseline: number;
  };
};

export class PostHogAdapterError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "PostHogAdapterError";
  }
}

/**
 * Fetches two daily-aggregate series from PostHog (current + baseline)
 * for the given metric. The metric's HogQL template is rendered with
 * the window placeholders; PostHog's `/api/projects/:id/query` endpoint
 * returns a tabular result. The second column is the value series.
 *
 * Errors are wrapped in PostHogAdapterError so the observer orchestrator
 * can map them to status='adapter_error'.
 */
export async function pollMetric(input: PollMetricInput): Promise<PollMetricResult> {
  const metric = findMetric(input.metricId);
  if (!metric) {
    throw new PostHogAdapterError(`unknown metric: ${input.metricId}`);
  }

  const fetchImpl = input.fetchImpl ?? fetch;
  const base = input.region === "eu" ? "https://eu.posthog.com" : "https://us.posthog.com";
  const url = `${base}/api/projects/${encodeURIComponent(input.projectId)}/query/`;

  const currentQuery = renderTemplate(metric.hogqlTemplate, {
    windowStart: input.windowStart,
    windowEnd: input.windowEnd,
  });
  const baselineQuery = renderTemplate(metric.hogqlTemplate, {
    windowStart: input.baselineStart,
    windowEnd: input.baselineEnd,
  });

  // Two parallel POSTs — PostHog rate-limits per project, not per request.
  const [currentRows, baselineRows] = await Promise.all([
    runHogql(fetchImpl, url, input.posthogApiKey, currentQuery),
    runHogql(fetchImpl, url, input.posthogApiKey, baselineQuery),
  ]);

  return {
    current: currentRows,
    baseline: baselineRows,
    windowSnapshot: {
      metricId: metric.id,
      windowStart: input.windowStart,
      windowEnd: input.windowEnd,
      baselineStart: input.baselineStart,
      baselineEnd: input.baselineEnd,
      rowsCurrent: currentRows.length,
      rowsBaseline: baselineRows.length,
    },
  };
}

async function runHogql(
  fetchImpl: typeof fetch,
  url: string,
  apiKey: string,
  query: string,
): Promise<number[]> {
  let res: Response;
  try {
    res = await fetchImpl(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: { kind: "HogQLQuery", query } }),
    });
  } catch (err) {
    throw new PostHogAdapterError("network error contacting PostHog", err);
  }
  if (!res.ok) {
    const detail = await safeText(res);
    throw new PostHogAdapterError(`posthog ${res.status}: ${detail}`);
  }
  let body: unknown;
  try {
    body = await res.json();
  } catch (err) {
    throw new PostHogAdapterError("posthog response was not valid JSON", err);
  }
  return extractSeries(body);
}

// ---- helpers -------------------------------------------------------------

function renderTemplate(tpl: string, vars: Record<string, string>): string {
  return tpl.replace(/\{\{(\w+)\}\}/g, (_m, key) => {
    const v = vars[key];
    if (v == null) throw new PostHogAdapterError(`unresolved template var: ${key}`);
    // HogQL string literals — strip anything that could close the quote.
    return v.replace(/[';]/g, "");
  });
}

function extractSeries(body: unknown): number[] {
  if (!body || typeof body !== "object") {
    throw new PostHogAdapterError("posthog response missing results");
  }
  const obj = body as Record<string, unknown>;
  const results = obj.results;
  if (!Array.isArray(results)) {
    throw new PostHogAdapterError("posthog response 'results' is not an array");
  }
  const out: number[] = [];
  for (const row of results) {
    if (!Array.isArray(row) || row.length < 2) continue;
    const raw = row[1];
    // Reject null / undefined / strings before Number()-ing — Number(null) is 0
    // and Number('') is 0, both of which would silently misreport "no data" as
    // zero measurements.
    if (raw == null) continue;
    if (typeof raw !== "number" && typeof raw !== "string") continue;
    const v = typeof raw === "number" ? raw : Number(raw);
    if (!Number.isFinite(v)) continue;
    out.push(v);
  }
  return out;
}

async function safeText(res: Response): Promise<string> {
  try {
    return (await res.text()).slice(0, 200);
  } catch {
    return "<unreadable>";
  }
}
