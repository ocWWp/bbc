import { describe, it, expect, vi } from "vitest";
import { buildAgentContext } from "./context-builder";

const fakeRolePack = {
  voice: "concise, plain, no marketing voice",
  vendors: ["anthropic", "posthog"],
  decisions: [{ id: "0008", title: "three-loop architecture" }],
  glossary: { brain: "the tenant's curated memory" },
};

describe("buildAgentContext", () => {
  it("assembles a conversation buffer + role pack + always-on excerpt", async () => {
    const db = {
      getRolePack: vi.fn().mockResolvedValue(fakeRolePack),
      getMemoryIndexExcerpt: vi
        .fn()
        .mockResolvedValue("- decision: 0008\n- voice: concise"),
      getWorkspaceName: vi.fn().mockResolvedValue("acme"),
    };

    const ctx = await buildAgentContext({
      tenantId: "t1",
      actorId: "u1",
      role: "admin",
      kind: "conversation",
      conversation: { turns: [], userInput: "where is admin dashboard?" },
      db,
    });

    expect(ctx.tenantId).toBe("t1");
    expect(ctx.actorId).toBe("u1");
    expect(ctx.role).toBe("admin");
    expect(ctx.rolePack.decisions[0].id).toBe("0008");
    expect(ctx.buffer.kind).toBe("conversation");
    if (ctx.buffer.kind === "conversation") {
      expect(ctx.buffer.userInput).toBe("where is admin dashboard?");
    }
    expect(ctx.alwaysOn.workspaceName).toBe("acme");
    expect(ctx.alwaysOn.memoryIndexExcerpt).toContain("decision: 0008");
  });

  it("assembles an anomaly buffer for observer runs (actorId null = service)", async () => {
    const db = {
      getRolePack: vi.fn().mockResolvedValue(fakeRolePack),
      getMemoryIndexExcerpt: vi.fn().mockResolvedValue(""),
      getWorkspaceName: vi.fn().mockResolvedValue("acme"),
    };

    const ctx = await buildAgentContext({
      tenantId: "t1",
      actorId: null,
      role: "operator",
      kind: "anomaly",
      anomaly: {
        signalType: "posthog.metric",
        signalId: "sig-1",
        metricName: "churn-rate",
        delta: 0.12,
        windowSnapshot: { current: [1, 2, 3], baseline: [1, 1, 1] },
      },
      db,
    });

    expect(ctx.actorId).toBeNull();
    expect(ctx.buffer.kind).toBe("anomaly");
    if (ctx.buffer.kind === "anomaly") {
      expect(ctx.buffer.anomaly.signalId).toBe("sig-1");
      expect(ctx.buffer.anomaly.metricName).toBe("churn-rate");
      expect(ctx.buffer.anomaly.delta).toBe(0.12);
    }
  });

  it("dispatches three DB lookups in parallel (not sequential)", async () => {
    const order: string[] = [];
    const wait = (ms: number) =>
      new Promise<void>((r) => setTimeout(r, ms));

    const db = {
      getRolePack: vi.fn(async () => {
        order.push("role-start");
        await wait(10);
        order.push("role-end");
        return fakeRolePack;
      }),
      getMemoryIndexExcerpt: vi.fn(async () => {
        order.push("memory-start");
        await wait(10);
        order.push("memory-end");
        return "";
      }),
      getWorkspaceName: vi.fn(async () => {
        order.push("workspace-start");
        await wait(10);
        order.push("workspace-end");
        return "acme";
      }),
    };

    await buildAgentContext({
      tenantId: "t1",
      actorId: "u1",
      role: "admin",
      kind: "conversation",
      conversation: { turns: [], userInput: "hi" },
      db,
    });

    // Parallel dispatch means all three "start" markers land before any
    // "end" marker. Sequential would produce role-start, role-end, then
    // memory-start, etc.
    const firstThree = order.slice(0, 3);
    expect(firstThree).toEqual(
      expect.arrayContaining(["role-start", "memory-start", "workspace-start"]),
    );
  });
});
