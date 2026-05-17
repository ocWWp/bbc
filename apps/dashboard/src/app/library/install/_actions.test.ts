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
vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServerClient: vi.fn(async () => ({ rpc: rpcMock })),
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

import { requireActor } from "@/lib/auth/require-user";
import { installGithubPat } from "./_actions";

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
