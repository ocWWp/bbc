// Task 12 of v1.5 launch polish. The root route should route by role:
//   unauth          -> /queue        (existing behavior; /queue bounces to /auth/signin)
//   empty brain     -> /welcome      (existing empty-brain gate; runs before role split)
//   admin           -> /home
//   operator/member -> /studio/<templateSlug>
//   no templateSlug -> /studio/marketing (default)
//
// We mock requireActor + the Supabase client. redirect() throws — we capture
// the thrown URL to assert the destination.

import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth/require-user", () => ({
  requireActor: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServerClient: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  // Mirrors the real behavior: throws a special error whose message is the URL.
  redirect: vi.fn((url: string) => {
    const err = new Error(`NEXT_REDIRECT:${url}`);
    (err as Error & { digest?: string }).digest = `NEXT_REDIRECT;${url}`;
    throw err;
  }),
}));

import { requireActor } from "@/lib/auth/require-user";
import { getSupabaseServerClient } from "@/lib/supabase/server";

const requireActorMock = requireActor as ReturnType<typeof vi.fn>;
const getServerMock = getSupabaseServerClient as ReturnType<typeof vi.fn>;

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

function withMemoryCount(count: number) {
  getServerMock.mockResolvedValueOnce({
    from: () => ({
      select: () => ({
        eq: () => Promise.resolve({ count, error: null }),
      }),
    }),
  });
}

async function captureRedirect(): Promise<string> {
  // Re-import per-test so the mocks reset cleanly. The page module just calls
  // redirect() at top level inside the default export — invoking the default
  // throws the redirect.
  const mod = await import("@/app/page");
  try {
    await mod.default();
    throw new Error("expected redirect");
  } catch (e) {
    const message = (e as Error).message;
    if (!message.startsWith("NEXT_REDIRECT:")) throw e;
    return message.slice("NEXT_REDIRECT:".length);
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
});

describe("Root route — role-aware redirect", () => {
  it("unauth → /queue", async () => {
    requireActorMock.mockResolvedValueOnce({ ok: false });
    const dest = await captureRedirect();
    expect(dest).toBe("/queue");
  });

  it("empty brain → /welcome (preserves empty-brain gate)", async () => {
    requireActorMock.mockResolvedValueOnce(actorOf("admin"));
    withMemoryCount(0);
    const dest = await captureRedirect();
    expect(dest).toBe("/welcome");
  });

  it("admin + populated → /home", async () => {
    requireActorMock.mockResolvedValueOnce(actorOf("admin", "marketing"));
    withMemoryCount(42);
    const dest = await captureRedirect();
    expect(dest).toBe("/home");
  });

  it("operator + templateSlug=marketing → /studio/marketing", async () => {
    requireActorMock.mockResolvedValueOnce(actorOf("operator", "marketing"));
    withMemoryCount(42);
    const dest = await captureRedirect();
    expect(dest).toBe("/studio/marketing");
  });

  it("member + templateSlug=engineering → /studio/engineering", async () => {
    requireActorMock.mockResolvedValueOnce(actorOf("member", "engineering"));
    withMemoryCount(42);
    const dest = await captureRedirect();
    expect(dest).toBe("/studio/engineering");
  });

  it("templateSlug=null → /studio/marketing (fallback)", async () => {
    requireActorMock.mockResolvedValueOnce(actorOf("member", null));
    withMemoryCount(42);
    const dest = await captureRedirect();
    expect(dest).toBe("/studio/marketing");
  });
});
