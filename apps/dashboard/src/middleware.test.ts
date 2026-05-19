import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

// Pin tested behavior: every assertion below is a regression gate. The
// allowlist is the trust boundary between "anyone on the internet" and
// "authenticated tenant member" — any future change to middleware.ts
// must keep these assertions green or be intentional.

let mockUser: { id: string } | null = null;
let mockSupabaseConfigured = true;

vi.mock("@/lib/supabase/middleware", () => ({
  updateSession: vi.fn(async () => ({
    response: NextResponse.next(),
    user: mockUser,
  })),
}));

import { middleware } from "./middleware";

const originalSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

beforeEach(() => {
  mockUser = null;
  mockSupabaseConfigured = true;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
});

afterEach(() => {
  if (originalSupabaseUrl === undefined) {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  } else {
    process.env.NEXT_PUBLIC_SUPABASE_URL = originalSupabaseUrl;
  }
});

function req(path: string): NextRequest {
  return new NextRequest(new URL(path, "https://bigbraincompany.online"));
}

async function expectRedirectToSignin(path: string) {
  const res = await middleware(req(path));
  expect(res.status).toBe(307);
  const location = res.headers.get("location");
  expect(location).toContain("/auth/signin");
  expect(location).toContain(`callbackUrl=${encodeURIComponent(path)}`);
}

async function expectPassThrough(path: string) {
  const res = await middleware(req(path));
  // NextResponse.next() returns 200 (not a redirect).
  expect(res.status).not.toBe(307);
  expect(res.headers.get("location")).toBeNull();
}

describe("middleware allowlist — public routes (no session required)", () => {
  it("/auth/signin is public", async () => {
    await expectPassThrough("/auth/signin");
  });

  it("/api/auth/self-serve-signup is public", async () => {
    await expectPassThrough("/api/auth/self-serve-signup");
  });

  it("/api/mcp is public (Bearer-auth handled by route handler)", async () => {
    await expectPassThrough("/api/mcp");
  });

  it("/api/v1/brain/memories is public (Bearer-auth handled by route handler)", async () => {
    await expectPassThrough("/api/v1/brain/memories");
  });

  it("/landing is public (marketing surface)", async () => {
    await expectPassThrough("/landing");
  });

  it("/invite/<token> is public (invitation accept flow)", async () => {
    await expectPassThrough("/invite/abc123");
  });

  it("/about/security is public (trust-model disclosure — PR #37)", async () => {
    await expectPassThrough("/about/security");
  });

  it("/privacy is public (linked from /auth/signin footer — PR #37)", async () => {
    await expectPassThrough("/privacy");
  });

  it("/terms is public (linked from /auth/signin footer — PR #37)", async () => {
    await expectPassThrough("/terms");
  });
});

describe("middleware allowlist — protected routes redirect when unauthenticated", () => {
  it("/home redirects to signin", async () => {
    await expectRedirectToSignin("/home");
  });

  it("/studio/founder redirects to signin", async () => {
    await expectRedirectToSignin("/studio/founder");
  });

  it("/library redirects to signin", async () => {
    await expectRedirectToSignin("/library");
  });

  it("/memory redirects to signin", async () => {
    await expectRedirectToSignin("/memory");
  });

  it("/queue redirects to signin", async () => {
    await expectRedirectToSignin("/queue");
  });

  it("/settings/keys redirects to signin", async () => {
    await expectRedirectToSignin("/settings/keys");
  });

  it("/inbox redirects to signin", async () => {
    await expectRedirectToSignin("/inbox");
  });

  it("/brain redirects to signin", async () => {
    await expectRedirectToSignin("/brain");
  });

  it("/ops redirects to signin", async () => {
    await expectRedirectToSignin("/ops");
  });
});

describe("middleware allowlist — regression gates", () => {
  it("/api/spike-v16/stream is NOT public (route deleted PR #38, prefix removed from allowlist)", async () => {
    // If a future change accidentally re-adds the allowlist entry, this gate
    // catches it. The route file itself is gone — but the allowlist line
    // being absent is the trust-boundary check.
    await expectRedirectToSignin("/api/spike-v16/stream");
  });

  it("/privacy.html does NOT match /privacy (exact match only)", async () => {
    // Exact-match for /privacy and /terms (vs. startsWith for /about) means
    // /privacy.html or /privacycollector would gate to signin.
    await expectRedirectToSignin("/privacy.html");
  });

  it("/termsofservice does NOT match /terms (exact match only)", async () => {
    await expectRedirectToSignin("/termsofservice");
  });
});

describe("middleware allowlist — authenticated requests pass through", () => {
  it("authenticated /home does not redirect", async () => {
    mockUser = { id: "user-1" };
    await expectPassThrough("/home");
  });

  it("authenticated /studio/founder does not redirect", async () => {
    mockUser = { id: "user-1" };
    await expectPassThrough("/studio/founder");
  });
});

describe("middleware allowlist — Supabase escape hatch", () => {
  it("when NEXT_PUBLIC_SUPABASE_URL is unset, protected routes pass through (dev escape)", async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    mockUser = null;
    await expectPassThrough("/home");
  });

  it("Cloudflare empty-string env counts as unset for the escape hatch", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "";
    mockUser = null;
    await expectPassThrough("/home");
  });
});
