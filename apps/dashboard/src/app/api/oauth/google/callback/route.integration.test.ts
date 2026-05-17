// Task 16 of Phase K install-flow: integration test for the Google OAuth
// callback across the full happy path, including the reinstall and
// partial-then-full-consent narratives.
//
// Scope choice (A3, wider unit):
// -------------------------------
// The plan describes "Test with Supabase branch: insert a nonce, sign matching
// state, hit the callback with code + state. Assert external_accounts has 2
// active rows ..." — i.e. assertions against real Postgres state. The
// dashboard repo already has a precedent for real-DB tests: they live in
// test/rls/ and run under a SEPARATE vitest config
// (vitest.rls.config.ts + `pnpm test:rls`) because they require live staging
// env vars and would otherwise break CI for anyone without a Supabase project.
// The plan asks for the file under src/app/api/oauth/google/callback/, which
// is picked up by the default `pnpm test` suite. We therefore cannot put a
// real-DB test here without either breaking CI or carving out a third config —
// both out of scope for this task. The revoke + reinsert semantics themselves
// are owned by install_connector_atomic (migration 0057) and have real-DB
// coverage in test/rls/tenant_connectors.rls.test.ts.
//
// Instead we write a "wider unit" that exercises the full code path under a
// mocked Supabase client whose rpc() is recorded across multiple callbacks.
// This adds value beyond route.test.ts (Task 15) by verifying multi-callback
// narratives end-to-end:
//
//   1. Reinstall — two callbacks with two different (fresh) nonces yield 4
//      RPC calls total, all carrying the same (tenant, provider, kind) revoke
//      triple, with fresh ciphertext per call. Proves the route doesn't
//      memoize state across requests and that each install round-trips its
//      own encrypted tokens.
//   2. Drive-fails-then-retry — first install errors on drive, leaving gmail
//      "committed". A subsequent retry (fresh nonce, fresh code) re-issues
//      gmail (idempotent via revoke+reinsert) AND drive. Net observable state
//      after retry: 2 install_connector_atomic calls for gmail + drive total
//      across both rounds for gmail (one per round), one failed + one
//      successful for drive. Confirms there's no orphaned-row "stuck" path.
//   3. Partial consent across two installs — first callback grants gmail only
//      (1 RPC call, redirect carries partial=drive). Second callback grants
//      gmail+drive (2 RPC calls). Final RPC log: gmail twice, drive once.
//      Proves the user can recover from a partial-consent install without
//      losing the gmail row, and that drive only ever calls the RPC when its
//      scope is actually granted.

import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const SECRET = Buffer.from("0".repeat(32)).toString("base64");
const ENCRYPTION_KEY = Buffer.from("0".repeat(32)).toString("base64");

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

import { signOAuthState, type OAuthStatePayload } from "@/lib/connectors/oauth-state";

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("BBC_MODE", "db");
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
      tenant_id: "tenant-int-k",
      tenant_slug: "acme",
      role: "admin" as const,
      templateSlug: null,
    },
  };
}

function makePayload(overrides: Partial<OAuthStatePayload> = {}): OAuthStatePayload {
  return {
    tenant_id: "tenant-int-k",
    actor_user_id: "user-int-k",
    provider: "google",
    scopes: ["gmail", "drive"],
    nonce: "11111111-1111-1111-1111-111111111111",
    expires_at_ms: Date.now() + 60_000,
    ...overrides,
  };
}

