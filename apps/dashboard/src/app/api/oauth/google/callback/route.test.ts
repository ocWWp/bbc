// Task 15 of Phase K install-flow: tests for /api/oauth/google/callback.
//
// This route closes the loop on the OAuth dance started by startGoogleOAuth
// (Task 13). What we're protecting:
//
//   1. Missing state/code → redirect with install_error=missing_params.
//   2. Tampered or expired state → install_error=state_invalid.
//   3. Authenticated actor at callback != state.actor_user_id → install_error=actor_mismatch.
//   4. Nonce already redeemed (replay) → install_error=state_reused.
//   5. Google denied consent (error=access_denied query param) → propagates.
//   6. Happy path: tokens exchanged once, install_connector_atomic called once
//      per scope in the state payload (gmail then drive), redirect carries
//      ?installed=gmail,drive.
//   7. Atomicity-style: drive RPC fails → first (gmail) RPC stays committed
//      (no rollback call), redirect carries install_error=install_failed&connector=drive.
//
// Mocking strategy: every external boundary is stubbed (exchangeCodeForTokens,
// supabase client, requireActor). The route itself is the unit under test;
// integration coverage of the RPC + token exchange lives in their own tests.

import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const SECRET = Buffer.from("0".repeat(32)).toString("base64");
const ENCRYPTION_KEY = Buffer.from("0".repeat(32)).toString("base64");

// Hoisted mocks so vi.mock() factories see them.
const { rpcMock, requireActorMock, exchangeMock, consumeNonceMock } = vi.hoisted(() => ({
  rpcMock: vi.fn(),
  requireActorMock: vi.fn(),
  exchangeMock: vi.fn(),
  consumeNonceMock: vi.fn(),
}));

vi.mock("@/lib/auth/require-user", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/require-user")>();
  return { ...actual, requireActor: requireActorMock };
});

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServiceClient: vi.fn(() => ({ rpc: rpcMock })),
}));

vi.mock("@/lib/connectors/google-oauth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/connectors/google-oauth")>();
  return { ...actual, exchangeCodeForTokens: exchangeMock };
});

vi.mock("@/lib/connectors/oauth-nonce", () => ({
  consumeNonce: consumeNonceMock,
}));

// Use the real signOAuthState so tests exercise a true valid signature.
import { signOAuthState, type OAuthStatePayload } from "@/lib/connectors/oauth-state";

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("BBC_OAUTH_STATE_SECRET", SECRET);
  vi.stubEnv("BBC_SECRET_ENCRYPTION_KEY", ENCRYPTION_KEY);
  vi.stubEnv("BBC_GOOGLE_OAUTH_CLIENT_ID", "test-client-id");
  vi.stubEnv("BBC_GOOGLE_OAUTH_CLIENT_SECRET", "test-client-secret");
  vi.stubEnv("BBC_PUBLIC_URL", "https://example.com");
});

function actor(user_id: string) {
  return {
    ok: true as const,
    actor: {
      user_id,
      provider: "google" as const,
      identifier: "alice@example.com",
      actor: "human:google:alice@example.com",
      tenant_id: "tenant-xyz",
      tenant_slug: "acme",
      role: "admin" as const,
      templateSlug: null,
    },
  };
}

function makePayload(overrides: Partial<OAuthStatePayload> = {}): OAuthStatePayload {
  return {
    tenant_id: "tenant-xyz",
    actor_user_id: "user-abc",
    provider: "google",
    scopes: ["gmail", "drive"],
    nonce: "11111111-1111-1111-1111-111111111111",
    expires_at_ms: Date.now() + 60_000,
    ...overrides,
  };
}

function makeReq(query: Record<string, string>): NextRequest {
  const url = new URL("https://example.com/api/oauth/google/callback");
  for (const [k, v] of Object.entries(query)) {
    url.searchParams.set(k, v);
  }
  return new NextRequest(url);
}

async function callGET(query: Record<string, string>) {
  const { GET } = await import("./route");
  return GET(makeReq(query));
}

