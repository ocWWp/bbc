// Task 11 of Phase K install-flow: integration test for installGithubPat
// across the full happy path, including the reinstall narrative.
//
// Scope choice (A3, wider unit):
// -------------------------------
// The plan describes "Use Supabase MCP to point at a branch" and query real
// rows in external_accounts + tenant_connectors. The dashboard repo already
// has a precedent for real-DB tests: they live in test/rls/ and run under a
// SEPARATE vitest config (vitest.rls.config.ts + `pnpm test:rls`) because they
// require live staging env vars and would otherwise break CI for anyone
// without a Supabase project. The plan asks for the file under
// src/app/library/install/, which is picked up by the default `pnpm test`
// suite. We therefore cannot put a real-DB test here without either
// breaking CI or carving out a third config — both out of scope for this
// task.
//
// Instead we write a "wider unit" that exercises the full code path under a
// mocked Supabase client whose rpc() is recorded across multiple calls.
// This adds value beyond _actions.test.ts (Task 9) by verifying the
// install-twice-with-new-mapping narrative end to end: that the same actor
// can reinstall, that each call produces a distinct RPC invocation with the
// new mapping, that the returned tenant_connector_id reflects the latest
// install, and that an RPC failure on the second call surfaces without
// corrupting the first install's observable state. The revoke + reinsert
// semantics themselves are owned by install_connector_atomic (migration
// 0057) and are exercised in test/rls/tenant_connectors.rls.test.ts where
// real-DB coverage belongs.

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

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

import { requireActor } from "@/lib/auth/require-user";
import { installGithubPat } from "./_actions";

const requireActorMock = requireActor as ReturnType<typeof vi.fn>;

function adminActor() {
  return {
    ok: true as const,
    actor: {
      user_id: "user-int-1",
      provider: "github" as const,
      identifier: "alice",
      actor: "human:github:alice",
      tenant_id: "tenant-int-1",
      tenant_slug: "acme",
      role: "admin" as const,
      templateSlug: null,
    },
  };
}

