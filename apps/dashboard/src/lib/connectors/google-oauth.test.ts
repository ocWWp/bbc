// D-W5-1 tests for the shared Google OAuth helper.
//
// HTTP is mocked via GoogleFetch injection.

import { describe, expect, it } from "vitest";
import {
  buildAuthorizeUrl,
  buildOAuthState,
  DRIVE_SCOPES,
  exchangeCodeForTokens,
  GMAIL_SCOPES,
  isGoogleAppVerified,
  parseOAuthState,
  refreshAccessToken,
  type GoogleFetch,
} from "./google-oauth";

type Resp = { ok: boolean; status: number; body?: unknown; text?: string };

function mockFetch(handler: (url: string, init?: { body?: string }) => Resp): { fetch: GoogleFetch; calls: { url: string; body?: string }[] } {
  const calls: { url: string; body?: string }[] = [];
  const fetchImpl: GoogleFetch = async (url, init) => {
    calls.push({ url, body: init?.body });
    const r = handler(url, init);
    return {
      ok: r.ok,
      status: r.status,
      json: async () => r.body,
      text: async () => r.text ?? (typeof r.body === "string" ? r.body : JSON.stringify(r.body)),
      headers: { get: () => null },
    };
  };
  return { fetch: fetchImpl, calls };
}

