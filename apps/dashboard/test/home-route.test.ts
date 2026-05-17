// /home is admin-only. Other roles get bounced to their /studio/<role>.
// Mirrors the pattern from test/role-aware-root.test.ts.
//
// v1.6 M2: page now renders the conversational ChatHome (server fetches
// active session + queue depth for the greeting). The mocks below stub
// those reads so the test stays page-shape-focused, not query-focused.

import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth/require-user", () => ({
  requireActor: vi.fn(),
}));

vi.mock("@/lib/home/sessions", () => ({
  // PR-C M23: page.tsx switched from getActiveSessionWithTurns → explicit
  // (getSessionWithTurns when ?session=, listSessions for the rail).
  getSessionWithTurns: vi.fn(async () => null),
  listSessions: vi.fn(async () => []),
}));

vi.mock("@/lib/home/read-queue-summary", () => ({
  readQueueSummary: vi.fn(async () => ({ pendingCount: 0, topPending: [] })),
}));

vi.mock("@/lib/supabase/server", () => ({
  // Used by the /home page to read the enabled-signals watching strip.
  // Tests don't care about the data — return empty rows.
  getSupabaseServerClient: vi.fn(async () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            is: () => ({
              order: () => ({
                limit: async () => ({ data: [], error: null }),
              }),
            }),
          }),
        }),
      }),
    }),
  })),
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    const err = new Error(`NEXT_REDIRECT:${url}`);
    (err as Error & { digest?: string }).digest = `NEXT_REDIRECT;${url}`;
    throw err;
  }),
}));

import { requireActor } from "@/lib/auth/require-user";

const requireActorMock = requireActor as ReturnType<typeof vi.fn>;

type Role = "admin" | "operator" | "member" | "viewer";
function actorOf(role: Role, templateSlug: string | null = null) {
  return {
    ok: true as const,
    actor: {
      user_id: "u1",
      provider: "github",
      identifier: "alice",
      actor: "human:github:alice",
      tenant_id: "t1",
      tenant_slug: "acme",
      role,
      templateSlug,
    },
  };
}

async function tryRender(): Promise<{ kind: "redirect"; dest: string } | { kind: "rendered" }> {
  const mod = await import("@/app/home/page");
  try {
    // PR-C M23: HomePage now takes a `searchParams` promise (Next 16's
    // App Router contract). Tests cover the bare /home path; per-param
    // validation lives in src/app/home/page.test.tsx.
    const result = await mod.default({ searchParams: Promise.resolve({}) });
    void result;
    return { kind: "rendered" };
  } catch (e) {
    const message = (e as Error).message;
    if (message.startsWith("NEXT_REDIRECT:")) {
      return { kind: "redirect", dest: message.slice("NEXT_REDIRECT:".length) };
    }
    throw e;
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
});

describe("/home — admin-only guard", () => {
  it("unauth → /auth/signin?callbackUrl=/home", async () => {
    requireActorMock.mockResolvedValueOnce({ ok: false });
    const r = await tryRender();
    expect(r).toEqual({ kind: "redirect", dest: "/auth/signin?callbackUrl=/home" });
  });

  it("operator → /studio/<templateSlug>", async () => {
    requireActorMock.mockResolvedValueOnce(actorOf("operator", "engineering"));
    const r = await tryRender();
    expect(r).toEqual({ kind: "redirect", dest: "/studio/engineering" });
  });

  it("member → /studio/<templateSlug>", async () => {
    requireActorMock.mockResolvedValueOnce(actorOf("member", "support"));
    const r = await tryRender();
    expect(r).toEqual({ kind: "redirect", dest: "/studio/support" });
  });

  it("operator with no templateSlug → /studio/marketing (fallback)", async () => {
    requireActorMock.mockResolvedValueOnce(actorOf("operator", null));
    const r = await tryRender();
    expect(r).toEqual({ kind: "redirect", dest: "/studio/marketing" });
  });

  it("admin renders without redirecting", async () => {
    requireActorMock.mockResolvedValueOnce(actorOf("admin"));
    const r = await tryRender();
    expect(r.kind).toBe("rendered");
  });
});