function makeFormData(overrides: Partial<{ pat: string; owner: string; repo: string }> = {}) {
  const fd = new FormData();
  fd.set("pat", overrides.pat ?? "ghp_inttestvaluepat1234567890");
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

describe("installGithubPat — integration (multi-call narrative)", () => {
  it("install once: external_account + tenant_connector row pair returned", async () => {
    // First install: the RPC, on the real DB, would insert one
    // external_accounts row (status='active') and upsert one
    // tenant_connectors row pointing at it. Here we record what the
    // action SENT to the RPC and what shape it RECEIVED back.
    requireActorMock.mockResolvedValueOnce(adminActor());
    validatePatLiveMock.mockResolvedValueOnce({ ok: true, login: "octocat" });
    rpcMock.mockResolvedValueOnce({
      data: [{ external_account_id: "ext-A", tenant_connector_id: "tc-A" }],
      error: null,
    });

    const r = await installGithubPat(
      makeFormData({ owner: "octocat", repo: "hello-world" }),
    );

    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.external_account_id).toBe("ext-A");
      expect(r.tenant_connector_id).toBe("tc-A");
    }

    expect(rpcMock).toHaveBeenCalledTimes(1);
    const [name, params] = rpcMock.mock.calls[0];
    expect(name).toBe("install_connector_atomic");
    expect(params).toMatchObject({
      p_tenant_id: "tenant-int-1",
      p_connector_id: "github",
      p_provider_id: "github",
      p_kind: "api_key",
      p_mapping: { owner: "octocat", repo: "hello-world" },
    });
  });

  it("reinstall: second call carries new mapping; returns updated tenant_connector_id", async () => {
    // Narrative: same tenant + admin installs github twice with different
    // (owner, repo) mappings. install_connector_atomic, on the real DB,
    // revokes the prior external_accounts row (status='revoked') and
    // inserts a fresh one, then upserts the tenant_connectors row so it
    // points at the new external_account_id with the new mapping. Net:
    // still one active external_accounts row and one tenant_connectors
    // row per (tenant, 'github'), but the mapping is the latest one.
    //
    // The action does not orchestrate the revoke — it issues one RPC call
    // per install and trusts the SQL to handle the transition. We assert
    // that the SECOND rpc call carries the new mapping while sharing the
    // same (tenant, provider, kind) revoke target, and that the action's
    // return value reflects the new tenant_connector_id.

    // First install.
    requireActorMock.mockResolvedValueOnce(adminActor());
    validatePatLiveMock.mockResolvedValueOnce({ ok: true, login: "octocat" });
    rpcMock.mockResolvedValueOnce({
      data: [{ external_account_id: "ext-1", tenant_connector_id: "tc-1" }],
      error: null,
    });
    const first = await installGithubPat(
      makeFormData({ owner: "octocat", repo: "hello-world" }),
    );
    expect(first.ok).toBe(true);
    if (first.ok) expect(first.tenant_connector_id).toBe("tc-1");

    // Second install: different mapping, fresh external_account, same tc id
    // returned by the upsert (tenant_connectors is keyed by (tenant_id,
    // connector_id), so the upsert touches the same row).
    requireActorMock.mockResolvedValueOnce(adminActor());
    validatePatLiveMock.mockResolvedValueOnce({ ok: true, login: "octocat" });
    rpcMock.mockResolvedValueOnce({
      data: [{ external_account_id: "ext-2", tenant_connector_id: "tc-1" }],
      error: null,
    });
    const second = await installGithubPat(
      makeFormData({ owner: "octocat", repo: "different-repo" }),
    );

    expect(second.ok).toBe(true);
    if (second.ok) {
      // Same tenant_connector row (upsert), new external_account underneath.
      expect(second.tenant_connector_id).toBe("tc-1");
      expect(second.external_account_id).toBe("ext-2");
    }

    expect(rpcMock).toHaveBeenCalledTimes(2);
    const [firstName, firstParams] = rpcMock.mock.calls[0];
    const [secondName, secondParams] = rpcMock.mock.calls[1];

    // Both calls hit the same RPC with the same (tenant, provider, kind)
    // identity — that triple is the revoke target inside the SQL.
    expect(firstName).toBe("install_connector_atomic");
    expect(secondName).toBe("install_connector_atomic");
    expect(secondParams.p_tenant_id).toBe(firstParams.p_tenant_id);
    expect(secondParams.p_provider_id).toBe(firstParams.p_provider_id);
    expect(secondParams.p_kind).toBe(firstParams.p_kind);
    expect(secondParams.p_connector_id).toBe(firstParams.p_connector_id);

    // Mapping is what changed.
    expect(firstParams.p_mapping).toEqual({ owner: "octocat", repo: "hello-world" });
    expect(secondParams.p_mapping).toEqual({ owner: "octocat", repo: "different-repo" });

    // Ciphertext is independent per call (fresh encryptSecret invocation).
    expect(encryptSecretMock).toHaveBeenCalledTimes(2);
  });

  it("RPC error on second install: first install's observable state intact, second surfaces { ok: false }", async () => {
    // Narrative: first install succeeds, second install's RPC errors
    // (e.g. transient DB blip). The action must return { ok: false }
    // without throwing, and the prior call's result remains visible to
    // the caller — i.e. failure of N+1 doesn't retroactively poison N.
    requireActorMock.mockResolvedValueOnce(adminActor());
    validatePatLiveMock.mockResolvedValueOnce({ ok: true, login: "octocat" });
    rpcMock.mockResolvedValueOnce({
      data: [{ external_account_id: "ext-ok", tenant_connector_id: "tc-ok" }],
      error: null,
    });
    const first = await installGithubPat(makeFormData());
    expect(first.ok).toBe(true);

    requireActorMock.mockResolvedValueOnce(adminActor());
    validatePatLiveMock.mockResolvedValueOnce({ ok: true, login: "octocat" });
    rpcMock.mockResolvedValueOnce({
      data: null,
      error: { message: "transient db error" },
    });
    const second = await installGithubPat(
      makeFormData({ owner: "octocat", repo: "other-repo" }),
    );

    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.error).toMatch(/transient db error|install failed/i);

    // First call's reply object is still the original success — proves no
    // shared mutable state leaked between calls.
    if (first.ok) {
      expect(first.external_account_id).toBe("ext-ok");
      expect(first.tenant_connector_id).toBe("tc-ok");
    }
  });
});
