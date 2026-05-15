import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildGallery } from "./gallery";

const requireActorMock = vi.fn();
vi.mock("@/lib/auth/require-user", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth/require-user")>()),
  requireActor: () => requireActorMock(),
}));

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServerClient: async () => ({}),
}));

const messagesCreate = vi.fn();
vi.mock("@/lib/secrets/anthropic-client", () => ({
  getAnthropicClient: async () => ({
    ok: true,
    client: { messages: { create: (...a: unknown[]) => messagesCreate(...a) } },
    costAttribution: "test-tenant",
  }),
}));

function memberActor() {
  return { ok: true as const, actor: { user_id: "u1", tenant_id: "t1", role: "member", identifier: "u@x.com" } };
}

// Two real gallery ids + one the LLM might hallucinate.
const REAL_A = "eng:adr-draft";
const REAL_B = "marketing:custom";
const FAKE = "eng:nope";

function routeToolResponse(candidates: Array<{ templateId: string; rationale: string }>) {
  return { content: [{ type: "tool_use", name: "route_task", input: { candidates } }] };
}

function clarifyToolResponse(question: string, suggestions: string[]) {
  return { content: [{ type: "tool_use", name: "clarify", input: { question, suggestions } }] };
}

beforeEach(() => {
  requireActorMock.mockReset();
  requireActorMock.mockResolvedValue(memberActor());
  messagesCreate.mockReset();
});

describe("routeTask — candidates branch", () => {
  it("returns kind=candidates carrying the correct owningRole, filtering unknown ids", async () => {
    messagesCreate.mockResolvedValue(routeToolResponse([
      { templateId: REAL_A, rationale: "fits the decision task" },
      { templateId: FAKE, rationale: "hallucinated id" },
      { templateId: REAL_B, rationale: "fallback free-form" },
    ]));
    const { routeTask } = await import("./route-task-action");
    const res = await routeTask("decide whether to keep Vercel or move to Cloudflare");
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.kind).toBe("candidates");
      if (res.kind !== "candidates") return;
      const ids = res.candidates.map((c) => c.templateId);
      expect(ids).toContain(REAL_A);
      expect(ids).toContain(REAL_B);
      expect(ids).not.toContain(FAKE);
      const gallery = buildGallery();
      for (const c of res.candidates) {
        const g = gallery.find((t) => t.id === c.templateId);
        expect(g, `candidate ${c.templateId} must exist in gallery`).toBeTruthy();
        expect(c.owningRole).toBe(g!.owningRole);
      }
    }
  });

  it("rejects a too-short task", async () => {
    const { routeTask } = await import("./route-task-action");
    expect((await routeTask("hi")).ok).toBe(false);
  });

  it("rejects an unauthorized actor", async () => {
    requireActorMock.mockResolvedValueOnce({ ok: false, output: "nope" });
    const { routeTask } = await import("./route-task-action");
    expect((await routeTask("a valid length task here")).ok).toBe(false);
  });
});

describe("routeTask — clarify branch", () => {
  it("returns kind=clarify when LLM picks the clarify tool", async () => {
    messagesCreate.mockResolvedValue(
      clarifyToolResponse("Is this for a customer or internal use?", ["Customer", "Internal"]),
    );
    const { routeTask } = await import("./route-task-action");
    const res = await routeTask("draft a follow-up about the bug");
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.kind).toBe("clarify");
      if (res.kind !== "clarify") return;
      expect(res.question).toMatch(/customer or internal/i);
      expect(res.suggestions).toEqual(["Customer", "Internal"]);
      expect(res.suggestions.length).toBeGreaterThanOrEqual(2);
      expect(res.suggestions.length).toBeLessThanOrEqual(4);
    }
  });

  it("with clarification arg, the LLM is offered only the route_task tool", async () => {
    messagesCreate.mockResolvedValue(routeToolResponse([
      { templateId: REAL_A, rationale: "narrowed via clarification" },
      { templateId: REAL_B, rationale: "alt option" },
    ]));
    const { routeTask } = await import("./route-task-action");
    const res = await routeTask("draft a follow-up about the bug", { clarification: "Customer" });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.kind).toBe("candidates");

    // The Anthropic call must have forced tool_choice = route_task
    expect(messagesCreate).toHaveBeenCalledOnce();
    const callArgs = messagesCreate.mock.calls[0]![0] as { tools: { name: string }[]; tool_choice: { type: string; name?: string } };
    expect(callArgs.tools.map((t) => t.name)).toEqual(["route_task"]);
    expect(callArgs.tool_choice.type).toBe("tool");
    expect(callArgs.tool_choice.name).toBe("route_task");
  });

  it("with clarification arg, a misbehaving LLM that returns clarify is coerced to error", async () => {
    // Defense in depth: even if the server forces tool_choice and the LLM still
    // somehow returns clarify, we must not surface a second clarify.
    messagesCreate.mockResolvedValue(
      clarifyToolResponse("Another question?", ["A", "B"]),
    );
    const { routeTask } = await import("./route-task-action");
    const res = await routeTask("draft a follow-up", { clarification: "still vague" });
    expect(res.ok).toBe(false);
  });
});
