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

function toolResponse(candidates: Array<{ templateId: string; rationale: string }>) {
  return { content: [{ type: "tool_use", name: "route_task", input: { candidates } }] };
}

beforeEach(() => {
  requireActorMock.mockReset();
  requireActorMock.mockResolvedValue(memberActor());
  messagesCreate.mockReset();
});

describe("routeTask", () => {
  it("returns candidates carrying the correct owningRole, filtering unknown ids", async () => {
    messagesCreate.mockResolvedValue(toolResponse([
      { templateId: REAL_A, rationale: "fits the decision task" },
      { templateId: FAKE, rationale: "hallucinated id" },
      { templateId: REAL_B, rationale: "fallback free-form" },
    ]));
    const { routeTask } = await import("./route-task-action");
    const res = await routeTask("decide whether to keep Vercel or move to Cloudflare");
    expect(res.ok).toBe(true);
    if (res.ok) {
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
