import { describe, expect, it } from "vitest";
import { detectZScoreAnomaly, isInCooldown } from "./anomaly";

describe("detectZScoreAnomaly", () => {
  it("flags an anomaly when current deviates from baseline beyond threshold", () => {
    const baseline = [10, 11, 9, 10, 11, 10, 10, 9, 11, 10];
    const current = [10, 10, 10, 30, 32, 31, 30, 31, 32, 30]; // big upward shift
    const out = detectZScoreAnomaly({ current, baseline });
    expect(out.kind).toBe("anomaly");
    if (out.kind === "anomaly") {
      expect(out.delta).toBeGreaterThan(0);
      expect(Math.abs(out.zScore)).toBeGreaterThanOrEqual(2);
    }
  });

  it("returns no_anomaly when current is within the threshold", () => {
    const baseline = [100, 102, 98, 101, 99, 100, 102, 98, 101, 99];
    const current = [100, 101, 99, 102, 98, 100, 101, 99, 102, 100];
    const out = detectZScoreAnomaly({ current, baseline });
    expect(out.kind).toBe("no_anomaly");
  });

  it("skips when either window has fewer than minSamples", () => {
    const out = detectZScoreAnomaly({
      current: [1, 2],
      baseline: [10, 11, 9, 10, 11],
    });
    expect(out.kind).toBe("skipped_min_sample");
  });

  it("respects a custom zThreshold", () => {
    const baseline = [100, 100, 100, 100, 100];
    const current = [101, 101, 101, 101, 101];
    // With std=0 in baseline the z-score is Infinity, so this would
    // anomaly at any threshold — use a wider baseline.
    const wideBaseline = [100, 102, 98, 101, 99, 100, 102, 98, 101, 99];
    const wideCurrent = [100, 100, 100, 101, 100, 100, 100, 100, 101, 100];
    const strict = detectZScoreAnomaly({
      current: wideCurrent,
      baseline: wideBaseline,
      config: { zThreshold: 5.0 },
    });
    expect(strict.kind).toBe("no_anomaly");
    void baseline;
    void current;
  });

  it("handles flat baseline (std=0): zero delta → no_anomaly, non-zero → anomaly", () => {
    const flat = [10, 10, 10, 10, 10, 10];
    const same = detectZScoreAnomaly({ current: flat, baseline: flat });
    expect(same.kind).toBe("no_anomaly");

    const shifted = detectZScoreAnomaly({
      current: [11, 11, 11, 11, 11, 11],
      baseline: flat,
    });
    expect(shifted.kind).toBe("anomaly");
  });
});

describe("isInCooldown", () => {
  const now = new Date("2026-05-15T12:00:00Z");

  it("returns false when no prior completed run", () => {
    expect(isInCooldown({ lastCompletedAt: null, now, cooldownHours: 24 })).toBe(false);
  });

  it("returns true when last run was within cooldown window", () => {
    const last = new Date("2026-05-15T08:00:00Z"); // 4h ago
    expect(isInCooldown({ lastCompletedAt: last, now, cooldownHours: 24 })).toBe(true);
  });

  it("returns false when last run was before cooldown window", () => {
    const last = new Date("2026-05-14T08:00:00Z"); // 28h ago
    expect(isInCooldown({ lastCompletedAt: last, now, cooldownHours: 24 })).toBe(false);
  });

  it("accepts a string timestamp", () => {
    expect(
      isInCooldown({
        lastCompletedAt: "2026-05-15T11:00:00Z",
        now,
        cooldownHours: 24,
      }),
    ).toBe(true);
  });

  it("returns false on an unparseable timestamp (defensive)", () => {
    expect(
      isInCooldown({
        lastCompletedAt: "not-a-date",
        now,
        cooldownHours: 24,
      }),
    ).toBe(false);
  });
});
