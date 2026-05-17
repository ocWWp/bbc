// Task 9 of Phase K install-flow: tests for installGithubPat server action.
//
// What we're protecting:
// - Admin-only gate (PAT install is high-trust; operator is not enough).
// - validatePatLive failure reasons map to distinct, user-readable errors.
// - Happy path calls encryptSecret once with the PAT, then the atomic RPC
//   with the full 15-param shape from migration 0057.
// - The returned object never leaks the plaintext PAT in any field.

import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth/require-user", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/require-user")>();
  return { ...actual, requireActor: vi.fn() };
});

const rpcMock = vi.fn();
// Codex P1 on PR #24: installGithubPat MUST use the service-role client.
// Migration 0058 revokes install_connector_atomic from `authenticated`, so
// any call through the cookie-backed server client now 403s. We wire the
// service client to carry the rpc mock; the server client's rpc throws so
// any regression to the cookie-backed path will blow up the test loudly.
const serverClientRpcMock = vi.fn(() => {
  throw new Error(
    "test wiring: installGithubPat must use getSupabaseServiceClient, not getSupabaseServerClient",
  );
});
vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServerClient: vi.fn(async () => ({ rpc: serverClientRpcMock })),
  getSupabaseServiceClient: vi.fn(() => ({ rpc: rpcMock })),
}));

const encryptSecretMock = vi.fn();
const makeDisplayHintMock = vi.fn();
vi.mock("@/lib/secrets/encryption", () => ({
  encryptSecret: (...args: unknown[]) => encryptSecretMock(...args),
  makeDisplayHint: (...args: unknown[]) => makeDisplayHintMock(...args),
}));

