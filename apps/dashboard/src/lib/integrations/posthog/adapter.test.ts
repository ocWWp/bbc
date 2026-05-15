import { describe, expect, it, vi } from "vitest";
import { listAvailableMetrics, pollMetric, PostHogAdapterError } from "./adapter";

const baseInput = {
  metricId: "dau",
  windowStart: "2026-05-08T00:00:00Z",
  windowEnd: "2026-05-15T00:00:00Z",
  baselineStart: "2026-04-10T00:00:00Z",
  baselineEnd: "2026-05-08T00:00:00Z",
  posthogApiKey: "phx_test",
  projectId: "12345",
  region: "us" as const,
};

function makeFetchOk(rows: Array<[string, number]>): typeof fetch {
  return vi.fn(async () =>
    new Response(JSON.stringify({ results: rows }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }),
  ) as unknown as typeof fetch;
}

describe("listAvailableMetrics", () => {
  it("returns a non-empty catalog with stable ids", () => {
    const list = listAvailableMetrics({ binding: { projectId: null, region: null } });
    expect(list.length).toBeGreaterThan(0);
    const ids = list.map((m) => m.id);
    expect(ids).toContain("dau");
    expect(ids).toContain("weekly_churn");
  });
});

describe("pollMetric", () => {
  it("returns current + baseline value arrays from PostHog query rows", async () => {
    const fetchImpl = makeFetchOk([
      ["2026-05-08", 100],
      ["2026-05-09", 110],
      ["2026-05-10", 120],
    ]);
    const out = await pollMetric({ ...baseInput, fetchImpl });
    expect(out.current).toEqual([100, 110, 120]);
    expect(out.baseline).toEqual([100, 110, 120]); // same stub for both
    expect(out.windowSnapshot.metricId).toBe("dau");
    expect(out.windowSnapshot.rowsCurrent).toBe(3);
  });

  it("rejects unknown metric ids", async () => {
    const fetchImpl = makeFetchOk([]);
    await expect(
      pollMetric({ ...baseInput, metricId: "does-not-exist", fetchImpl }),
    ).rejects.toThrow(PostHogAdapterError);
  });

  it("wraps HTTP non-2xx responses in PostHogAdapterError with status", async () => {
    const fetchImpl: typeof fetch = vi.fn(async () =>
      new Response("rate limited", { status: 429 }),
    ) as never;
    await expect(pollMetric({ ...baseInput, fetchImpl })).rejects.toThrow(/429/);
  });

  it("wraps network errors", async () => {
    const fetchImpl: typeof fetch = vi.fn(async () => {
      throw new Error("ECONNREFUSED");
    }) as never;
    await expect(pollMetric({ ...baseInput, fetchImpl })).rejects.toThrow(
      /network error/,
    );
  });

  it("skips non-numeric rows in the result set", async () => {
    // PostHog returns null for nullable HogQL expressions (e.g. divide-by-zero
    // in a ratio metric). The adapter must reject those — not coerce them to 0,
    // which would look like 'we measured 0 active users' instead of 'no data'.
    const fetchImpl: typeof fetch = vi.fn(async () =>
      new Response(
        JSON.stringify({
          results: [
            ["2026-05-08", 100],
            ["2026-05-09", null],
            ["2026-05-10", "not a number"],
            ["2026-05-11", 120],
          ],
        }),
        { status: 200 },
      ),
    ) as never;
    const out = await pollMetric({ ...baseInput, fetchImpl });
    expect(out.current).toEqual([100, 120]);
  });

  it("targets the EU region URL when region='eu'", async () => {
    const seen: string[] = [];
    const fetchImpl: typeof fetch = vi.fn(async (url: RequestInfo | URL) => {
      seen.push(String(url));
      return new Response(JSON.stringify({ results: [] }), { status: 200 });
    }) as never;
    await pollMetric({ ...baseInput, region: "eu", fetchImpl });
    expect(seen[0]).toContain("eu.posthog.com");
  });
});
