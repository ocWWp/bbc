import { describe, it, expect, vi, beforeEach } from "vitest";

const requireActorMock = vi.fn();
vi.mock("@/lib/auth/require-user", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth/require-user")>()),
  requireActor: () => requireActorMock(),
}));

// loadBrainSummary chain: .from().select().eq().eq().order().limit() -> { data }.
// This mock MUST match brain-summary.ts exactly or it throws before assertions.
vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServerClient: async () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            order: () => ({ limit: async () => ({ data: [], error: null }) }),
          }),
        }),
      }),
    }),
  }),
}));

function memberActor() {
  return { ok: true as const, actor: { user_id: "u1", tenant_id: "t1", role: "member", identifier: "u@x.com" } };
}

// Real ids from the registries: marketing:custom has only an optional
// firstUseInput; eng:adr-draft has two required firstUseInputs.
const NO_REQ_ID = "marketing:custom";
const REQ_ID = "eng:adr-draft";

beforeEach(() => {
  requireActorMock.mockReset();
  requireActorMock.mockResolvedValue(memberActor());
});

describe("previewPlan (shared)", () => {
  it("resolves a template with no required inputs and returns a plan", async () => {
    const { previewPlan } = await import("./preview-plan-action");
    const res = await previewPlan(NO_REQ_ID, "decide whether to keep Vercel or move", {});
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.plan.templateId).toBe(NO_REQ_ID);
      expect(res.plan.templateLabel).toBeTruthy();
      expect(Array.isArray(res.plan.candidateMemories)).toBe(true);
      expect(Array.isArray(res.plan.alwaysOnContext)).toBe(true);
    }
  });

  it("rejects an unknown template id", async () => {
    const { previewPlan } = await import("./preview-plan-action");
    expect((await previewPlan("eng:nope", "a valid length task", {})).ok).toBe(false);
  });

  it("rejects a too-short task", async () => {
    const { previewPlan } = await import("./preview-plan-action");
    expect((await previewPlan(NO_REQ_ID, "hi", {})).ok).toBe(false);
  });

  it("rejects when a required first-use input is missing", async () => {
    const { previewPlan } = await import("./preview-plan-action");
    expect((await previewPlan(REQ_ID, "a valid length task here", {})).ok).toBe(false);
  });

  it("rejects an unauthorized actor", async () => {
    requireActorMock.mockResolvedValueOnce({ ok: false, output: "nope" });
    const { previewPlan } = await import("./preview-plan-action");
    expect((await previewPlan(NO_REQ_ID, "a valid length task", {})).ok).toBe(false);
  });
});