describe("buildAuthorizeUrl", () => {
  it("builds a Google OAuth URL with offline access + consent prompt", () => {
    const url = buildAuthorizeUrl({
      clientId: "cid",
      redirectUri: "https://bbc.example/oauth/google/callback",
      scopes: GMAIL_SCOPES,
      state: "tenant=t1;provider=gmail;nonce=abc",
    });
    const u = new URL(url);
    expect(u.origin + u.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(u.searchParams.get("client_id")).toBe("cid");
    expect(u.searchParams.get("redirect_uri")).toBe("https://bbc.example/oauth/google/callback");
    expect(u.searchParams.get("response_type")).toBe("code");
    expect(u.searchParams.get("scope")).toBe("https://www.googleapis.com/auth/gmail.readonly");
    expect(u.searchParams.get("access_type")).toBe("offline");
    expect(u.searchParams.get("prompt")).toBe("consent");
    expect(u.searchParams.get("include_granted_scopes")).toBe("true");
  });

  it("joins multiple scopes (drive bundle)", () => {
    const url = buildAuthorizeUrl({
      clientId: "cid",
      redirectUri: "r",
      scopes: DRIVE_SCOPES,
      state: "s",
    });
    const scope = new URL(url).searchParams.get("scope")!;
    expect(scope.split(" ")).toEqual([...DRIVE_SCOPES]);
  });

  it("can combine gmail + drive scopes for a shared consent screen", () => {
    const url = buildAuthorizeUrl({
      clientId: "cid",
      redirectUri: "r",
      scopes: [...GMAIL_SCOPES, ...DRIVE_SCOPES],
      state: "s",
    });
    const scope = new URL(url).searchParams.get("scope")!;
    expect(scope).toContain("gmail.readonly");
    expect(scope).toContain("drive.readonly");
  });

  it("supports login_hint when supplied", () => {
    const url = buildAuthorizeUrl({
      clientId: "cid",
      redirectUri: "r",
      scopes: GMAIL_SCOPES,
      state: "s",
      loginHint: "user@example.com",
    });
    expect(new URL(url).searchParams.get("login_hint")).toBe("user@example.com");
  });
});

describe("exchangeCodeForTokens", () => {
  it("posts form-urlencoded credentials and returns the token payload", async () => {
    const tokens = { access_token: "at", refresh_token: "rt", expires_in: 3599, token_type: "Bearer", scope: "https://www.googleapis.com/auth/gmail.readonly" };
    const { fetch, calls } = mockFetch(() => ({ ok: true, status: 200, body: tokens }));
    const res = await exchangeCodeForTokens({
      code: "the_code",
      clientId: "cid",
      clientSecret: "csec",
      redirectUri: "https://bbc.example/cb",
      fetch,
    });
    expect(res).toEqual(tokens);
    expect(calls[0].url).toBe("https://oauth2.googleapis.com/token");
    const params = new URLSearchParams(calls[0].body!);
    expect(params.get("code")).toBe("the_code");
    expect(params.get("client_id")).toBe("cid");
    expect(params.get("client_secret")).toBe("csec");
    expect(params.get("grant_type")).toBe("authorization_code");
    expect(params.get("redirect_uri")).toBe("https://bbc.example/cb");
  });

  it("throws on non-2xx with the response body in the message", async () => {
    const { fetch } = mockFetch(() => ({ ok: false, status: 400, body: { error: "invalid_grant" } }));
    await expect(
      exchangeCodeForTokens({ code: "c", clientId: "cid", clientSecret: "s", redirectUri: "r", fetch }),
    ).rejects.toThrow(/400.*invalid_grant/);
  });
});

describe("refreshAccessToken", () => {
  it("posts refresh_token grant and returns a new access token", async () => {
    const { fetch, calls } = mockFetch(() => ({
      ok: true,
      status: 200,
      body: { access_token: "at2", expires_in: 3599, token_type: "Bearer", scope: "https://www.googleapis.com/auth/gmail.readonly" },
    }));
    const res = await refreshAccessToken({ refreshToken: "rt", clientId: "cid", clientSecret: "s", fetch });
    expect(res.access_token).toBe("at2");
    const params = new URLSearchParams(calls[0].body!);
    expect(params.get("grant_type")).toBe("refresh_token");
    expect(params.get("refresh_token")).toBe("rt");
  });

  it("maps 400 (invalid_grant on revoked tokens) to AuthExpiredError", async () => {
    const { fetch } = mockFetch(() => ({ ok: false, status: 400, body: { error: "invalid_grant" } }));
    await expect(
      refreshAccessToken({ refreshToken: "rt", clientId: "cid", clientSecret: "s", fetch }),
    ).rejects.toMatchObject({ name: "AuthExpiredError" });
  });

  it("maps 401 to AuthExpiredError", async () => {
    const { fetch } = mockFetch(() => ({ ok: false, status: 401, body: "unauthorized" }));
    await expect(
      refreshAccessToken({ refreshToken: "rt", clientId: "cid", clientSecret: "s", fetch }),
    ).rejects.toMatchObject({ name: "AuthExpiredError" });
  });

  it("throws plain Error on other 5xx", async () => {
    const { fetch } = mockFetch(() => ({ ok: false, status: 503, body: "down" }));
    await expect(
      refreshAccessToken({ refreshToken: "rt", clientId: "cid", clientSecret: "s", fetch }),
    ).rejects.toThrow(/503/);
  });
});

describe("isGoogleAppVerified", () => {
  it("returns true only for explicit truthy values", () => {
    expect(isGoogleAppVerified({})).toBe(false);
    expect(isGoogleAppVerified({ BBC_GOOGLE_OAUTH_VERIFIED: "" })).toBe(false);
    expect(isGoogleAppVerified({ BBC_GOOGLE_OAUTH_VERIFIED: "false" })).toBe(false);
    expect(isGoogleAppVerified({ BBC_GOOGLE_OAUTH_VERIFIED: "no" })).toBe(false);
    expect(isGoogleAppVerified({ BBC_GOOGLE_OAUTH_VERIFIED: "true" })).toBe(true);
    expect(isGoogleAppVerified({ BBC_GOOGLE_OAUTH_VERIFIED: "TRUE" })).toBe(true);
    expect(isGoogleAppVerified({ BBC_GOOGLE_OAUTH_VERIFIED: "1" })).toBe(true);
    expect(isGoogleAppVerified({ BBC_GOOGLE_OAUTH_VERIFIED: "yes" })).toBe(true);
  });
});

describe("buildOAuthState / parseOAuthState", () => {
  it("round-trips a state string", () => {
    const s = buildOAuthState({ tenant_id: "t-1", provider: "gmail", nonce: "abc123" });
    expect(s).toContain("tenant=t-1");
    expect(parseOAuthState(s)).toEqual({ tenant_id: "t-1", provider: "gmail", nonce: "abc123" });
  });

  it("returns null on a malformed state", () => {
    expect(parseOAuthState("garbage")).toBeNull();
    expect(parseOAuthState("tenant=t1")).toBeNull();
  });

  it("URL-encodes values that contain reserved characters", () => {
    const s = buildOAuthState({ tenant_id: "t;1=a", provider: "drive", nonce: "n" });
    const parsed = parseOAuthState(s);
    expect(parsed?.tenant_id).toBe("t;1=a");
  });
});