const validatePatLiveMock = vi.fn();
vi.mock("@/lib/connectors/github-validate", () => ({
  validatePatLive: (...args: unknown[]) => validatePatLiveMock(...args),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

const redirectMock = vi.fn((_url: string): never => {
  // Mirror Next.js: redirect throws to halt server-side execution.
  throw new Error("NEXT_REDIRECT");
});
vi.mock("next/navigation", () => ({
  redirect: (url: string) => redirectMock(url),
}));

const recordNonceMock = vi.fn();
vi.mock("@/lib/connectors/oauth-nonce", () => ({
  recordNonce: (...args: unknown[]) => recordNonceMock(...args),
}));

const signOAuthStateMock = vi.fn();
vi.mock("@/lib/connectors/oauth-state", () => ({
  signOAuthState: (...args: unknown[]) => signOAuthStateMock(...args),
}));

import { requireActor } from "@/lib/auth/require-user";
import { installGithubPat, startGoogleOAuth } from "./_actions";
import { GMAIL_SCOPES, DRIVE_SCOPES } from "@/lib/connectors/google-oauth";

const requireActorMock = requireActor as ReturnType<typeof vi.fn>;

type Role = "admin" | "operator" | "member" | "viewer";
function actorOf(role: Role) {
  return {
    ok: true as const,
    actor: {
      user_id: "user-abc",
      provider: "github" as const,
      identifier: "alice",
      actor: "human:github:alice",
      tenant_id: "tenant-xyz",
      tenant_slug: "acme",
      role,
      templateSlug: null,
    },
  };
}

function makeFormData(overrides: Partial<{ pat: string; owner: string; repo: string }> = {}) {
  const fd = new FormData();
  fd.set("pat", overrides.pat ?? "ghp_abcdefghijklmnop1234");
  fd.set("owner", overrides.owner ?? "octocat");
  fd.set("repo", overrides.repo ?? "hello-world");
  return fd;
}

beforeEach(() => {
  vi.clearAllMocks();
  encryptSecretMock.mockReturnValue({
    ciphertext: Buffer.from("ct"),
    iv: Buffer.from("iv"),
    tag: Buffer.from("tg"),
  });
  makeDisplayHintMock.mockReturnValue("…1234");
});

describe("installGithubPat — RBAC", () => {
  it("non-admin actor (operator) is rejected with /admin/", async () => {
    requireActorMock.mockResolvedValueOnce(actorOf("operator"));
    const r = await installGithubPat(makeFormData());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/admin/i);
    expect(validatePatLiveMock).not.toHaveBeenCalled();
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("non-admin actor (member) is rejected with /admin/", async () => {
    requireActorMock.mockResolvedValueOnce(actorOf("member"));
    const r = await installGithubPat(makeFormData());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/admin/i);
  });

  it("unauthenticated caller is rejected", async () => {
    requireActorMock.mockResolvedValueOnce({ ok: false, output: "unauthorized: sign in required" });
    const r = await installGithubPat(makeFormData());
    expect(r.ok).toBe(false);
    expect(rpcMock).not.toHaveBeenCalled();
  });
});

describe("installGithubPat — validatePatLive failure mapping", () => {
  it("invalid_token → error mentions token", async () => {
    requireActorMock.mockResolvedValueOnce(actorOf("admin"));
    validatePatLiveMock.mockResolvedValueOnce({ ok: false, reason: "invalid_token" });
    const r = await installGithubPat(makeFormData());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/token/i);
    expect(encryptSecretMock).not.toHaveBeenCalled();
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("insufficient_scope → error mentions scope", async () => {
    requireActorMock.mockResolvedValueOnce(actorOf("admin"));
    validatePatLiveMock.mockResolvedValueOnce({ ok: false, reason: "insufficient_scope" });
    const r = await installGithubPat(makeFormData());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/scope/i);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("network → error mentions github or reach", async () => {
    requireActorMock.mockResolvedValueOnce(actorOf("admin"));
    validatePatLiveMock.mockResolvedValueOnce({ ok: false, reason: "network" });
    const r = await installGithubPat(makeFormData());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/github|reach/i);
    expect(rpcMock).not.toHaveBeenCalled();
  });
});

describe("installGithubPat — happy path", () => {
  it("encrypts once and calls install_connector_atomic with 15-param shape", async () => {
    requireActorMock.mockResolvedValueOnce(actorOf("admin"));
    validatePatLiveMock.mockResolvedValueOnce({ ok: true, login: "octocat" });
    rpcMock.mockResolvedValueOnce({
      data: [{ external_account_id: "ext-1", tenant_connector_id: "tc-1" }],
      error: null,
    });

    const pat = "ghp_supersecretvalue1234567890";
    const r = await installGithubPat(makeFormData({ pat, owner: "octocat", repo: "hello-world" }));

    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.external_account_id).toBe("ext-1");
      expect(r.tenant_connector_id).toBe("tc-1");
    }

    expect(encryptSecretMock).toHaveBeenCalledTimes(1);
    expect(encryptSecretMock).toHaveBeenCalledWith(pat);

    expect(rpcMock).toHaveBeenCalledTimes(1);
    const [rpcName, rpcParams] = rpcMock.mock.calls[0];
    expect(rpcName).toBe("install_connector_atomic");
    expect(rpcParams).toMatchObject({
      p_tenant_id: "tenant-xyz",
      p_actor_user_id: "user-abc",
      p_connector_id: "github",
      p_provider_id: "github",
      p_kind: "api_key",
      p_refresh_ciphertext: null,
      p_refresh_iv: null,
      p_refresh_tag: null,
      p_expires_at: null,
      p_granted_scopes: null,
      p_mapping: { owner: "octocat", repo: "hello-world" },
    });
    // All 15 params present.
    expect(Object.keys(rpcParams).sort()).toEqual(
      [
        "p_tenant_id",
        "p_actor_user_id",
        "p_connector_id",
        "p_provider_id",
        "p_kind",
        "p_secret_ciphertext",
        "p_secret_iv",
        "p_secret_tag",
        "p_refresh_ciphertext",
        "p_refresh_iv",
        "p_refresh_tag",
        "p_expires_at",
        "p_granted_scopes",
        "p_display_hint",
        "p_mapping",
      ].sort(),
    );
  });

  it("returned object never contains the plaintext PAT", async () => {
    requireActorMock.mockResolvedValueOnce(actorOf("admin"));
    validatePatLiveMock.mockResolvedValueOnce({ ok: true, login: "octocat" });
    rpcMock.mockResolvedValueOnce({
      data: [{ external_account_id: "ext-2", tenant_connector_id: "tc-2" }],
      error: null,
    });

    const pat = "ghp_ZZZ_unique_marker_string_PLAINTEXT_xyz999";
    const result = await installGithubPat(makeFormData({ pat }));

    expect(result.ok).toBe(true);
    expect(JSON.stringify(result).includes(pat)).toBe(false);
  });

  it("RPC error surfaces as { ok: false }", async () => {
    requireActorMock.mockResolvedValueOnce(actorOf("admin"));
    validatePatLiveMock.mockResolvedValueOnce({ ok: true, login: "octocat" });
    rpcMock.mockResolvedValueOnce({ data: null, error: { message: "db blew up" } });

    const r = await installGithubPat(makeFormData());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/db blew up|install failed/i);
  });

  it("malformed RPC return (missing tenant_connector_id) → { ok: false } with /shape/i", async () => {
    requireActorMock.mockResolvedValueOnce(actorOf("admin"));
    validatePatLiveMock.mockResolvedValueOnce({ ok: true, login: "octocat" });
    rpcMock.mockResolvedValueOnce({
      data: [{ external_account_id: "x" }],
      error: null,
    });

    const r = await installGithubPat(makeFormData());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/shape/i);
  });
});

