import { describe, it, expect } from "vitest";
import { TOOLS, toolsForIntent } from "./tools";

describe("ToolRegistry", () => {
  it("declares 6 v1.6 tools in a stable order", () => {
    const names = TOOLS.map((t) => t.name);
    expect(names).toEqual([
      "memory_search",
      "memory_fetch",
      "route_match",
      "studio_compose",
      "observer_propose",
      "observation_emit",
    ]);
  });

  it("every tool is marked scope='internal' in v1.6", () => {
    for (const t of TOOLS) {
      expect(t.scope).toBe("internal");
    }
  });

  it("every tool has a non-empty description + an input schema", () => {
    for (const t of TOOLS) {
      expect(t.description.length).toBeGreaterThan(0);
      expect(t.inputSchema).toBeTypeOf("object");
      expect(t.inputSchema).not.toBeNull();
    }
  });

  it("toolsForIntent: navigate narrows to route_match only", () => {
    const names = toolsForIntent("navigate").map((t) => t.name);
    expect(names).toEqual(["route_match"]);
  });

  it("toolsForIntent: explain narrows to memory_search + memory_fetch", () => {
    const names = toolsForIntent("explain").map((t) => t.name);
    expect(names).toEqual(["memory_search", "memory_fetch"]);
  });

  it("toolsForIntent: draft adds studio_compose", () => {
    const names = toolsForIntent("draft").map((t) => t.name);
    expect(names).toEqual(["memory_search", "memory_fetch", "studio_compose"]);
  });

  it("toolsForIntent: watch narrows to observer_propose only", () => {
    expect(toolsForIntent("watch").map((t) => t.name)).toEqual([
      "observer_propose",
    ]);
  });

  it("toolsForIntent: observe-anomaly includes observation_emit + memory reads", () => {
    const names = toolsForIntent("observe-anomaly").map((t) => t.name);
    expect(names).toContain("observation_emit");
    expect(names).toContain("memory_search");
    expect(names).toContain("memory_fetch");
    expect(names).not.toContain("studio_compose");
  });

  it("toolsForIntent: unclear narrows to empty (no tools, ask user)", () => {
    expect(toolsForIntent("unclear")).toEqual([]);
  });

  it("observation_emit is NOT exposed to conversational intents", () => {
    for (const intent of [
      "navigate",
      "explain",
      "draft",
      "watch",
      "meta",
    ] as const) {
      const names = toolsForIntent(intent).map((t) => t.name);
      expect(names).not.toContain("observation_emit");
    }
  });
});
