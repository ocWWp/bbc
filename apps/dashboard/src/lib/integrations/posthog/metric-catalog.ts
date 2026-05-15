// Local catalog of PostHog metrics the observer knows how to evaluate.
// "Local" is the operative word: when the user says "watch our churn rate"
// in /home, the observer_propose tool reads this catalog WITHOUT calling
// PostHog. PostHog only gets pinged in step 2 (Set up this watch) and
// step 4 (actual polling during an observer run). Codex #17 fix:
// zero external calls in step 1.
//
// To add a metric: append a MetricSpec here, pick a HogQL template that
// produces a daily numeric series, and document the data scope.

export type DeltaUnit = "ratio" | "percent" | "absolute";

export type MetricSpec = {
  /** Stable id used in observer_signals.config_jsonb.metric. */
  id: string;
  /** User-facing label shown in the action card + /settings/observers. */
  label: string;
  /** Short hint explaining what the metric represents. */
  description: string;
  /**
   * HogQL template producing a (day, value) series. {{windowStart}} and
   * {{windowEnd}} are substituted at poll time. The query must return
   * exactly two columns; the first row order is preserved as the value
   * array for anomaly detection.
   */
  hogqlTemplate: string;
  /** What unit `delta` should be reported in for this metric. */
  deltaUnits: DeltaUnit;
  /** Default Z-score threshold. Tunable per signal via config_jsonb. */
  defaultZThreshold: number;
  /** Default rolling-window length in days for the "current" period. */
  defaultWindowDays: number;
  /** Default baseline length in days. Must be >= defaultWindowDays. */
  defaultBaselineDays: number;
  /** Whether higher values are "good" — drives the framing of the alert copy. */
  goodDirection: "higher" | "lower" | "either";
};

export const POSTHOG_METRIC_CATALOG: readonly MetricSpec[] = [
  {
    id: "dau",
    label: "Daily active users",
    description: "Distinct users per day across the tracked product.",
    hogqlTemplate:
      "SELECT toDate(timestamp) AS day, count(DISTINCT person_id) AS v " +
      "FROM events " +
      "WHERE timestamp >= '{{windowStart}}' AND timestamp < '{{windowEnd}}' " +
      "GROUP BY day ORDER BY day",
    deltaUnits: "absolute",
    defaultZThreshold: 2.5,
    defaultWindowDays: 7,
    defaultBaselineDays: 28,
    goodDirection: "higher",
  },
  {
    id: "signup_conversion",
    label: "Signup conversion",
    description: "Visitors who completed signup, as a ratio of landing visits.",
    hogqlTemplate:
      "SELECT toDate(timestamp) AS day, " +
      "countIf(event='signup_completed') / nullIf(countIf(event='landing_view'), 0) AS v " +
      "FROM events " +
      "WHERE timestamp >= '{{windowStart}}' AND timestamp < '{{windowEnd}}' " +
      "GROUP BY day ORDER BY day",
    deltaUnits: "ratio",
    defaultZThreshold: 2.0,
    defaultWindowDays: 7,
    defaultBaselineDays: 28,
    goodDirection: "higher",
  },
  {
    id: "activation_rate",
    label: "Activation rate",
    description: "New signups that reached the activation event within 7 days.",
    hogqlTemplate:
      "SELECT toDate(timestamp) AS day, " +
      "countIf(event='activated') / nullIf(countIf(event='signup_completed'), 0) AS v " +
      "FROM events " +
      "WHERE timestamp >= '{{windowStart}}' AND timestamp < '{{windowEnd}}' " +
      "GROUP BY day ORDER BY day",
    deltaUnits: "ratio",
    defaultZThreshold: 2.0,
    defaultWindowDays: 14,
    defaultBaselineDays: 56,
    goodDirection: "higher",
  },
  {
    id: "weekly_churn",
    label: "Weekly churn",
    description: "Accounts that stopped firing any event this week.",
    hogqlTemplate:
      "SELECT toDate(timestamp) AS day, count(DISTINCT person_id) AS v " +
      "FROM events " +
      "WHERE timestamp >= '{{windowStart}}' AND timestamp < '{{windowEnd}}' " +
      "  AND event = 'account_churned' " +
      "GROUP BY day ORDER BY day",
    deltaUnits: "absolute",
    defaultZThreshold: 2.0,
    defaultWindowDays: 7,
    defaultBaselineDays: 28,
    goodDirection: "lower",
  },
];

export function findMetric(id: string): MetricSpec | undefined {
  return POSTHOG_METRIC_CATALOG.find((m) => m.id === id);
}