describe("GET /api/oauth/google/callback — error redirects", () => {
  it("redirects with install_error=missing_params when state is absent", async () => {
    const res = await callGET({ code: "abc" });
    expect(res.status).toBe(307);
    const loc = res.headers.get("location") ?? "";
    expect(loc).toContain("/library?install_error=missing_params");
    expect(consumeNonceMock).not.toHaveBeenCalled();
    expect(exchangeMock).not.toHaveBeenCalled();
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("redirects with install_error=missing_params when code is absent", async () => {
    const stateRaw = signOAuthState(makePayload());
    const res = await callGET({ state: stateRaw });
    const loc = res.headers.get("location") ?? "";
    expect(loc).toContain("/library?install_error=missing_params");
  });

  it("propagates error=access_denied query from Google", async () => {
    const res = await callGET({ error: "access_denied" });
    const loc = res.headers.get("location") ?? "";
    expect(loc).toContain("/library?install_error=access_denied");
    expect(consumeNonceMock).not.toHaveBeenCalled();
    expect(exchangeMock).not.toHaveBeenCalled();
  });

  it("redirects with install_error=state_invalid when state HMAC is tampered", async () => {
    const stateRaw = signOAuthState(makePayload());
    // Flip a character in the signature half.
    const [body, sig] = stateRaw.split(".");
    const tamperedSig = sig.slice(0, -2) + (sig.endsWith("A") ? "B" : "A") + sig.slice(-1);
    const res = await callGET({ code: "abc", state: `${body}.${tamperedSig}` });
    const loc = res.headers.get("location") ?? "";
    expect(loc).toContain("/library?install_error=state_invalid");
    expect(consumeNonceMock).not.toHaveBeenCalled();
  });

  it("redirects with install_error=state_invalid when state has expired", async () => {
    const expired = signOAuthState(makePayload({ expires_at_ms: Date.now() - 1000 }));
    const res = await callGET({ code: "abc", state: expired });
    const loc = res.headers.get("location") ?? "";
    expect(loc).toContain("/library?install_error=state_invalid");
  });

  it("redirects with install_error=actor_mismatch when callback actor differs from state", async () => {
    const stateRaw = signOAuthState(makePayload({ actor_user_id: "u-1" }));
    requireActorMock.mockResolvedValueOnce(actor("u-2"));
    const res = await callGET({ code: "abc", state: stateRaw });
    const loc = res.headers.get("location") ?? "";
    expect(loc).toContain("/library?install_error=actor_mismatch");
    expect(consumeNonceMock).not.toHaveBeenCalled();
    expect(exchangeMock).not.toHaveBeenCalled();
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("redirects with install_error=actor_mismatch when caller is unauthenticated", async () => {
    const stateRaw = signOAuthState(makePayload({ actor_user_id: "u-1" }));
    requireActorMock.mockResolvedValueOnce({ ok: false, output: "unauthorized" });
    const res = await callGET({ code: "abc", state: stateRaw });
    const loc = res.headers.get("location") ?? "";
    expect(loc).toContain("/library?install_error=actor_mismatch");
  });

  it("redirects with install_error=state_reused when nonce has already been consumed", async () => {
    const stateRaw = signOAuthState(makePayload({ actor_user_id: "user-abc" }));
    requireActorMock.mockResolvedValueOnce(actor("user-abc"));
    consumeNonceMock.mockResolvedValueOnce(null); // already used / missing
    const res = await callGET({ code: "abc", state: stateRaw });
    const loc = res.headers.get("location") ?? "";
    expect(loc).toContain("/library?install_error=state_reused");
    expect(exchangeMock).not.toHaveBeenCalled();
    expect(rpcMock).not.toHaveBeenCalled();
  });
});

describe("GET /api/oauth/google/callback — happy path", () => {
  it("exchanges code, installs gmail then drive, redirects with ?installed=gmail,drive", async () => {
    const payload = makePayload({
      actor_user_id: "user-abc",
      tenant_id: "tenant-xyz",
      scopes: ["gmail", "drive"],
    });
    const stateRaw = signOAuthState(payload);

    requireActorMock.mockResolvedValueOnce(actor("user-abc"));
    consumeNonceMock.mockResolvedValueOnce({
      nonce: payload.nonce,
      tenant_id: payload.tenant_id,
      actor_user_id: payload.actor_user_id,
      provider: "google",
      scopes: ["gmail", "drive"],
      redirect_url: "/library?installed=gmail,drive",
    });
    exchangeMock.mockResolvedValueOnce({
      access_token: "ya29.access",
      refresh_token: "1//refresh",
      expires_in: 3600,
      token_type: "Bearer",
      scope: "https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/drive.readonly",
    });
    rpcMock.mockResolvedValueOnce({ data: null, error: null }); // gmail
    rpcMock.mockResolvedValueOnce({ data: null, error: null }); // drive

    const res = await callGET({ code: "the-code", state: stateRaw });
    const loc = res.headers.get("location") ?? "";
    expect(loc).toContain("/library?installed=gmail,drive");

    // Token exchange called exactly once with the right shape.
    expect(exchangeMock).toHaveBeenCalledTimes(1);
    expect(exchangeMock).toHaveBeenCalledWith(
      expect.objectContaining({
        code: "the-code",
        clientId: "test-client-id",
        clientSecret: "test-client-secret",
        redirectUri: "https://example.com/api/oauth/google/callback",
      }),
    );

    // RPC called twice, gmail first then drive.
    expect(rpcMock).toHaveBeenCalledTimes(2);
    expect(rpcMock.mock.calls[0][0]).toBe("install_connector_atomic");
    expect(rpcMock.mock.calls[0][1]).toMatchObject({
      p_tenant_id: "tenant-xyz",
      p_actor_user_id: "user-abc",
      p_connector_id: "gmail",
      p_provider_id: "gmail",
      p_kind: "oauth_token",
    });
    expect(rpcMock.mock.calls[1][0]).toBe("install_connector_atomic");
    expect(rpcMock.mock.calls[1][1]).toMatchObject({
      p_connector_id: "drive",
      p_provider_id: "drive",
      p_kind: "oauth_token",
    });

    // No plaintext token in the redirect.
    expect(loc).not.toContain("ya29.access");
    expect(loc).not.toContain("1//refresh");
  });

  it("atomicity-style: drive RPC fails → gmail row stays, redirect carries install_failed&connector=drive", async () => {
    const payload = makePayload({
      actor_user_id: "user-abc",
      tenant_id: "tenant-xyz",
      scopes: ["gmail", "drive"],
    });
    const stateRaw = signOAuthState(payload);

    requireActorMock.mockResolvedValueOnce(actor("user-abc"));
    consumeNonceMock.mockResolvedValueOnce({
      nonce: payload.nonce,
      tenant_id: payload.tenant_id,
      actor_user_id: payload.actor_user_id,
      provider: "google",
      scopes: ["gmail", "drive"],
      redirect_url: "/library?installed=gmail,drive",
    });
    exchangeMock.mockResolvedValueOnce({
      access_token: "ya29.access",
      refresh_token: "1//refresh",
      expires_in: 3600,
      token_type: "Bearer",
      scope: "https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/drive.readonly",
    });
    rpcMock.mockResolvedValueOnce({ data: null, error: null }); // gmail succeeds
    rpcMock.mockResolvedValueOnce({ data: null, error: { message: "drive insert blew up" } });

    const res = await callGET({ code: "the-code", state: stateRaw });
    const loc = res.headers.get("location") ?? "";
    expect(loc).toContain("install_error=install_failed");
    expect(loc).toContain("connector=drive");

    // Gmail still ran; drive errored. No rollback call.
    expect(rpcMock).toHaveBeenCalledTimes(2);
    const gmailCall = rpcMock.mock.calls[0][1] as { p_connector_id: string };
    expect(gmailCall.p_connector_id).toBe("gmail");
    // No third call (e.g., to revert gmail).
    expect(rpcMock).not.toHaveBeenCalledTimes(3);
  });

  it("partial consent: only gmail granted → installs gmail, redirect carries partial=drive", async () => {
    const payload = makePayload({
      actor_user_id: "user-abc",
      tenant_id: "tenant-xyz",
      scopes: ["gmail", "drive"],
    });
    const stateRaw = signOAuthState(payload);

    requireActorMock.mockResolvedValueOnce(actor("user-abc"));
    consumeNonceMock.mockResolvedValueOnce({
      nonce: payload.nonce,
      tenant_id: payload.tenant_id,
      actor_user_id: payload.actor_user_id,
      provider: "google",
      scopes: ["gmail", "drive"],
      redirect_url: "/library?installed=gmail,drive",
    });
    exchangeMock.mockResolvedValueOnce({
      access_token: "ya29.access",
      refresh_token: "1//refresh",
      expires_in: 3600,
      token_type: "Bearer",
      // User unchecked drive on the consent screen — only gmail comes back.
      scope: "https://www.googleapis.com/auth/gmail.readonly",
    });
    rpcMock.mockResolvedValueOnce({ data: null, error: null }); // gmail

    const res = await callGET({ code: "the-code", state: stateRaw });
    const loc = res.headers.get("location") ?? "";
    expect(loc).toContain("/library?installed=gmail&partial=drive");

    // Only one RPC call — drive must never have been attempted.
    expect(rpcMock).toHaveBeenCalledTimes(1);
    expect(rpcMock.mock.calls[0][0]).toBe("install_connector_atomic");
    expect(rpcMock.mock.calls[0][1]).toMatchObject({
      p_connector_id: "gmail",
      p_provider_id: "gmail",
    });
  });

  it("nothing relevant granted → zero RPC calls, redirect carries install_error=all_denied", async () => {
    const payload = makePayload({
      actor_user_id: "user-abc",
      tenant_id: "tenant-xyz",
      scopes: ["gmail", "drive"],
    });
    const stateRaw = signOAuthState(payload);

    requireActorMock.mockResolvedValueOnce(actor("user-abc"));
    consumeNonceMock.mockResolvedValueOnce({
      nonce: payload.nonce,
      tenant_id: payload.tenant_id,
      actor_user_id: payload.actor_user_id,
      provider: "google",
      scopes: ["gmail", "drive"],
      redirect_url: "/library?installed=gmail,drive",
    });
    exchangeMock.mockResolvedValueOnce({
      access_token: "ya29.access",
      refresh_token: "1//refresh",
      expires_in: 3600,
      token_type: "Bearer",
      // Only profile scope — neither gmail nor drive granted.
      scope: "https://www.googleapis.com/auth/userinfo.email",
    });

    const res = await callGET({ code: "the-code", state: stateRaw });
    const loc = res.headers.get("location") ?? "";
    expect(loc).toContain("/library?install_error=all_denied&denied=gmail,drive");

    // Both scopes denied → no RPC calls at all.
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("redirects with install_error=token_exchange when exchangeCodeForTokens throws", async () => {
    const payload = makePayload({ actor_user_id: "user-abc" });
    const stateRaw = signOAuthState(payload);

    requireActorMock.mockResolvedValueOnce(actor("user-abc"));
    consumeNonceMock.mockResolvedValueOnce({
      nonce: payload.nonce,
      tenant_id: payload.tenant_id,
      actor_user_id: payload.actor_user_id,
      provider: "google",
      scopes: ["gmail", "drive"],
      redirect_url: "/library",
    });
    exchangeMock.mockRejectedValueOnce(new Error("google said 400"));

    const res = await callGET({ code: "the-code", state: stateRaw });
    const loc = res.headers.get("location") ?? "";
    expect(loc).toContain("install_error=token_exchange");
    expect(rpcMock).not.toHaveBeenCalled();
  });
});
