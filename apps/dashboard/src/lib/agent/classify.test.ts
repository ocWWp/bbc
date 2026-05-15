import { describe, it, expect, vi } from "vitest";
import { classifyIntent } from "./classify";

describe("classifyIntent", () => {
  it("returns the model's chosen intent for a navigation query", async () => {
    const llm = vi.fn().mockResolvedValue({ intent: "navigate" });
    const r = await classifyIntent(
      "where is the admin dashboard?",
      [],
      llm,
    );
    expect(r).toBe("navigate");
    expect(llm).toHaveBeenCalledOnce();
  });

  it("returns 'watch' for setup-a-watch phrasing", async () => {
    const llm = vi.fn().mockResolvedValue({ intent: "watch" });
    const r = await classifyIntent("watch our churn rate", [], llm);
    expect(r).toBe("watch");
  });

  it("falls back to 'unclear' when the LLM rejects (rate limit, network, etc.)", async () => {
    const llm = vi.fn().mockRejectedValue(new Error("rate limit"));
    const r = await classifyIntent("hi", [], llm);
    expect(r).toBe("unclear");
  });

  it("falls back to 'unclear' when the LLM returns garbage (not one of the 6 conversational values)", async () => {
    // The classifier is only allowed to produce the 6 conversational
    // intents. 'observe-anomaly' is set by the observer path itself, not
    // by classification.
    const llm = vi.fn().mockResolvedValue({ intent: "destroy-the-world" as any });
    const r = await classifyIntent("hi", [], llm);
    expect(r).toBe("unclear");
  });

  it("never returns 'observe-anomaly' (that's an observer-path-only intent)", async () => {
    const llm = vi
      .fn()
      .mockResolvedValue({ intent: "observe-anomaly" as any });
    const r = await classifyIntent("anything", [], llm);
    expect(r).toBe("unclear");
  });

  it("passes only the last 2 turns of context to the LLM", async () => {
    const llm = vi.fn().mockResolvedValue({ intent: "explain" });
    const recent = [
      { role: "user" as const, text: "t1" },
      { role: "agent" as const, text: "a1" },
      { role: "user" as const, text: "t2" },
      { role: "agent" as const, text: "a2" },
    ];
    await classifyIntent("what about now?", recent, llm);
    const call = llm.mock.calls[0][0];
    expect(call.recent).toHaveLength(2);
    expect(call.recent[0].text).toBe("t2");
    expect(call.recent[1].text).toBe("a2");
  });
});
