import { describe, it, expect, vi } from "vitest";
import { homeTurn } from "./home-turn";
import type { AgentContext } from "./types";

const baseCtx = (): AgentContext => ({
  tenantId: "t1",
  actorId: "u1",
  role: "admin",
  rolePack: { voice: "", vendors: [], decisions: [], glossary: {} },
  buffer: {
    kind: "conversation",
    turns: [],
    userInput: "where is admin dashboard?",
  },
  alwaysOn: { memoryIndexExcerpt: "", workspaceName: "acme" },
});

const happyDeps = () => ({
  reserveQuota: vi
    .fn()
    .mockResolvedValue({ ok: true, reservationId: "r1" }),
  reconcileQuota: vi.fn().mockResolvedValue({ ok: true }),
  buildContext: vi.fn().mockResolvedValue(baseCtx()),
  classify: vi.fn().mockResolvedValue("navigate"),
  invokeLlm: vi.fn().mockResolvedValue({
    text: "Open the admin dashboard at /dashboard.",
    toolCalls: [
      {
        name: "route_match",
        input: { query: "admin dashboard" },
        output: { route: "/dashboard", label: "Dashboard" },
      },
    ],
    tokens: 320,
  }),
  retrievedMemoryIds: [] as string[],
});

describe("homeTurn", () => {
  it("emits text-delta, action-card, and turn-end on a successful navigate", async () => {
    const events: any[] = [];
    await homeTurn(
      {
        tenantId: "t1",
        actorId: "u1",
        role: "admin",
        userInput: "where is admin dashboard?",
        recent: [],
      },
      happyDeps(),
      (e) => events.push(e),
    );

    const kinds = events.map((e) => e.event);
    expect(kinds).toContain("text-delta");
    expect(kinds).toContain("action-card");
    expect(kinds[kinds.length - 1]).toBe("turn-end");
    const turnEnd = events[events.length - 1];
    expect(turnEnd.data.status).toBe("completed");
  });

  it("reconciles quota with actual_tokens on the success path", async () => {
    const deps = happyDeps();
    await homeTurn(
      {
        tenantId: "t1",
        actorId: "u1",
        role: "admin",
        userInput: "x",
        recent: [],
      },
      deps,
      () => {},
    );
    expect(deps.reconcileQuota).toHaveBeenCalledWith({
      reservation_id: "r1",
      actual_tokens: 320,
    });
  });

  it("emits a single text-delta with budget-exhausted copy when quota refuses", async () => {
    const events: any[] = [];
    const deps = {
      ...happyDeps(),
      reserveQuota: vi
        .fn()
        .mockResolvedValue({ ok: false, reason: "tokens_exceeded" }),
    };
    await homeTurn(
      {
        tenantId: "t1",
        actorId: "u1",
        role: "admin",
        userInput: "x",
        recent: [],
      },
      deps,
      (e) => events.push(e),
    );
    const textDeltas = events.filter((e) => e.event === "text-delta");
    expect(textDeltas).toHaveLength(1);
    expect(textDeltas[0].data.delta).toMatch(/budget|tokens|exhausted/i);
    const turnEnd = events[events.length - 1];
    expect(turnEnd.event).toBe("turn-end");
    expect(turnEnd.data.status).toBe("failed");
  });

  it("does NOT call buildContext, classify, invokeLlm, or reconcileQuota when quota refuses", async () => {
    const deps = {
      ...happyDeps(),
      reserveQuota: vi
        .fn()
        .mockResolvedValue({ ok: false, reason: "tokens_exceeded" }),
    };
    await homeTurn(
      {
        tenantId: "t1",
        actorId: "u1",
        role: "admin",
        userInput: "x",
        recent: [],
      },
      deps,
      () => {},
    );
    expect(deps.buildContext).not.toHaveBeenCalled();
    expect(deps.classify).not.toHaveBeenCalled();
    expect(deps.invokeLlm).not.toHaveBeenCalled();
    expect(deps.reconcileQuota).not.toHaveBeenCalled();
  });

  it("downgrades ungrounded claims via verifyGrounding before emitting", async () => {
    const events: any[] = [];
    const deps = {
      ...happyDeps(),
      invokeLlm: vi.fn().mockResolvedValue({
        text: "Churn rose 12% [mem:m9999].",
        toolCalls: [],
        tokens: 200,
      }),
      // Empty retrieved set → [mem:m9999] cannot ground.
      retrievedMemoryIds: [] as string[],
    };
    await homeTurn(
      {
        tenantId: "t1",
        actorId: "u1",
        role: "admin",
        userInput: "what's going on",
        recent: [],
      },
      deps,
      (e) => events.push(e),
    );
    const text = events
      .filter((e) => e.event === "text-delta")
      .map((e) => e.data.delta)
      .join("");
    expect(text).not.toContain("m9999");
    expect(text).toMatch(/related memories|couldn't ground/i);
  });

  it("emits citation events for every grounded memory id", async () => {
    const events: any[] = [];
    const deps = {
      ...happyDeps(),
      invokeLlm: vi.fn().mockResolvedValue({
        text: "Voice is plain [mem:m0042].",
        toolCalls: [],
        tokens: 100,
      }),
      retrievedMemoryIds: ["m0042"],
    };
    await homeTurn(
      {
        tenantId: "t1",
        actorId: "u1",
        role: "admin",
        userInput: "explain voice",
        recent: [],
      },
      deps,
      (e) => events.push(e),
    );
    const citations = events.filter((e) => e.event === "citation");
    expect(citations).toHaveLength(1);
    expect(citations[0].data.memoryId).toBe("m0042");
    // No memoryTitles dep + no extraGroundedTitles → title null on the event.
    expect(citations[0].data.title).toBe(null);
  });

  it("includes title on citation events when memoryTitles dep is set (F5)", async () => {
    const events: any[] = [];
    const deps = {
      ...happyDeps(),
      invokeLlm: vi.fn().mockResolvedValue({
        text: "Voice is plain [mem:m0042].",
        toolCalls: [],
        tokens: 100,
      }),
      retrievedMemoryIds: ["m0042"],
      memoryTitles: { m0042: "Voice and tone decision" },
    };
    await homeTurn(
      {
        tenantId: "t1",
        actorId: "u1",
        role: "admin",
        userInput: "explain voice",
        recent: [],
      },
      deps,
      (e) => events.push(e),
    );
    const c = events.find((e) => e.event === "citation");
    expect(c.data.title).toBe("Voice and tone decision");
  });

  it("prefers tool-discovered title (extraGroundedTitles) over static map (F5)", async () => {
    const events: any[] = [];
    const deps = {
      ...happyDeps(),
      invokeLlm: vi.fn().mockResolvedValue({
        text: "See [mem:m0099].",
        toolCalls: [],
        tokens: 100,
        extraGroundedIds: ["m0099"],
        extraGroundedTitles: { m0099: "Fresh from memory_fetch" },
      }),
      retrievedMemoryIds: [],
      memoryTitles: { m0099: "Stale static title" },
    };
    await homeTurn(
      {
        tenantId: "t1",
        actorId: "u1",
        role: "admin",
        userInput: "x",
        recent: [],
      },
      deps,
      (e) => events.push(e),
    );
    const c = events.find((e) => e.event === "citation");
    expect(c.data.title).toBe("Fresh from memory_fetch");
  });

  it("includes type on citation events when memoryTypes dep is set (v1.8)", async () => {
    const events: any[] = [];
    const deps = {
      ...happyDeps(),
      invokeLlm: vi.fn().mockResolvedValue({
        text: "Voice is plain [mem:m0042].",
        toolCalls: [],
        tokens: 100,
      }),
      retrievedMemoryIds: ["m0042"],
      memoryTypes: { m0042: "decision" },
    };
    await homeTurn(
      {
        tenantId: "t1",
        actorId: "u1",
        role: "admin",
        userInput: "explain voice",
        recent: [],
      },
      deps,
      (e) => events.push(e),
    );
    const c = events.find((e) => e.event === "citation");
    expect(c.data.type).toBe("decision");
  });

  it("prefers tool-discovered type (extraGroundedTypes) over static map (v1.8)", async () => {
    const events: any[] = [];
    const deps = {
      ...happyDeps(),
      invokeLlm: vi.fn().mockResolvedValue({
        text: "See [mem:m0099].",
        toolCalls: [],
        tokens: 100,
        extraGroundedIds: ["m0099"],
        extraGroundedTypes: { m0099: "voice" },
      }),
      retrievedMemoryIds: [],
      memoryTypes: { m0099: "note" },
    };
    await homeTurn(
      {
        tenantId: "t1",
        actorId: "u1",
        role: "admin",
        userInput: "x",
        recent: [],
      },
      deps,
      (e) => events.push(e),
    );
    const c = events.find((e) => e.event === "citation");
    expect(c.data.type).toBe("voice");
  });

  it("emits type=null on citation events when no type info available", async () => {
    const events: any[] = [];
    const deps = {
      ...happyDeps(),
      invokeLlm: vi.fn().mockResolvedValue({
        text: "Plain [mem:m0042].",
        toolCalls: [],
        tokens: 100,
      }),
      retrievedMemoryIds: ["m0042"],
    };
    await homeTurn(
      {
        tenantId: "t1",
        actorId: "u1",
        role: "admin",
        userInput: "x",
        recent: [],
      },
      deps,
      (e) => events.push(e),
    );
    const c = events.find((e) => e.event === "citation");
    expect(c.data.type).toBe(null);
  });

  it("forwards live text deltas via onTextDelta to SSE text-delta events", async () => {
    const events: any[] = [];
    const deps = {
      ...happyDeps(),
      // Mock streams two chunks via the onTextDelta callback, then
      // returns the full text (matching the contract real-invoke honors).
      invokeLlm: vi.fn(async (input: { onTextDelta?: (d: string) => void }) => {
        input.onTextDelta?.("Open the admin ");
        input.onTextDelta?.("dashboard at /dashboard.");
        return {
          text: "Open the admin dashboard at /dashboard.",
          toolCalls: [],
          tokens: 320,
        };
      }),
      classify: vi.fn().mockResolvedValue("navigate"),
    };
    await homeTurn(
      {
        tenantId: "t1",
        actorId: "u1",
        role: "admin",
        userInput: "where is admin dashboard?",
        recent: [],
      },
      deps,
      (e) => events.push(e),
    );
    const textDeltas = events.filter((e) => e.event === "text-delta");
    expect(textDeltas).toHaveLength(2);
    expect(textDeltas[0].data.delta).toBe("Open the admin ");
    expect(textDeltas[1].data.delta).toBe("dashboard at /dashboard.");
    // Grounding was a no-op (no citations in text), so no text-replace.
    const replaces = events.filter((e) => e.event === "text-replace");
    expect(replaces).toHaveLength(0);
  });

  it("emits text-replace after streaming when grounding strips ungrounded claims", async () => {
    const events: any[] = [];
    const deps = {
      ...happyDeps(),
      invokeLlm: vi.fn(async (input: { onTextDelta?: (d: string) => void }) => {
        const raw = "Churn rose 12% [mem:m9999].";
        input.onTextDelta?.(raw);
        return { text: raw, toolCalls: [], tokens: 200 };
      }),
      retrievedMemoryIds: [] as string[],
    };
    await homeTurn(
      {
        tenantId: "t1",
        actorId: "u1",
        role: "admin",
        userInput: "what's going on",
        recent: [],
      },
      deps,
      (e) => events.push(e),
    );
    // First we streamed the raw text...
    const textDeltas = events.filter((e) => e.event === "text-delta");
    expect(textDeltas).toHaveLength(1);
    expect(textDeltas[0].data.delta).toContain("m9999");
    // ...then grounding stripped it and emitted text-replace.
    const replaces = events.filter((e) => e.event === "text-replace");
    expect(replaces).toHaveLength(1);
    expect(replaces[0].data.text).not.toContain("m9999");
  });

  it("emits text-replace to overwrite preamble streamed during tool_use iterations", async () => {
    // Mirrors real-invoke behavior: a tool_use iteration streams
    // "Let me look that up..." live, then the final iteration streams
    // the actual answer. LlmResult.text only carries the final
    // iteration's text, so the wider streamed body must be replaced
    // with the grounded final to avoid leaving preamble in the UI.
    const events: any[] = [];
    const deps = {
      ...happyDeps(),
      invokeLlm: vi.fn(async (input: { onTextDelta?: (d: string) => void }) => {
        input.onTextDelta?.("Let me look that up... ");
        input.onTextDelta?.("Open the admin dashboard at /dashboard.");
        return {
          text: "Open the admin dashboard at /dashboard.",
          toolCalls: [],
          tokens: 320,
        };
      }),
      classify: vi.fn().mockResolvedValue("navigate"),
    };
    await homeTurn(
      {
        tenantId: "t1",
        actorId: "u1",
        role: "admin",
        userInput: "where is admin dashboard?",
        recent: [],
      },
      deps,
      (e) => events.push(e),
    );
    const replaces = events.filter((e) => e.event === "text-replace");
    expect(replaces).toHaveLength(1);
    expect(replaces[0].data.text).toBe("Open the admin dashboard at /dashboard.");
    expect(replaces[0].data.text).not.toContain("Let me look that up");
  });

  it("emits turn-end with status=failed when invokeLlm throws", async () => {
    const events: any[] = [];
    const deps = {
      ...happyDeps(),
      invokeLlm: vi.fn().mockRejectedValue(new Error("rate limit")),
    };
    await homeTurn(
      {
        tenantId: "t1",
        actorId: "u1",
        role: "admin",
        userInput: "x",
        recent: [],
      },
      deps,
      (e) => events.push(e),
    );
    const turnEnd = events[events.length - 1];
    expect(turnEnd.event).toBe("turn-end");
    expect(turnEnd.data.status).toBe("failed");
    // Still reconciles to free the reservation even on LLM failure.
    expect(deps.reconcileQuota).toHaveBeenCalled();
  });
});
