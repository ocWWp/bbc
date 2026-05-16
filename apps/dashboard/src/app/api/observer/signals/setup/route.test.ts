import { describe, expect, it, vi, beforeEach } from "vitest";

const { requireActorMock, supabaseInsertMock, supabaseExistingMock } = vi.hoisted(() => ({
  requireActorMock: vi.fn(),
  supabaseInsertMock: vi.fn(),
  supabaseExistingMock: vi.fn(),
}));

vi.mock("@/lib/auth/require-user", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth/require-user")>(
    "@/lib/auth/require-user",
  );
  return {
    ...actual,
    requireActor: requireActorMock,
  };
});

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServerClient: vi.fn(async () => ({
    from(table: string) {
      if (table !== "observer_signals") {
        throw new Error(`unexpected table: ${table}`);
      }
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({
              is: () => ({
                contains: () => ({
                  limit: () => ({
                    maybeSingle: async () => supabaseExistingMock(),
                  }),
                }),
              }),
            }),
          }),
        }),
        insert: (row: unknown) => ({
          select: () => ({
            single: async () => supabaseInsertMock(row),
          }),
        }),
      };
    },
  })),
}));

import { POST } from "./route";

function makeReq(body: unknown) {
  return new Request("http://localhost/api/observer/signals/setup", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  requireActorMock.mockReset();
  supabaseInsertMock.mockReset();
  supabaseExistingMock.mockReset();
  supabaseExistingMock.mockResolvedValue({ data: null, error: null });
});

describe("POST /api/observer/signals/setup", () => {
  it("returns 401 when not authenticated", async () => {
    requireActorMock.mockResolvedValue({ ok: false, output: "unauthorized" });
    const res = await POST(makeReq({ metric: "dau", projectId: "proj-1" }) as never);
    expect(res.status).toBe(401);
  });

  it("returns 403 when user lacks operator role", async () => {
    requireActorMock.mockResolvedValue({
      ok: true,
      actor: {
        tenant_id: "t1",
        user_id: "u1",
        role: "member",
        tenant_slug: "acme",
      },
    });
    const res = await POST(makeReq({ metric: "dau", projectId: "proj-1" }) as never);
    expect(res.status).toBe(403);
  });

  it("returns 400 when metric is unknown", async () => {
    requireActorMock.mockResolvedValue({
      ok: true,
      actor: {
        tenant_id: "t1",
        user_id: "u1",
        role: "operator",
        tenant_slug: "acme",
      },
    });
    const res = await POST(makeReq({ metric: "made-up", projectId: "proj-1" }) as never);
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.error).toMatch(/unknown metric/);
  });

  it("returns 400 when projectId missing and no env fallback", async () => {
    requireActorMock.mockResolvedValue({
      ok: true,
      actor: { tenant_id: "t1", user_id: "u1", role: "operator", tenant_slug: "acme" },
    });
    delete process.env.POSTHOG_PROJECT_ID;
    const res = await POST(makeReq({ metric: "dau" }) as never);
    expect(res.status).toBe(400);
  });

  it("creates a disabled signal and returns its id", async () => {
    requireActorMock.mockResolvedValue({
      ok: true,
      actor: { tenant_id: "t1", user_id: "u1", role: "operator", tenant_slug: "acme" },
    });
    supabaseInsertMock.mockResolvedValue({ data: { id: "sig-1" }, error: null });

    const res = await POST(
      makeReq({ metric: "dau", projectId: "proj-1", region: "us" }) as never,
    );
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.signalId).toBe("sig-1");

    expect(supabaseInsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        tenant_id: "t1",
        signal_type: "posthog.metric",
        enabled: false,
        config_jsonb: expect.objectContaining({
          metric: "dau",
          projectId: "proj-1",
          region: "us",
        }),
      }),
    );
  });

  it("reuses an existing non-deleted signal instead of duplicating", async () => {
    requireActorMock.mockResolvedValue({
      ok: true,
      actor: { tenant_id: "t1", user_id: "u1", role: "operator", tenant_slug: "acme" },
    });
    supabaseExistingMock.mockResolvedValue({
      data: { id: "sig-existing", enabled: false },
      error: null,
    });

    const res = await POST(
      makeReq({ metric: "dau", projectId: "proj-1", region: "us" }) as never,
    );
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.signalId).toBe("sig-existing");
    expect(supabaseInsertMock).not.toHaveBeenCalled();
  });
});
