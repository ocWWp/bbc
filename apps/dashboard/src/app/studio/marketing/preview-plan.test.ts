import { describe, it, expect, vi, beforeEach } from "vitest";

// previewPlan is the plan-before-run checkpoint: it resolves the actor, the
// template, and the brain's candidate memory -- but NEVER calls the LLM.
// The mocked anthropic client lets us assert that.
const llm = vi.fn();
vi.mock("@/lib/secrets/anthropic-client", () => ({
  getAnthropicClient: () => ({ messages: { create: (...a: unknown[]) => llm(...a) } }),
}));

vi.mock("@/lib/auth/require-user", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/require-user")>();
  return { ...actual, requireActor: vi.fn() };
});

// supabase mock: only loadBrainSummary touches it -- one decision row so the
// candidate-memory mapping path is exercised.
vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServerClient: vi.fn(async () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            order: () => ({
              limit: () =>
                Promise.resolve({
                  data: [
                    {
                      id: "mem_1",
                      type: "decision",
                      title: "Ship invite-only first",
                      fields: {},
                      updated_at: "2026-01-01",
                    },
                  ],
                  error: null,
                }),
            }),
          }),
        }),
      }),
    }),
  })),
}));

import { requireActor } from "@/lib/auth/require-user";

const requireActorMock = requireActor as ReturnType<typeof vi.fn>;

function memberActor() {
  return {
    ok: true as const,
    actor: {
      user_id: "u1",
      provider: "github" as const,
      identifier: "alice",
      actor: "human:github:alice",
      tenant_id: "t1",
      tenant_slug: "acme",
      role: "member" as const,
      templateSlug: null,
    },
  };
}

beforeEach(() => {
  llm.mockClear();
  requireActorMock.mockResolvedValue(memberActor());
});

describe("previewPlan", () => {
  it("returns a plan preview without calling the LLM", async () => {
    const { previewPlan } = await import("./actions");
    const res = await previewPlan("marketing:single-x-post", "draft a launch tweet", {});
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.plan.planSummary).toBeTruthy();
      expect(Array.isArray(res.plan.candidateMemories)).toBe(true);
    }
    expect(llm).not.toHaveBeenCalled();
  });
  it("rejects an unknown template id", async () => {
    const { previewPlan } = await import("./actions");
    const res = await previewPlan("marketing:does-not-exist", "draft a launch tweet", {});
    expect(res.ok).toBe(false);
  });
  it("rejects a too-short task", async () => {
    const { previewPlan } = await import("./actions");
    const res = await previewPlan("marketing:single-x-post", "hi", {});
    expect(res.ok).toBe(false);
  });
});
