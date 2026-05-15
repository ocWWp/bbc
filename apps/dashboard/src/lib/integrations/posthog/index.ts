export {
  POSTHOG_METRIC_CATALOG,
  findMetric,
  type MetricSpec,
  type DeltaUnit,
} from "./metric-catalog";

export {
  POSTHOG_CAPABILITY,
  listAvailableMetrics,
  pollMetric,
  PostHogAdapterError,
  type ListAvailableMetricsInput,
  type PollMetricInput,
  type PollMetricResult,
} from "./adapter";
