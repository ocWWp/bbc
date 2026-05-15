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