function nonceRow(p: OAuthStatePayload) {
  return {
    nonce: p.nonce,
    tenant_id: p.tenant_id,
    actor_user_id: p.actor_user_id,
    provider: "google",
    scopes: p.scopes,
    redirect_url: "/library",
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

// Helper: an OK token-exchange response that grants both gmail + drive.
function tokensBoth(suffix: string) {
  return {
    access_token: `ya29.access.${suffix}`,
    refresh_token: `1//refresh.${suffix}`,
    expires_in: 3600,
    token_type: "Bearer",
    scope:
      "https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/drive.readonly https://www.googleapis.com/auth/drive.metadata.readonly",
  };
}

function tokensGmailOnly(suffix: string) {
  return {
    access_token: `ya29.access.${suffix}`,
    refresh_token: `1//refresh.${suffix}`,
    expires_in: 3600,
    token_type: "Bearer",
    scope: "https://www.googleapis.com/auth/gmail.readonly",
  };
}

describe("GET /api/oauth/google/callback — integration (multi-callback narrative)", () => {
  it("reinstall: two callbacks with fresh nonces → 4 RPC calls total, same revoke triple, fresh ciphertext per call", async () => {
    // Narrative: same admin completes Google consent twice (e.g. they
    // rotated their Google account, or they accepted a new scope). Each
    // callback signs its own nonce; the route should call
    // install_connector_atomic once per (gmail, drive) scope per callback,
    // and the SECOND callback's ciphertext must NOT be reused from the
    // first (each token exchange produces fresh access/refresh material).
    //
    // The action does not orchestrate the revoke — it issues one RPC call
    // per scope per callback and trusts install_connector_atomic (migration
    // 0057) to handle the revoke+reinsert. We assert that all four RPC
    // calls share the same (tenant, provider, kind) revoke triple per
    // connector, that ciphertext differs across the two callbacks, and
    // that both callbacks land on /library?installed=gmail,drive.

    // ----- Callback 1 -----
    const p1 = makePayload({ nonce: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa" });
    const state1 = signOAuthState(p1);
    requireActorMock.mockResolvedValueOnce(actor("user-int-k"));
    consumeNonceMock.mockResolvedValueOnce(nonceRow(p1));
    exchangeMock.mockResolvedValueOnce(tokensBoth("first"));
    rpcMock.mockResolvedValueOnce({ data: null, error: null }); // gmail
    rpcMock.mockResolvedValueOnce({ data: null, error: null }); // drive

    const res1 = await callGET({ code: "code-1", state: state1 });
    expect(res1.headers.get("location")).toContain("/library?installed=gmail,drive");

    // ----- Callback 2 -----
    const p2 = makePayload({ nonce: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb" });
    const state2 = signOAuthState(p2);
    requireActorMock.mockResolvedValueOnce(actor("user-int-k"));
    consumeNonceMock.mockResolvedValueOnce(nonceRow(p2));
    exchangeMock.mockResolvedValueOnce(tokensBoth("second"));
    rpcMock.mockResolvedValueOnce({ data: null, error: null }); // gmail
    rpcMock.mockResolvedValueOnce({ data: null, error: null }); // drive

    const res2 = await callGET({ code: "code-2", state: state2 });
    expect(res2.headers.get("location")).toContain("/library?installed=gmail,drive");

    // 4 RPC calls total: gmail+drive twice.
    expect(rpcMock).toHaveBeenCalledTimes(4);

    const calls = rpcMock.mock.calls.map((c) => ({
      name: c[0] as string,
      params: c[1] as Record<string, unknown>,
    }));

    // All calls hit install_connector_atomic with kind=oauth_token and the
    // same tenant.
    for (const c of calls) {
      expect(c.name).toBe("install_connector_atomic");
      expect(c.params.p_kind).toBe("oauth_token");
      expect(c.params.p_tenant_id).toBe("tenant-int-k");
      expect(c.params.p_actor_user_id).toBe("user-int-k");
      // Refresh ciphertext must be present (Google returned refresh_token).
      expect(c.params.p_refresh_ciphertext).not.toBeNull();
      // Granted scopes were forwarded.
      expect(c.params.p_granted_scopes).toEqual([
        "https://www.googleapis.com/auth/gmail.readonly",
        "https://www.googleapis.com/auth/drive.readonly",
        "https://www.googleapis.com/auth/drive.metadata.readonly",
      ]);
    }

    // Ordering: gmail before drive within each callback.
    expect(calls[0].params.p_connector_id).toBe("gmail");
    expect(calls[1].params.p_connector_id).toBe("drive");
    expect(calls[2].params.p_connector_id).toBe("gmail");
    expect(calls[3].params.p_connector_id).toBe("drive");

    // Revoke triple is per-connector: gmail's (tenant, provider, kind) is
    // identical across the two callbacks, and so is drive's.
    expect(calls[0].params.p_provider_id).toBe(calls[2].params.p_provider_id);
    expect(calls[1].params.p_provider_id).toBe(calls[3].params.p_provider_id);

    // Ciphertext is independent per callback (fresh encryptSecret invocation
    // per token-exchange result). Compare callback-1 gmail to callback-2
    // gmail — they should differ because the underlying access_token differs.
    const ct1 = calls[0].params.p_secret_ciphertext as Buffer;
    const ct3 = calls[2].params.p_secret_ciphertext as Buffer;
    expect(Buffer.isBuffer(ct1)).toBe(true);
    expect(Buffer.isBuffer(ct3)).toBe(true);
    expect(ct1.equals(ct3)).toBe(false);
  });

  it("drive-fails-then-retry: orphan-free recovery via a fresh callback", async () => {
    // Narrative: first callback's drive RPC blows up after gmail committed.
    // The user retries (re-launches Google consent → fresh nonce → fresh
    // code). The second callback re-issues install for BOTH connectors:
    // gmail's revoke+reinsert is idempotent on the DB side, drive succeeds
    // this time. Net observable state after retry: gmail called twice
    // (idempotent), drive called twice (once failed, once succeeded), and
    // the second redirect lands on the success URL. This proves the route
    // doesn't leave drive in a half-installed state that future retries
    // skip — every callback re-asserts the full scope list.

    // ----- Callback 1: drive fails -----
    const p1 = makePayload({ nonce: "cccccccc-cccc-cccc-cccc-cccccccccccc" });
    const state1 = signOAuthState(p1);
    requireActorMock.mockResolvedValueOnce(actor("user-int-k"));
    consumeNonceMock.mockResolvedValueOnce(nonceRow(p1));
    exchangeMock.mockResolvedValueOnce(tokensBoth("attempt-1"));
    rpcMock.mockResolvedValueOnce({ data: null, error: null }); // gmail OK
    rpcMock.mockResolvedValueOnce({ data: null, error: { message: "drive db blew up" } });

    const res1 = await callGET({ code: "code-1", state: state1 });
    const loc1 = res1.headers.get("location") ?? "";
    expect(loc1).toContain("install_error=install_failed");
    expect(loc1).toContain("connector=drive");
    // 2 RPC calls so far: gmail succeeded, drive errored — no rollback issued.
    expect(rpcMock).toHaveBeenCalledTimes(2);

    // ----- Callback 2: full retry succeeds -----
    const p2 = makePayload({ nonce: "dddddddd-dddd-dddd-dddd-dddddddddddd" });
    const state2 = signOAuthState(p2);
    requireActorMock.mockResolvedValueOnce(actor("user-int-k"));
    consumeNonceMock.mockResolvedValueOnce(nonceRow(p2));
    exchangeMock.mockResolvedValueOnce(tokensBoth("attempt-2"));
    rpcMock.mockResolvedValueOnce({ data: null, error: null }); // gmail OK
    rpcMock.mockResolvedValueOnce({ data: null, error: null }); // drive OK

    const res2 = await callGET({ code: "code-2", state: state2 });
    expect(res2.headers.get("location")).toContain("/library?installed=gmail,drive");

    // 4 RPC calls total. Critically: the route did NOT short-circuit drive
    // on the second attempt just because it failed before — it tried again.
    expect(rpcMock).toHaveBeenCalledTimes(4);
    const calls = rpcMock.mock.calls.map((c) => c[1] as Record<string, unknown>);
    expect(calls[0].p_connector_id).toBe("gmail");
    expect(calls[1].p_connector_id).toBe("drive");
    expect(calls[2].p_connector_id).toBe("gmail");
    expect(calls[3].p_connector_id).toBe("drive");

    // Second-attempt gmail re-issued install with fresh ciphertext (the
    // revoke+reinsert is idempotent on the DB; from the route's POV it
    // simply called the RPC again). Confirms gmail was NOT skipped just
    // because it was already "installed" — every callback re-asserts the
    // full scope list, which is what makes the retry path work.
    const gmail1 = calls[0].p_secret_ciphertext as Buffer;
    const gmail2 = calls[2].p_secret_ciphertext as Buffer;
    expect(gmail1.equals(gmail2)).toBe(false);
  });

  it("partial-then-full consent: first install grants gmail only, second adds drive — final state has both", async () => {
    // Narrative: first time through consent the user unchecks drive (gmail
    // only). The route installs gmail and redirects with partial=drive. The
    // user re-launches install, this time approving both. Final RPC ledger:
    // gmail twice (the second install re-asserts it via the SQL's
    // revoke+reinsert), drive once. Proves that partial consent on
    // attempt N doesn't poison attempt N+1, and that drive only gets an
    // install_connector_atomic call once it's actually granted.

    // ----- Callback 1: gmail only -----
    const p1 = makePayload({ nonce: "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee" });
    const state1 = signOAuthState(p1);
    requireActorMock.mockResolvedValueOnce(actor("user-int-k"));
    consumeNonceMock.mockResolvedValueOnce(nonceRow(p1));
    exchangeMock.mockResolvedValueOnce(tokensGmailOnly("partial"));
    rpcMock.mockResolvedValueOnce({ data: null, error: null }); // gmail OK

    const res1 = await callGET({ code: "code-1", state: state1 });
    expect(res1.headers.get("location")).toContain("/library?installed=gmail&partial=drive");
    // Only one RPC: drive must not be called when its scope wasn't granted.
    expect(rpcMock).toHaveBeenCalledTimes(1);

    // ----- Callback 2: gmail + drive -----
    const p2 = makePayload({ nonce: "ffffffff-ffff-ffff-ffff-ffffffffffff" });
    const state2 = signOAuthState(p2);
    requireActorMock.mockResolvedValueOnce(actor("user-int-k"));
    consumeNonceMock.mockResolvedValueOnce(nonceRow(p2));
    exchangeMock.mockResolvedValueOnce(tokensBoth("full"));
    rpcMock.mockResolvedValueOnce({ data: null, error: null }); // gmail
    rpcMock.mockResolvedValueOnce({ data: null, error: null }); // drive

    const res2 = await callGET({ code: "code-2", state: state2 });
    expect(res2.headers.get("location")).toContain("/library?installed=gmail,drive");

    // 3 RPC calls total across both callbacks: gmail(x2), drive(x1).
    expect(rpcMock).toHaveBeenCalledTimes(3);
    const callConnectors = rpcMock.mock.calls.map(
      (c) => (c[1] as Record<string, unknown>).p_connector_id,
    );
    expect(callConnectors).toEqual(["gmail", "gmail", "drive"]);

    // The drive call carries a different granted-scopes set than the first
    // gmail-only call — confirms each callback uses ITS OWN token-exchange
    // result, not a cached one.
    const firstGmailScopes = rpcMock.mock.calls[0][1].p_granted_scopes as string[];
    const driveScopes = rpcMock.mock.calls[2][1].p_granted_scopes as string[];
    expect(firstGmailScopes).toEqual(["https://www.googleapis.com/auth/gmail.readonly"]);
    expect(driveScopes).toEqual([
      "https://www.googleapis.com/auth/gmail.readonly",
      "https://www.googleapis.com/auth/drive.readonly",
      "https://www.googleapis.com/auth/drive.metadata.readonly",
    ]);
  });
});
