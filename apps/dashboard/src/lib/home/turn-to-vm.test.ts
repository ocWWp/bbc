import { describe, it, expect } from "vitest";
import { turnToVm } from "./turn-to-vm";
import type { HomeTurn } from "./sessions";

const baseRow = (overrides: Partial<HomeTurn> = {}): HomeTurn => ({
  id: "t1",
  session_id: "s1",
  role: "agent",
  status: "completed",
  content_jsonb: { text: "hello world" },
  created_at: "2026-05-16T00:00:00Z",
  finalized_at: "2026-05-16T00:00:01Z",
  ...overrides,
});

describe("turnToVm", () => {
  it("passes completed turns through unchanged", () => {
    const vm = turnToVm(baseRow());
    expect(vm.status).toBe("completed");
    expect(vm.text).toBe("hello world");
  });

  it("maps in_progress → aborted at hydration (F3)", () => {
    // A persisted in_progress row means the SSE that would have
    // advanced it is gone. The UI should treat it as interrupted, not
    // as a silent partial bubble.
    const vm = turnToVm(
      baseRow({ status: "in_progress", content_jsonb: { text: "half-typed" } }),
    );
    expect(vm.status).toBe("aborted");
    expect(vm.text).toBe("half-typed");
  });

  it("extracts toolCalls and citations from content_jsonb", () => {
    const vm = turnToVm(
      baseRow({
        content_jsonb: {
          text: "Open dashboard.",
          toolCalls: [{ name: "route_match", payload: { route: "/dash" } }],
          citations: ["mem-1", "mem-2"],
        },
      }),
    );
    expect(vm.toolCalls).toEqual([
      { name: "route_match", payload: { route: "/dash" } },
    ]);
    expect(vm.citations).toEqual(["mem-1", "mem-2"]);
  });

  it("defaults text to empty string when content is malformed", () => {
    // Defensive against legacy rows or future schema drift.
    const vm = turnToVm(baseRow({ content_jsonb: null as never }));
    expect(vm.text).toBe("");
    expect(vm.toolCalls).toEqual([]);
    expect(vm.citations).toEqual([]);
  });
});
