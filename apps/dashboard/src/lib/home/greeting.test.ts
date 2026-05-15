import { describe, expect, it } from "vitest";
import { homeGreeting } from "./greeting";

describe("homeGreeting", () => {
  it("cold-start: zero counts → welcome string", () => {
    const out = homeGreeting({
      activeSignalCount: 0,
      recentObservationCount: 0,
      pendingQueueCount: 0,
      workspaceName: "Acme",
    });
    expect(out).toMatch(/Welcome to Acme/);
  });

  it("falls back when workspaceName is blank", () => {
    const out = homeGreeting({
      activeSignalCount: 0,
      recentObservationCount: 0,
      pendingQueueCount: 0,
      workspaceName: "   ",
    });
    expect(out).toMatch(/your workspace/);
  });

  it("queue depth wins over observation count", () => {
    const out = homeGreeting({
      activeSignalCount: 5,
      recentObservationCount: 10,
      pendingQueueCount: 3,
      workspaceName: "Acme",
    });
    expect(out).toMatch(/3 items waiting/);
    expect(out).not.toMatch(/observation/);
  });

  it("singular vs plural is correct for 1 item", () => {
    const out = homeGreeting({
      activeSignalCount: 0,
      recentObservationCount: 0,
      pendingQueueCount: 1,
      workspaceName: "Acme",
    });
    expect(out).toMatch(/1 item waiting/);
    expect(out).not.toMatch(/items/);
  });

  it("recent observations message when queue empty", () => {
    const out = homeGreeting({
      activeSignalCount: 2,
      recentObservationCount: 4,
      pendingQueueCount: 0,
      workspaceName: "Acme",
    });
    expect(out).toMatch(/4 observations/);
  });

  it("signals-only state when nothing pending and nothing observed", () => {
    const out = homeGreeting({
      activeSignalCount: 7,
      recentObservationCount: 0,
      pendingQueueCount: 0,
      workspaceName: "Acme",
    });
    expect(out).toMatch(/Watching 7 signals/);
    expect(out).toMatch(/Acme/);
  });
});
