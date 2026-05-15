import { describe, expect, it, vi, beforeEach } from "vitest";

const { requireActorMock, requireRoleMock } = vi.hoisted(() => ({
  requireActorMock: vi.fn(),
  requireRoleMock: vi.fn(),
}));

vi.mock("@/lib/auth/require-user", () => ({
  requireActor: requireActorMock,
  requireRole: requireRoleMock,
}));

const { makeServerClientMock } = vi.hoisted(() => ({
  makeServerClientMock: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServerClient: makeServerClientMock,
}));

import { POST } from "./route";

function ctxOf(signalId: string) {
  return { params: Promise.resolve({ signalId }) } as const;
}

const adminActor = {
  user_id: "u1",
  tenant_id: "t1",
  provider: "github",
  identifier: "alice",
  actor: "human:github:alice",
  tenant_slug: "acme",
  role: "operator",
  templateSlug: null,
};

beforeEach(() => {
  requireActorMock.mockReset();
  requireRoleMock.mockReset();
  makeServerClientMock.mockReset();
});

describe("POST /api/observer/run-now/:signalId — pre-orchestrator branches", () => {
  it("401 when not authenticated", async () => {
    requireActorMock.mockResolvedValue({ ok: false });
    const req = new Request("http://x/api/observer/run-now/s1", { method: "POST" });
    const res = await POST(req as never, ctxOf("s1"));
    expect(res.status).toBe(401);
  });

  it("403 when not operator+", async () => {
    requireActorMock.mockResolvedValue({ ok: true, actor: adminActor });
    requireRoleMock.mockReturnValue({ ok: false, output: "forbidden" });
    const req = new Request("http://x/api/observer/run-now/s1", { method: "POST" });
    const res = await POST(req as never, ctxOf("s1"));
    expect(res.status).toBe(403);
  });

  it("404 when signal not found in tenant", async () => {
    requireActorMock.mockResolvedValue({ ok: true, actor: adminActor });
    requireRoleMock.mockReturnValue({ ok: true });
    makeServerClientMock.mockResolvedValue({
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: null, error: null }),
          }),
        }),
      }),
    });
    const req = new Request("http://x/api/observer/run-now/s1", { method: "POST" });
    const res = await POST(req as never, ctxOf("s1"));
    expect(res.status).toBe(404);
  });

  it("409 when signal is disabled", async () => {
    requireActorMock.mockResolvedValue({ ok: true, actor: adminActor });
    requireRoleMock.mockReturnValue({ ok: true });
    makeServerClientMock.mockResolvedValue({
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: {
                id: "s1",
                tenant_id: "t1",
                signal_type: "posthog.metric",
                config_jsonb: { metric: "dau", projectId: "1", region: "us" },
                enabled: false,
                deleted_at: null,
              },
              error: null,
            }),
          }),
        }),
      }),
    });
    const req = new Request("http://x/api/observer/run-now/s1", { method: "POST" });
    const res = await POST(req as never, ctxOf("s1"));
    expect(res.status).toBe(409);
  });

  it("400 for unknown metric id in config_jsonb", async () => {
    requireActorMock.mockResolvedValue({ ok: true, actor: adminActor });
    requireRoleMock.mockReturnValue({ ok: true });
    makeServerClientMock.mockResolvedValue({
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: {
                id: "s1",
                tenant_id: "t1",
                signal_type: "posthog.metric",
                config_jsonb: { metric: "no-such-metric", projectId: "1", region: "us" },
                enabled: true,
                deleted_at: null,
              },
              error: null,
            }),
          }),
        }),
      }),
    });
    const req = new Request("http://x/api/observer/run-now/s1", { method: "POST" });
    const res = await POST(req as never, ctxOf("s1"));
    expect(res.status).toBe(400);
  });
});
