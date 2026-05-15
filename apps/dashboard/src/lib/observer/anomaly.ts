// Z-score anomaly detection for v1.6 observer (M3.3).
//
// Pure functions — no DB, no HTTP. The route handler composes
// `isInCooldown` + `detectZScoreAnomaly` and wires the result into the
// orchestrator's injected DetectAnomalyFn. Keeping cooldown separate from
// the Z-score math lets the orchestrator emit a 'skipped_cooldown'
// observer_runs row without invoking the detector (and burning samples on
// data we've already evaluated recently).

import type { AnomalyDetection } from "@/lib/agent";

export type DetectConfig = {
  /** Z-score threshold. |z| >= threshold → anomaly. Default 2.0 (~95%). */
  zThreshold: number;
  /**
   * Minimum samples required IN BOTH windows. Z-score is meaningless on
   * tiny windows; we'd rather skip than emit noise.
   */
  minSamples: number;
};

export const DEFAULT_DETECT_CONFIG: DetectConfig = {
  zThreshold: 2.0,
  minSamples: 5,
};

/**
 * Compare a `current` window to a `baseline` window and decide whether
 * the delta is anomalous. Returns one of three kinds:
 *   - anomaly:           samples sufficient AND |z| >= threshold
 *   - no_anomaly:        samples sufficient AND |z| < threshold
 *   - skipped_min_sample: either window has fewer than `minSamples`
 *
 * Never returns 'skipped_cooldown' — that's the caller's responsibility
 * (see `isInCooldown`).
 */
export function detectZScoreAnomaly(input: {
  current: readonly number[];
  baseline: readonly number[];
  config?: Partial<DetectConfig>;
}): AnomalyDetection {
  const cfg = { ...DEFAULT_DETECT_CONFIG, ...input.config };
  const { current, baseline } = input;

  if (current.length < cfg.minSamples || baseline.length < cfg.minSamples) {
    return {
      kind: "skipped_min_sample",
      anomalies: {
        currentSamples: current.length,
        baselineSamples: baseline.length,
        minSamples: cfg.minSamples,
      },
    };
  }

  const currentMean = mean(current);
  const baselineMean = mean(baseline);
  const baselineStd = stddev(baseline, baselineMean);
  const delta = currentMean - baselineMean;
  // Z-score is the delta in baseline standard deviations. If the baseline
  // is completely flat (std=0), any non-zero delta is "infinitely
  // anomalous"; we cap that to a sentinel so downstream stays numeric.
  const zScore = baselineStd === 0 ? (delta === 0 ? 0 : Infinity) : delta / baselineStd;
  const deltaUnits: "ratio" | "percent" | "absolute" = "absolute";
  const anomalies = {
    currentMean,
    baselineMean,
    baselineStd,
    zScore,
    delta,
    threshold: cfg.zThreshold,
  };

  if (Math.abs(zScore) >= cfg.zThreshold) {
    return { kind: "anomaly", delta, deltaUnits, zScore, anomalies };
  }
  return { kind: "no_anomaly", delta, deltaUnits, zScore, anomalies };
}

/**
 * Cooldown gate: returns true if the signal ran successfully within the
 * cooldown window. The caller emits a 'skipped_cooldown' observer_runs
 * row instead of polling the signal again.
 *
 * `lastRanAt` is the timestamp of the most recent observer_runs row for
 * this signal with status='completed' (only completed runs count toward
 * cooldown — a no_anomaly or adapter_error doesn't muzzle the next try).
 */
export function isInCooldown(input: {
  lastCompletedAt: Date | string | null;
  now: Date;
  cooldownHours: number;
}): boolean {
  if (input.lastCompletedAt == null) return false;
  const last =
    input.lastCompletedAt instanceof Date
      ? input.lastCompletedAt
      : new Date(input.lastCompletedAt);
  if (Number.isNaN(last.getTime())) return false;
  const ms = input.now.getTime() - last.getTime();
  return ms < input.cooldownHours * 60 * 60 * 1000;
}

// ---- math helpers --------------------------------------------------------

function mean(xs: readonly number[]): number {
  if (xs.length === 0) return 0;
  let sum = 0;
  for (const x of xs) sum += x;
  return sum / xs.length;
}

function stddev(xs: readonly number[], precomputedMean?: number): number {
  if (xs.length === 0) return 0;
  const m = precomputedMean ?? mean(xs);
  let sumSq = 0;
  for (const x of xs) sumSq += (x - m) * (x - m);
  return Math.sqrt(sumSq / xs.length);
}
