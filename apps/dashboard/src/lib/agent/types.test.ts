import { describe, it, expectTypeOf } from "vitest";
import type { AgentContext, AnomalyContext, Intent } from "./types";

describe("AgentContext", () => {
  it("buffer discriminates by kind: conversation has turns + userInput", () => {
    const c: AgentContext["buffer"] = {
      kind: "conversation",
      turns: [],
      userInput: "hi",
    };
    if (c.kind === "conversation") {
      expectTypeOf(c.userInput).toBeString();
      expectTypeOf(c.turns).toBeArray();
    }
  });

  it("buffer discriminates by kind: anomaly has signalType + signalId", () => {
    const a: AnomalyContext = {
      signalType: "posthog.metric",
      signalId: "sig-1",
      metricName: "churn",
      delta: 0.12,
      windowSnapshot: { p: 1 },
    };
    const c: AgentContext["buffer"] = { kind: "anomaly", anomaly: a };
    if (c.kind === "anomaly") {
      expectTypeOf(c.anomaly.signalType).toEqualTypeOf<"posthog.metric">();
      expectTypeOf(c.anomaly.signalId).toBeString();
    }
  });

  it("Intent union contains all 7 v1.6 values", () => {
    const values: Intent[] = [
      "navigate",
      "explain",
      "draft",
      "watch",
      "meta",
      "unclear",
      "observe-anomaly",
    ];
    expectTypeOf(values).toEqualTypeOf<Intent[]>();
  });
});