describe("installGithubPat — input validation", () => {
  it("missing owner → invalid input", async () => {
    requireActorMock.mockResolvedValueOnce(actorOf("admin"));
    const fd = new FormData();
    fd.set("pat", "ghp_abcdefghijklmnop1234");
    fd.set("repo", "hello-world");
    // owner intentionally absent
    const r = await installGithubPat(fd);
    expect(r.ok).toBe(false);
    expect(validatePatLiveMock).not.toHaveBeenCalled();
  });

  it("short PAT (under 10 chars) → invalid input", async () => {
    requireActorMock.mockResolvedValueOnce(actorOf("admin"));
    const r = await installGithubPat(makeFormData({ pat: "short" }));
    expect(r.ok).toBe(false);
    expect(validatePatLiveMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Task 13: startGoogleOAuth
// ---------------------------------------------------------------------------

describe("startGoogleOAuth — RBAC", () => {
  beforeEach(() => {
    process.env.BBC_GOOGLE_OAUTH_CLIENT_ID = "google-client-id-xyz";
    process.env.BBC_PUBLIC_URL = "https://bbc.example";
  });

  it("non-admin actor (operator) is rejected with /admin/", async () => {
    requireActorMock.mockResolvedValueOnce(actorOf("operator"));
    const r = (await startGoogleOAuth(new FormData())) as { ok: false; error: string };
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/admin/i);
    expect(recordNonceMock).not.toHaveBeenCalled();
    expect(signOAuthStateMock).not.toHaveBeenCalled();
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("non-admin actor (member) is rejected with /admin/", async () => {
    requireActorMock.mockResolvedValueOnce(actorOf("member"));
    const r = (await startGoogleOAuth(new FormData())) as { ok: false; error: string };
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/admin/i);
  });

  it("unauthenticated caller is rejected", async () => {
    requireActorMock.mockResolvedValueOnce({ ok: false, output: "unauthorized: sign in required" });
    const r = (await startGoogleOAuth(new FormData())) as { ok: false; error: string };
    expect(r.ok).toBe(false);
    expect(redirectMock).not.toHaveBeenCalled();
  });
});

describe("startGoogleOAuth — configuration", () => {
  // Set all four required env vars, then individual tests delete or empty
  // one to verify that ALL of them are checked up-front (codex P3 post-K.5).
  beforeEach(() => {
    process.env.BBC_GOOGLE_OAUTH_CLIENT_ID = "google-client-id-xyz";
    process.env.BBC_GOOGLE_OAUTH_CLIENT_SECRET = "google-secret-xyz";
    process.env.BBC_PUBLIC_URL = "https://bbc.example";
    process.env.BBC_OAUTH_STATE_SECRET = Buffer.from("0".repeat(32)).toString("base64");
  });

  it("missing BBC_GOOGLE_OAUTH_CLIENT_ID → /configured/i", async () => {
    delete process.env.BBC_GOOGLE_OAUTH_CLIENT_ID;
    requireActorMock.mockResolvedValueOnce(actorOf("admin"));
    const r = (await startGoogleOAuth(new FormData())) as { ok: false; error: string };
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/configured/i);
    expect(recordNonceMock).not.toHaveBeenCalled();
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("empty-string BBC_GOOGLE_OAUTH_CLIENT_ID (Cloudflare-unset) → /configured/i", async () => {
    process.env.BBC_GOOGLE_OAUTH_CLIENT_ID = "";
    requireActorMock.mockResolvedValueOnce(actorOf("admin"));
    const r = (await startGoogleOAuth(new FormData())) as { ok: false; error: string };
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/configured/i);
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("missing BBC_GOOGLE_OAUTH_CLIENT_SECRET → /configured/i, no stale nonce row (codex P3)", async () => {
    delete process.env.BBC_GOOGLE_OAUTH_CLIENT_SECRET;
    requireActorMock.mockResolvedValueOnce(actorOf("admin"));
    const r = (await startGoogleOAuth(new FormData())) as { ok: false; error: string };
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/configured/i);
    // The whole point of the fix: don't write a nonce that the callback will
    // fail to redeem anyway.
    expect(recordNonceMock).not.toHaveBeenCalled();
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("missing BBC_OAUTH_STATE_SECRET → /configured/i, no stale nonce row (codex P3)", async () => {
    delete process.env.BBC_OAUTH_STATE_SECRET;
    requireActorMock.mockResolvedValueOnce(actorOf("admin"));
    const r = (await startGoogleOAuth(new FormData())) as { ok: false; error: string };
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/configured/i);
    // Without this guard, recordNonce would succeed, then signOAuthState
    // would throw — leaking a never-redeemed nonce row to the DB.
    expect(recordNonceMock).not.toHaveBeenCalled();
    expect(signOAuthStateMock).not.toHaveBeenCalled();
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("empty BBC_PUBLIC_URL (Cloudflare-unset) → /configured/i", async () => {
    process.env.BBC_PUBLIC_URL = "";
    requireActorMock.mockResolvedValueOnce(actorOf("admin"));
    const r = (await startGoogleOAuth(new FormData())) as { ok: false; error: string };
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/configured/i);
    expect(recordNonceMock).not.toHaveBeenCalled();
  });
});

describe("startGoogleOAuth — happy path", () => {
  beforeEach(() => {
    process.env.BBC_GOOGLE_OAUTH_CLIENT_ID = "google-client-id-xyz";
    process.env.BBC_GOOGLE_OAUTH_CLIENT_SECRET = "google-secret-xyz";
    process.env.BBC_PUBLIC_URL = "https://bbc.example";
    process.env.BBC_OAUTH_STATE_SECRET = Buffer.from("0".repeat(32)).toString("base64");
    signOAuthStateMock.mockReturnValue("signed.state.value");
    recordNonceMock.mockResolvedValue(undefined);
  });

  it("records a nonce with provider=google, scopes=[gmail,drive], 300s ttl", async () => {
    requireActorMock.mockResolvedValueOnce(actorOf("admin"));
    await expect(startGoogleOAuth(new FormData())).rejects.toThrow(/NEXT_REDIRECT/);

    expect(recordNonceMock).toHaveBeenCalledTimes(1);
    const [client, payload] = recordNonceMock.mock.calls[0];
    // Service-role client passed through (cross-user nonce row).
    expect(client).toBeTruthy();

    expect(payload).toMatchObject({
      tenant_id: "tenant-xyz",
      actor_user_id: "user-abc",
      provider: "google",
      scopes: ["gmail", "drive"],
      redirect_url: "/library?installed=gmail,drive",
      ttl_seconds: 300,
    });
    // nonce is a uuid v4-shaped string.
    expect(payload.nonce).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("signs state with matching tenant/actor/provider/scopes/nonce and future expiry", async () => {
    requireActorMock.mockResolvedValueOnce(actorOf("admin"));
    const before = Date.now();
    await expect(startGoogleOAuth(new FormData())).rejects.toThrow(/NEXT_REDIRECT/);

    expect(signOAuthStateMock).toHaveBeenCalledTimes(1);
    const [statePayload] = signOAuthStateMock.mock.calls[0];
    expect(statePayload).toMatchObject({
      tenant_id: "tenant-xyz",
      actor_user_id: "user-abc",
      provider: "google",
      scopes: ["gmail", "drive"],
    });
    expect(statePayload.nonce).toMatch(/^[0-9a-f-]{36}$/);
    expect(statePayload.expires_at_ms).toBeGreaterThan(before);
    expect(statePayload.expires_at_ms).toBeLessThanOrEqual(before + 5 * 60 * 1000 + 1000);

    // nonce passed to recordNonce and signOAuthState is the same value.
    const [, noncePayload] = recordNonceMock.mock.calls[0];
    expect(statePayload.nonce).toBe(noncePayload.nonce);
  });

  it("redirects to Google authorize URL with gmail+drive scopes, configured redirect_uri, and signed state", async () => {
    requireActorMock.mockResolvedValueOnce(actorOf("admin"));
    await expect(startGoogleOAuth(new FormData())).rejects.toThrow(/NEXT_REDIRECT/);

    expect(redirectMock).toHaveBeenCalledTimes(1);
    const [url] = redirectMock.mock.calls[0];
    expect(url).toMatch(/^https:\/\/accounts\.google\.com\/o\/oauth2\/v2\/auth/);

    const u = new URL(url);
    expect(u.searchParams.get("client_id")).toBe("google-client-id-xyz");
    expect(u.searchParams.get("redirect_uri")).toBe(
      "https://bbc.example/api/oauth/google/callback",
    );
    expect(u.searchParams.get("state")).toBe("signed.state.value");

    const scopeParam = u.searchParams.get("scope") ?? "";
    for (const s of [...GMAIL_SCOPES, ...DRIVE_SCOPES]) {
      expect(scopeParam).toContain(s);
    }
  });

  it("recordNonce runs BEFORE redirect (so a recordNonce throw bubbles up and we never redirect)", async () => {
    requireActorMock.mockResolvedValueOnce(actorOf("admin"));
    recordNonceMock.mockRejectedValueOnce(new Error("oauth_state_nonces insert failed"));

    await expect(startGoogleOAuth(new FormData())).rejects.toThrow(
      /oauth_state_nonces insert failed/,
    );
    expect(redirectMock).not.toHaveBeenCalled();
  });
});
