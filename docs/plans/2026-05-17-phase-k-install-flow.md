# Phase K — install-flow implementation plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make `/library` install buttons real for `github`, `gmail`, and `drive` connectors. After this plan, an admin can click Install, complete the flow (PAT paste for GitHub, OAuth round-trip for Google), and a row appears in `tenant_connectors` so the connector starts syncing on schedule.

**Architecture:** Stacks on `feat/ops-page` (PR #23). Three new migrations: extend `external_accounts` for OAuth refresh tokens + expiry, add `oauth_state_nonces` for CSRF + replay protection, add `install_connector_atomic` RPC for transactional install. Rewrite `buildOAuthState` as HMAC-signed + nonce-backed. New routes `/library/install/[id]` and `/api/oauth/google/callback`. Replace the fake `setTimeout` `handleInstall` in `LibraryClient.tsx` with a real router push.

**Tech Stack:** Next.js 16 App Router, server actions, Supabase Postgres + RLS + RPC, `@supabase/ssr`, AES-256-GCM via `node:crypto`, HMAC-SHA256 for state signing, Vitest.

**Design source:** `docs/plans/2026-05-17-phase-k-install-flow-design.md` (codex-reviewed; 8 findings applied).

---

## K.2 follow-up for Task 15

`consumeNonce` returns `null` for **both** missing-row (`PGRST116`) AND any DB/network error. Task 15 must NOT show `install_error=state_reused` for transport errors — operators would chase a phantom CSRF bug. Either (a) log the underlying error when consume returns null after a well-formed signed state validates, or (b) add a sibling helper that distinguishes "not found" from "DB error". Recommend (b) for honesty.

## K.1 deviations (recorded after execution)

- **Migration filenames shifted.** Plan said `0040 / 0041 / 0042`; live migrations dir was already at `0054`. Shipped as `0055 / 0056 / 0057`.
- **Task 3 RPC adapted to real `tenant_connectors` schema** (migration 0034 reality):
  - Conflict target uses `WHERE active` (real partial unique index `tenant_connectors_active_unique_idx`), not the plan's `WHERE last_sync_status != 'uninstalled'` (the `last_sync_status` CHECK doesn't include `'uninstalled'` either).
  - Reinstall sets `installed_at = now()` (no `updated_at` column exists).
  - Reinstall also resets `last_sync_at / last_sync_status / last_sync_error / uninstalled_at = null` so `/ops` honest counts don't regress (fixes from commits `738f843` + `d909446`).
  - RPC revokes `execute` from `public, anon` before granting to `authenticated` (SECURITY DEFINER hardening).
- **Task 2 dropped vestigial `consumed_at` column.** Plan had it; `consumeNonce()` (Task 7) uses DELETE-with-RETURNING, so the column would never be written. Table is 8 columns, not 9.

Downstream tasks: when Task 9 / Task 15 call `sb.rpc("install_connector_atomic", {...})`, the parameter shape is unchanged from the plan (still 15 `p_*` args); only the function body differs.

---

## Phase K.1 — Schema foundation (3 tasks)

### Task 1: Migration 0040 — OAuth columns on external_accounts

**Files:**
- Create: `apps/dashboard/supabase/migrations/0040_external_accounts_oauth.sql`

**Step 1: Write the migration**

```sql
-- Phase K install-flow: add OAuth refresh + expiry fields to external_accounts.
-- Existing rows (LLM api_keys, GitHub PATs) stay valid; new columns are nullable.
-- OAuth rows (kind='oauth_token') populate all four; api_key rows leave them null.

alter table public.external_accounts
  add column refresh_ciphertext bytea,
  add column refresh_iv bytea,
  add column refresh_tag bytea,
  add column expires_at timestamptz,
  add column granted_scopes text[];

comment on column public.external_accounts.refresh_ciphertext is
  'OAuth refresh token, AES-256-GCM. Null for api_key rows.';
comment on column public.external_accounts.expires_at is
  'OAuth access-token expiry. Refresh hook trips when this passes.';
comment on column public.external_accounts.granted_scopes is
  'Scopes the user actually granted (Google may grant fewer than requested).';

notify pgrst, 'reload schema';
```

**Step 2: Apply via Supabase MCP**

Use the `apply_migration` tool. Verify with: SELECT column_name FROM information_schema.columns WHERE table_name='external_accounts' AND column_name LIKE 'refresh_%';

Expected: 3 rows (refresh_ciphertext, refresh_iv, refresh_tag).

**Step 3: Commit**

```bash
git add apps/dashboard/supabase/migrations/0040_external_accounts_oauth.sql
git commit -m "feat(phase-k): migration 0040 — OAuth columns on external_accounts"
```

---

### Task 2: Migration 0041 — oauth_state_nonces table

**Files:**
- Create: `apps/dashboard/supabase/migrations/0041_oauth_state_nonces.sql`

**Step 1: Write the migration**

```sql
-- Phase K install-flow: single-use CSRF nonces for OAuth state.
-- Each /library/install/google action inserts a nonce; the callback consumes
-- (deletes) it. Mismatch / missing / expired = reject. Service-role only.

create table public.oauth_state_nonces (
  nonce uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  actor_user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null,
  scopes text[] not null,
  redirect_url text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  consumed_at timestamptz
);

create index oauth_state_nonces_expires_idx on public.oauth_state_nonces(expires_at);

alter table public.oauth_state_nonces enable row level security;
-- No member policies: service-role writes from server actions; no client access.

comment on table public.oauth_state_nonces is
  'Single-use OAuth state nonces. Service-role only. See lib/connectors/oauth-state.ts.';

notify pgrst, 'reload schema';
```

**Step 2: Apply via Supabase MCP**

Verify: `SELECT count(*) FROM pg_tables WHERE tablename='oauth_state_nonces';` → 1.

**Step 3: Commit**

```bash
git add apps/dashboard/supabase/migrations/0041_oauth_state_nonces.sql
git commit -m "feat(phase-k): migration 0041 — oauth_state_nonces table"
```

---

### Task 3: Migration 0042 — install_connector_atomic RPC

**Files:**
- Create: `apps/dashboard/supabase/migrations/0042_install_connector_atomic.sql`

**Step 1: Write the migration**

```sql
-- Phase K install-flow: transactional connector install.
-- Revokes any prior active external_accounts row for (tenant, provider_id, kind),
-- inserts the new ciphertext, then upserts tenant_connectors. All in one tx so
-- partial failure can't leave orphan rows.
--
-- For Google bundle (gmail + drive from one consent), call this once per scope.
-- Each call is its own tx; the callback should call them sequentially and, if
-- the second fails, the first stays installed (idempotent reinstall on retry).

create or replace function public.install_connector_atomic(
  p_tenant_id          uuid,
  p_actor_user_id      uuid,
  p_connector_id       text,
  p_provider_id        text,
  p_kind               public.external_account_kind,
  p_secret_ciphertext  bytea,
  p_secret_iv          bytea,
  p_secret_tag         bytea,
  p_refresh_ciphertext bytea,
  p_refresh_iv         bytea,
  p_refresh_tag        bytea,
  p_expires_at         timestamptz,
  p_granted_scopes     text[],
  p_display_hint       text,
  p_mapping            jsonb
) returns table (external_account_id uuid, tenant_connector_id uuid)
language plpgsql security definer set search_path = public
as $$
declare
  v_ext_id   uuid;
  v_conn_id  uuid;
begin
  -- Caller-side admin check still required; this function trusts its inputs.
  -- 1. Revoke prior active external_accounts row in the same slot.
  update public.external_accounts
    set status = 'revoked', revoked_at = now()
    where tenant_id = p_tenant_id
      and provider_id = p_provider_id
      and kind = p_kind
      and status = 'active';

  -- 2. Insert the new ciphertext.
  insert into public.external_accounts (
    tenant_id, provider_id, kind,
    secret_ciphertext, secret_iv, secret_tag,
    refresh_ciphertext, refresh_iv, refresh_tag,
    expires_at, granted_scopes, display_hint,
    status, created_by
  ) values (
    p_tenant_id, p_provider_id, p_kind,
    p_secret_ciphertext, p_secret_iv, p_secret_tag,
    p_refresh_ciphertext, p_refresh_iv, p_refresh_tag,
    p_expires_at, p_granted_scopes, p_display_hint,
    'active', p_actor_user_id
  ) returning id into v_ext_id;

  -- 3. Upsert tenant_connectors.
  -- The unique index on (tenant_id, connector_id) WHERE last_sync_status !=
  -- 'uninstalled' means we either re-point an existing row or insert fresh.
  insert into public.tenant_connectors (
    tenant_id, connector_id, external_account_id, mapping, installed_by
  ) values (
    p_tenant_id, p_connector_id, v_ext_id, p_mapping, p_actor_user_id
  )
  on conflict (tenant_id, connector_id) where last_sync_status != 'uninstalled'
  do update set
    external_account_id = excluded.external_account_id,
    mapping = excluded.mapping,
    updated_at = now()
  returning id into v_conn_id;

  return query select v_ext_id, v_conn_id;
end;
$$;

grant execute on function public.install_connector_atomic(
  uuid, uuid, text, text, public.external_account_kind,
  bytea, bytea, bytea, bytea, bytea, bytea,
  timestamptz, text[], text, jsonb
) to authenticated;

notify pgrst, 'reload schema';
```

**Step 2: Apply via Supabase MCP**

Verify: `SELECT pg_get_functiondef('public.install_connector_atomic'::regproc);` returns the function body.

**Step 3: Commit**

```bash
git add apps/dashboard/supabase/migrations/0042_install_connector_atomic.sql
git commit -m "feat(phase-k): migration 0042 — install_connector_atomic RPC"
```

---

## Phase K.2 — HMAC OAuth state (4 tasks)

### Task 4: Add BBC_OAUTH_STATE_SECRET env var

**Files:**
- Modify: `apps/dashboard/.env.example`
- Modify: `apps/dashboard/wrangler.toml` (comment block listing env vars)
- Modify: `apps/dashboard/CLAUDE.md` env table

**Step 1: Add to .env.example**

```bash
# OAuth state HMAC signing — generate with `openssl rand -base64 32`
# REQUIRED if any OAuth connector (gmail, drive) is installed. Empty/unset
# causes /api/oauth/* routes to refuse to boot (Cloudflare unset env = "").
BBC_OAUTH_STATE_SECRET=
```

**Step 2: Mirror in wrangler.toml comments + apps/dashboard/CLAUDE.md env table**

**Step 3: Commit**

```bash
git add apps/dashboard/.env.example apps/dashboard/wrangler.toml apps/dashboard/CLAUDE.md
git commit -m "feat(phase-k): document BBC_OAUTH_STATE_SECRET env var"
```

---

### Task 5: signOAuthState / verifyOAuthState — write the failing test

**Files:**
- Create: `apps/dashboard/src/lib/connectors/oauth-state.test.ts`

**Step 1: Write the test**

```ts
import { describe, it, expect, beforeEach, vi } from "vitest";

const SECRET = Buffer.from("0".repeat(32)).toString("base64"); // 32 bytes b64

beforeEach(() => {
  vi.stubEnv("BBC_OAUTH_STATE_SECRET", SECRET);
});

describe("signOAuthState / verifyOAuthState", () => {
  it("round-trips a valid state", async () => {
    const { signOAuthState, verifyOAuthState } = await import("./oauth-state");
    const payload = {
      tenant_id: "t-1",
      actor_user_id: "u-1",
      provider: "google",
      scopes: ["gmail", "drive"],
      nonce: "11111111-1111-1111-1111-111111111111",
      expires_at_ms: Date.now() + 60_000,
    };
    const signed = signOAuthState(payload);
    const out = verifyOAuthState(signed, Date.now());
    expect(out).toEqual(payload);
  });

  it("rejects a tampered payload", async () => {
    const { signOAuthState, verifyOAuthState } = await import("./oauth-state");
    const signed = signOAuthState({
      tenant_id: "t-1", actor_user_id: "u-1", provider: "google",
      scopes: ["gmail"], nonce: "x", expires_at_ms: Date.now() + 60_000,
    });
    // flip a byte in the payload (left of the `.`)
    const [payload, sig] = signed.split(".");
    const tampered = payload.slice(0, -1) + (payload.at(-1) === "A" ? "B" : "A") + "." + sig;
    expect(verifyOAuthState(tampered, Date.now())).toBeNull();
  });

  it("rejects an expired state", async () => {
    const { signOAuthState, verifyOAuthState } = await import("./oauth-state");
    const signed = signOAuthState({
      tenant_id: "t-1", actor_user_id: "u-1", provider: "google",
      scopes: ["gmail"], nonce: "x", expires_at_ms: Date.now() - 1,
    });
    expect(verifyOAuthState(signed, Date.now())).toBeNull();
  });

  it("throws if BBC_OAUTH_STATE_SECRET is empty", async () => {
    vi.stubEnv("BBC_OAUTH_STATE_SECRET", "");
    vi.resetModules();
    const { signOAuthState } = await import("./oauth-state");
    expect(() => signOAuthState({
      tenant_id: "t-1", actor_user_id: "u-1", provider: "google",
      scopes: [], nonce: "x", expires_at_ms: Date.now() + 60_000,
    })).toThrow(/BBC_OAUTH_STATE_SECRET/);
  });
});
```

**Step 2: Run — expect failure**

`pnpm --filter @bbc/dashboard test oauth-state` → FAIL (module not found).

**Step 3: Commit**

```bash
git add apps/dashboard/src/lib/connectors/oauth-state.test.ts
git commit -m "test(phase-k): failing tests for signOAuthState / verifyOAuthState"
```

---

### Task 6: signOAuthState / verifyOAuthState — implementation

**Files:**
- Create: `apps/dashboard/src/lib/connectors/oauth-state.ts`

**Step 1: Write the implementation**

```ts
// OAuth state — HMAC-signed payload + single-use nonce. Codex finding #2.
// Plaintext state from the previous design (buildOAuthState in google-oauth.ts)
// is unsigned and CSRF-vulnerable; this replaces it for the install callback path.

import { createHmac, timingSafeEqual } from "node:crypto";

export type OAuthStatePayload = {
  tenant_id: string;
  actor_user_id: string;
  provider: string;          // "google" (future: "notion" / "linear")
  scopes: string[];          // ["gmail","drive"] or single
  nonce: string;             // uuid; row in oauth_state_nonces
  expires_at_ms: number;     // ms epoch; default lifetime = 5 min
};

function loadSecret(): Buffer {
  const b64 = process.env.BBC_OAUTH_STATE_SECRET;
  if (!b64 || b64.length === 0) {
    throw new Error("BBC_OAUTH_STATE_SECRET is not set. Generate one with `openssl rand -base64 32`.");
  }
  const raw = Buffer.from(b64, "base64");
  if (raw.length < 32) {
    throw new Error(`BBC_OAUTH_STATE_SECRET must decode to >=32 bytes (got ${raw.length}).`);
  }
  return raw;
}

function b64url(buf: Buffer): string {
  return buf.toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
}
function b64urlDecode(s: string): Buffer {
  const padded = s.replace(/-/g, "+").replace(/_/g, "/") + "==".slice((s.length + 3) % 4);
  return Buffer.from(padded, "base64");
}

export function signOAuthState(payload: OAuthStatePayload): string {
  const key = loadSecret();
  const json = Buffer.from(JSON.stringify(payload), "utf8");
  const sig = createHmac("sha256", key).update(json).digest();
  return `${b64url(json)}.${b64url(sig)}`;
}

export function verifyOAuthState(signed: string, nowMs: number): OAuthStatePayload | null {
  if (typeof signed !== "string" || !signed.includes(".")) return null;
  const [payloadPart, sigPart] = signed.split(".");
  if (!payloadPart || !sigPart) return null;

  let payloadBytes: Buffer, sigBytes: Buffer;
  try {
    payloadBytes = b64urlDecode(payloadPart);
    sigBytes = b64urlDecode(sigPart);
  } catch { return null; }

  const key = loadSecret();
  const expected = createHmac("sha256", key).update(payloadBytes).digest();
  if (expected.length !== sigBytes.length) return null;
  if (!timingSafeEqual(expected, sigBytes)) return null;

  let payload: OAuthStatePayload;
  try { payload = JSON.parse(payloadBytes.toString("utf8")) as OAuthStatePayload; }
  catch { return null; }

  if (!payload || typeof payload !== "object") return null;
  if (typeof payload.expires_at_ms !== "number" || payload.expires_at_ms <= nowMs) return null;
  if (!payload.tenant_id || !payload.actor_user_id || !payload.provider || !payload.nonce) return null;
  if (!Array.isArray(payload.scopes)) return null;

  return payload;
}
```

**Step 2: Run test — expect pass**

`pnpm --filter @bbc/dashboard test oauth-state` → PASS (4 tests).

**Step 3: Commit**

```bash
git add apps/dashboard/src/lib/connectors/oauth-state.ts
git commit -m "feat(phase-k): HMAC-signed OAuth state helpers"
```

---

### Task 7: Nonce store helpers (record + consume)

**Files:**
- Create: `apps/dashboard/src/lib/connectors/oauth-nonce.ts`
- Create: `apps/dashboard/src/lib/connectors/oauth-nonce.test.ts`

**Step 1: Write failing test**

```ts
import { describe, it, expect, vi } from "vitest";
import { recordNonce, consumeNonce } from "./oauth-nonce";

const mkClient = (rows: any[] = []) => {
  const calls: any[] = [];
  const client: any = {
    from: () => ({
      insert: (r: any) => { calls.push({ op: "insert", row: r }); return { error: null }; },
      delete: () => ({ eq: (col: string, val: any) => {
        calls.push({ op: "delete", col, val });
        const found = rows.find((r) => r[col] === val);
        return { select: () => ({ single: async () => ({ data: found ?? null, error: null }) }) };
      } }),
    }),
    _calls: calls,
  };
  return client;
};

describe("oauth-nonce", () => {
  it("recordNonce inserts a row with expires_at in the future", async () => {
    const client = mkClient();
    await recordNonce(client, {
      nonce: "n-1", tenant_id: "t-1", actor_user_id: "u-1",
      provider: "google", scopes: ["gmail"], redirect_url: "/library?installed=gmail",
      ttl_seconds: 300,
    });
    expect(client._calls[0].op).toBe("insert");
    expect(client._calls[0].row.nonce).toBe("n-1");
  });

  it("consumeNonce returns the row when present and deletes it", async () => {
    const client = mkClient([{ nonce: "n-1", tenant_id: "t-1" }]);
    const out = await consumeNonce(client, "n-1");
    expect(out?.tenant_id).toBe("t-1");
  });

  it("consumeNonce returns null when nonce is missing", async () => {
    const client = mkClient([]);
    const out = await consumeNonce(client, "missing");
    expect(out).toBeNull();
  });
});
```

`pnpm --filter @bbc/dashboard test oauth-nonce` → FAIL.

**Step 2: Implementation**

```ts
// oauth-nonce.ts — record + consume single-use OAuth state nonces.
// Consume deletes the row in a single statement so a second consume returns null.

type NonceRow = {
  nonce: string; tenant_id: string; actor_user_id: string;
  provider: string; scopes: string[]; redirect_url: string;
};

type AnyClient = any;

export async function recordNonce(client: AnyClient, input: NonceRow & { ttl_seconds: number }): Promise<void> {
  const expires_at = new Date(Date.now() + input.ttl_seconds * 1000).toISOString();
  const { error } = await client.from("oauth_state_nonces").insert({
    nonce: input.nonce,
    tenant_id: input.tenant_id,
    actor_user_id: input.actor_user_id,
    provider: input.provider,
    scopes: input.scopes,
    redirect_url: input.redirect_url,
    expires_at,
  });
  if (error) throw new Error(`recordNonce: ${error.message ?? "unknown"}`);
}

export async function consumeNonce(client: AnyClient, nonce: string): Promise<NonceRow | null> {
  const { data, error } = await client
    .from("oauth_state_nonces")
    .delete()
    .eq("nonce", nonce)
    .select()
    .single();
  if (error) return null;
  return (data as NonceRow | null) ?? null;
}
```

`pnpm --filter @bbc/dashboard test oauth-nonce` → PASS.

**Step 3: Commit**

```bash
git add apps/dashboard/src/lib/connectors/oauth-nonce.ts apps/dashboard/src/lib/connectors/oauth-nonce.test.ts
git commit -m "feat(phase-k): oauth nonce store (record + consume, single-use)"
```

---

## Phase K.3 — GitHub PAT install (5 tasks)

### Task 8: GitHub PAT live-validation helper — test first

**Files:**
- Create: `apps/dashboard/src/lib/connectors/github-validate.ts`
- Create: `apps/dashboard/src/lib/connectors/github-validate.test.ts`

**Step 1: Write failing test**

```ts
import { describe, it, expect } from "vitest";
import { validatePatLive } from "./github-validate";

const mockFetch = (status: number, body: any = {}) => async () => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
  text: async () => JSON.stringify(body),
  headers: { get: () => null },
});

describe("validatePatLive", () => {
  it("returns ok with login on 200", async () => {
    const r = await validatePatLive("ghp_xxx", mockFetch(200, { login: "octocat" }));
    expect(r).toEqual({ ok: true, login: "octocat" });
  });
  it("returns invalid_token on 401", async () => {
    const r = await validatePatLive("bad", mockFetch(401));
    expect(r).toEqual({ ok: false, reason: "invalid_token" });
  });
  it("returns insufficient_scope on 403", async () => {
    const r = await validatePatLive("partial", mockFetch(403));
    expect(r).toEqual({ ok: false, reason: "insufficient_scope" });
  });
  it("returns network on transport error", async () => {
    const r = await validatePatLive("any", async () => { throw new Error("net"); });
    expect(r.ok).toBe(false);
  });
});
```

`pnpm --filter @bbc/dashboard test github-validate` → FAIL.

**Step 2: Implementation**

```ts
type Fetcher = (url: string, init?: any) => Promise<{ ok: boolean; status: number; json: () => Promise<any>; text: () => Promise<string>; headers: { get: (k: string) => string | null } }>;

export async function validatePatLive(
  pat: string,
  fetchImpl: Fetcher = globalThis.fetch as any,
): Promise<{ ok: true; login: string } | { ok: false; reason: "invalid_token" | "insufficient_scope" | "network" | "unknown" }> {
  try {
    const res = await fetchImpl("https://api.github.com/user", {
      headers: { Authorization: `Bearer ${pat}`, Accept: "application/vnd.github+json" },
    });
    if (res.status === 401) return { ok: false, reason: "invalid_token" };
    if (res.status === 403) return { ok: false, reason: "insufficient_scope" };
    if (!res.ok) return { ok: false, reason: "unknown" };
    const body = (await res.json()) as { login?: string };
    return { ok: true, login: body.login ?? "unknown" };
  } catch {
    return { ok: false, reason: "network" };
  }
}
```

`pnpm --filter @bbc/dashboard test github-validate` → PASS. Commit.

```bash
git add apps/dashboard/src/lib/connectors/github-validate.ts apps/dashboard/src/lib/connectors/github-validate.test.ts
git commit -m "feat(phase-k): validatePatLive — ping GitHub /user before persist"
```

---

### Task 9: installGithubPat server action — test first

**Files:**
- Create: `apps/dashboard/src/app/library/install/_actions.test.ts`
- Create: `apps/dashboard/src/app/library/install/_actions.ts`

**Step 1: Write failing test**

Mock `requireActor`, `validatePatLive`, `encryptSecret`, the Supabase service client `.rpc("install_connector_atomic", …)`. Assert:
- Non-admin returns `{ ok: false, error: /admin/ }`
- Invalid PAT returns `{ ok: false, error: /token/ }`
- Happy path calls `encryptSecret(pat)` once, calls `rpc("install_connector_atomic", …)` with `p_kind = "api_key"`, `p_refresh_ciphertext = null`, and returns `{ ok: true, external_account_id, tenant_connector_id }`.
- PAT does NOT appear in any returned object.

Full test code: see `apps/dashboard/src/app/settings/keys/actions.test.ts` as the reference pattern; mirror it but mock `rpc` instead of `.insert`.

`pnpm --filter @bbc/dashboard test _actions` → FAIL.

**Step 2: Implementation skeleton**

```ts
"use server";

import { z } from "zod";
import { requireActor, requireRole } from "@/lib/auth/require-user";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { encryptSecret, makeDisplayHint } from "@/lib/secrets/encryption";
import { validatePatLive } from "@/lib/connectors/github-validate";

const githubInput = z.object({
  pat: z.string().min(10).max(200),
  owner: z.string().min(1).max(100),
  repo: z.string().min(1).max(100),
});

export async function installGithubPat(formData: FormData) {
  const a = await requireActor();
  if (!a.ok) return { ok: false as const, error: a.output };
  const r = requireRole(a.actor, "admin");
  if (!r.ok) return { ok: false as const, error: r.output };

  const parsed = githubInput.safeParse({
    pat: formData.get("pat"),
    owner: formData.get("owner"),
    repo: formData.get("repo"),
  });
  if (!parsed.success) return { ok: false as const, error: "Invalid form input." };

  const live = await validatePatLive(parsed.data.pat);
  if (!live.ok) {
    return { ok: false as const, error:
      live.reason === "invalid_token" ? "GitHub rejected this token. Check it has not expired."
      : live.reason === "insufficient_scope" ? "Token lacks the repo scope."
      : "Could not reach GitHub. Try again." };
  }

  const enc = encryptSecret(parsed.data.pat);
  const sb = await getSupabaseServerClient();
  const { data, error } = await sb.rpc("install_connector_atomic", {
    p_tenant_id: a.actor.tenant_id,
    p_actor_user_id: a.actor.user_id,
    p_connector_id: "github",
    p_provider_id: "github",
    p_kind: "api_key",
    p_secret_ciphertext: enc.ciphertext,
    p_secret_iv: enc.iv,
    p_secret_tag: enc.tag,
    p_refresh_ciphertext: null,
    p_refresh_iv: null,
    p_refresh_tag: null,
    p_expires_at: null,
    p_granted_scopes: null,
    p_display_hint: makeDisplayHint(parsed.data.pat),
    p_mapping: { owner: parsed.data.owner, repo: parsed.data.repo },
  });
  if (error || !data || !data[0]) return { ok: false as const, error: error?.message ?? "Install failed." };

  return { ok: true as const, external_account_id: data[0].external_account_id, tenant_connector_id: data[0].tenant_connector_id };
}
```

`pnpm --filter @bbc/dashboard test _actions` → PASS. Commit.

```bash
git add apps/dashboard/src/app/library/install/_actions.ts apps/dashboard/src/app/library/install/_actions.test.ts
git commit -m "feat(phase-k): installGithubPat server action"
```

---

### Task 10: /library/install/github route + form UI

**Files:**
- Create: `apps/dashboard/src/app/library/install/[connector_id]/page.tsx`
- Create: `apps/dashboard/src/app/library/install/[connector_id]/_components/GithubPatForm.tsx`

**Step 1: Route page (server component, file-mode aware)**

```tsx
import { notFound } from "next/navigation";
import { getStore } from "@/lib/store";
import { GithubPatForm } from "./_components/GithubPatForm";
import { NotAvailableInFileMode } from "@/components/NotAvailableInFileMode";

export const dynamic = "force-dynamic";

const SUPPORTED: Record<string, true> = { github: true, google: true };

export default async function InstallPage({ params }: { params: Promise<{ connector_id: string }> }) {
  const { connector_id } = await params;
  if (!SUPPORTED[connector_id]) notFound();

  const store = await getStore();
  if (store.mode === "file") return <NotAvailableInFileMode feature="Install" />;

  if (connector_id === "github") return <GithubPatForm />;
  if (connector_id === "google") {
    // delegated to Task 14
    return null;
  }
  return null;
}
```

**Step 2: GithubPatForm**

Render an `<form action={installGithubPat}>` with three inputs: pat (type=password), owner, repo. On submit, the action returns; client component reads result via `useFormState`. On `ok: true`, `router.push("/library?installed=github")`. On `ok: false`, render error.

**Step 3: Manual sanity** — `pnpm --filter @bbc/dashboard dev`, visit `/library/install/github`, paste a real PAT, observe install.

**Step 4: Commit**

```bash
git add apps/dashboard/src/app/library/install/
git commit -m "feat(phase-k): /library/install/github route + PAT form"
```

---

### Task 11: Integration test — full GitHub PAT install path

**Files:**
- Create: `apps/dashboard/src/app/library/install/_actions.integration.test.ts`

Use Supabase MCP to point at a branch. Test:
- Call `installGithubPat` with a valid mock PAT (mocked `validatePatLive`).
- Query `external_accounts` for `(tenant, "github", "api_key", status="active")` → 1 row.
- Query `tenant_connectors` for `(tenant, "github")` → 1 row pointing at the external_account_id.
- Call again with new mapping → revoke + reinsert; still 1 active external_account row, 1 tenant_connector row with updated mapping.

`pnpm --filter @bbc/dashboard test _actions.integration` → PASS. Commit.

---

### Task 12: Cloudflare env guard for /api/oauth/*

**Files:**
- Create: `apps/dashboard/src/lib/connectors/oauth-env-guard.ts`

Util used by callback handler at module top: throws fast if `BBC_OAUTH_STATE_SECRET` is empty (Cloudflare unset = `""` per memory). Returns secret length 0 → throw.

Wire into Task 16 callback module. Commit.

---

## Phase K.4 — Google OAuth install (4 tasks)

### Task 13: startGoogleOAuth server action — test first

**Files:**
- Modify: `apps/dashboard/src/app/library/install/_actions.ts` (add export)
- Modify: `apps/dashboard/src/app/library/install/_actions.test.ts`

**Step 1: Failing test** — admin gate, builds correct authorize URL (includes `client_id`, `scopes`, `state`), records nonce row, throws if `BBC_GOOGLE_OAUTH_CLIENT_ID` unset.

**Step 2: Implementation**

```ts
export async function startGoogleOAuth(formData: FormData) {
  const a = await requireActor();
  if (!a.ok) return { ok: false as const, error: a.output };
  const r = requireRole(a.actor, "admin");
  if (!r.ok) return { ok: false as const, error: r.output };

  const clientId = process.env.BBC_GOOGLE_OAUTH_CLIENT_ID;
  if (!clientId) return { ok: false as const, error: "Google OAuth not configured on this server." };

  const nonce = crypto.randomUUID();
  const scopes = ["gmail", "drive"];
  const expires_at_ms = Date.now() + 5 * 60 * 1000;
  const redirect_url = "/library?installed=gmail,drive";

  const sb = await getServiceRoleClient();
  await recordNonce(sb, {
    nonce, tenant_id: a.actor.tenant_id, actor_user_id: a.actor.user_id,
    provider: "google", scopes, redirect_url, ttl_seconds: 300,
  });

  const state = signOAuthState({
    tenant_id: a.actor.tenant_id, actor_user_id: a.actor.user_id,
    provider: "google", scopes, nonce, expires_at_ms,
  });

  const authorizeUrl = buildAuthorizeUrl({
    clientId,
    redirectUri: `${process.env.BBC_PUBLIC_URL}/api/oauth/google/callback`,
    scopes: [...GMAIL_SCOPES, ...DRIVE_SCOPES],
    state,
  });

  redirect(authorizeUrl); // next/navigation
}
```

Test PASS. Commit.

---

### Task 14: /library/install/google route — render "Connect Google" button

**Files:**
- Modify: `apps/dashboard/src/app/library/install/[connector_id]/page.tsx`
- Create: `apps/dashboard/src/app/library/install/[connector_id]/_components/GoogleConsentLauncher.tsx`

Server component branch for `connector_id === "google"` renders a single button form that posts to `startGoogleOAuth`. Show consent-screen warning + "Google verification beta" pill if `isGoogleAppVerified()` is false. Commit.

---

### Task 15: /api/oauth/google/callback handler — test first

**Files:**
- Create: `apps/dashboard/src/app/api/oauth/google/callback/route.test.ts`
- Create: `apps/dashboard/src/app/api/oauth/google/callback/route.ts`

**Step 1: Failing test** — covers:
- Missing state → 400
- Tampered state → 400
- Expired state → 400
- Nonce reused (second call same nonce) → 400
- `error=access_denied` query → 302 to `/library?install_error=denied`
- Happy path: stubs `exchangeCodeForTokens` to return tokens; mocks `rpc("install_connector_atomic")` twice (gmail then drive); asserts 302 to `/library?installed=gmail,drive`.
- Authenticated actor at callback differs from state's actor_user_id → 400.

**Step 2: Implementation**

```ts
import { NextRequest, NextResponse } from "next/server";
import { exchangeCodeForTokens } from "@/lib/connectors/google-oauth";
import { verifyOAuthState } from "@/lib/connectors/oauth-state";
import { consumeNonce } from "@/lib/connectors/oauth-nonce";
import { encryptSecret, makeDisplayHint } from "@/lib/secrets/encryption";
import { requireActor } from "@/lib/auth/require-user";
import { getServiceRoleClient } from "@/lib/supabase/service";
import { assertOAuthEnv } from "@/lib/connectors/oauth-env-guard";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  assertOAuthEnv(); // throws if env unset

  const code = req.nextUrl.searchParams.get("code");
  const stateRaw = req.nextUrl.searchParams.get("state");
  const errParam = req.nextUrl.searchParams.get("error");

  if (errParam) return NextResponse.redirect(new URL(`/library?install_error=${errParam}`, req.url));
  if (!code || !stateRaw) return NextResponse.redirect(new URL("/library?install_error=missing_params", req.url));

  const payload = verifyOAuthState(stateRaw, Date.now());
  if (!payload) return NextResponse.redirect(new URL("/library?install_error=state_invalid", req.url));

  const actor = await requireActor();
  if (!actor.ok || actor.actor.user_id !== payload.actor_user_id) {
    return NextResponse.redirect(new URL("/library?install_error=actor_mismatch", req.url));
  }

  const sb = await getServiceRoleClient();
  const used = await consumeNonce(sb, payload.nonce);
  if (!used) return NextResponse.redirect(new URL("/library?install_error=state_reused", req.url));

  // Exchange code
  let tokens;
  try {
    tokens = await exchangeCodeForTokens({
      code,
      clientId: process.env.BBC_GOOGLE_OAUTH_CLIENT_ID!,
      clientSecret: process.env.BBC_GOOGLE_OAUTH_CLIENT_SECRET!,
      redirectUri: `${process.env.BBC_PUBLIC_URL}/api/oauth/google/callback`,
    });
  } catch (e: any) {
    return NextResponse.redirect(new URL(`/library?install_error=token_exchange&detail=${encodeURIComponent(e?.message?.slice(0, 100) ?? "")}`, req.url));
  }

  const access = encryptSecret(tokens.access_token);
  const refresh = tokens.refresh_token ? encryptSecret(tokens.refresh_token) : null;
  const expires_at = new Date(Date.now() + (tokens.expires_in ?? 3600) * 1000).toISOString();
  const grantedScopes = tokens.scope.split(" ");

  // Install gmail + drive — two separate external_accounts rows per codex #3.
  for (const scope of payload.scopes) {
    const { error } = await sb.rpc("install_connector_atomic", {
      p_tenant_id: payload.tenant_id,
      p_actor_user_id: payload.actor_user_id,
      p_connector_id: scope,                // "gmail" or "drive"
      p_provider_id: scope,                 // same as connector for google.* connectors
      p_kind: "oauth_token",
      p_secret_ciphertext: access.ciphertext,
      p_secret_iv: access.iv,
      p_secret_tag: access.tag,
      p_refresh_ciphertext: refresh?.ciphertext ?? null,
      p_refresh_iv: refresh?.iv ?? null,
      p_refresh_tag: refresh?.tag ?? null,
      p_expires_at: expires_at,
      p_granted_scopes: grantedScopes,
      p_display_hint: "google",
      p_mapping: {},
    });
    if (error) {
      // Partial: the one we already installed stays (idempotent reinstall on retry).
      return NextResponse.redirect(new URL(`/library?install_error=install_failed&connector=${scope}`, req.url));
    }
  }

  return NextResponse.redirect(new URL("/library?installed=gmail,drive", req.url));
}
```

Test PASS. Commit.

---

### Task 16: Integration test — full Google OAuth install path

**Files:**
- Create: `apps/dashboard/src/app/api/oauth/google/callback/route.integration.test.ts`

Test with Supabase branch:
- Insert a nonce, sign matching state, hit the callback with code + state.
- Assert `external_accounts` has 2 active rows: `(tenant, "gmail", "oauth_token")` and `(tenant, "drive", "oauth_token")`.
- Assert `tenant_connectors` has 2 rows for `gmail` and `drive`.
- Re-run with a fresh nonce → still 2 active external_account rows (revoke + reinsert).
- Force the drive RPC to fail → gmail stays installed, redirect carries `install_error=install_failed&connector=drive`.

Commit.

---

## Phase K.5 — UI wiring (4 tasks)

### Task 17: Replace fake handleInstall in LibraryClient.tsx

**Files:**
- Modify: `apps/dashboard/src/app/library/_components/LibraryClient.tsx:135-138`

**Step 1: Change**

```tsx
function handleInstall(item: LibItem) {
  if (item.kind === "connector" && item.install_url) {
    router.push(item.install_url);
    return;
  }
  setInstallingId(item.id);
  window.setTimeout(() => setInstallingId(null), 1600); // fallback for items without install_url
}
```

Add `useRouter` import + call.

**Step 2: Manual click test** in dev. **Step 3: Commit.**

---

### Task 18: Patch _data.ts — flip flags for github, gmail, drive

**Files:**
- Modify: `apps/dashboard/src/app/library/_data.ts`

For the three connector entries, set:
- `install_url: "/library/install/github" | "/library/install/google"` (gmail + drive both point to `/google` per consent bundle)
- A new field on `ConnectorItem` shape if `installEnabled` is per-item; otherwise rely on Library page passing `installEnabled` based on this allowlist.

Don't replace anything else. Commit.

---

### Task 19: DetailDrawer reads tenant_connectors for "Installed" state

**Files:**
- Modify: `apps/dashboard/src/app/library/page.tsx` (server component) — read tenant_connectors via `readTenantConnectors()` (exists at `lib/connectors/read-tenant-connectors.ts`)
- Modify: `apps/dashboard/src/app/library/_components/DetailDrawer.tsx` — when the connector item id appears in `installed_connector_ids`, button label becomes "Reinstall" and a small "Installed <relative-time>" string renders.

Commit.

---

### Task 20: File-mode degradation final check

Manual: set `BBC_REPO` to a file-mode tenant, hit `/library/install/github`, see `NotAvailableInFileMode`. Add an assertion to `route.test.ts` mirror.

Commit if any change needed; otherwise note in the plan checklist.

---

## Phase K.6 — Docs + housekeeping (4 tasks)

### Task 21: Document Google test-users limit

**Files:**
- Modify: `memory/ops/providers/google.md` (or create if absent)

Add: "Google OAuth apps in 'testing' mode cap at 100 users until verified. Self-hosters: see Google Cloud Console > OAuth consent screen > Publishing status to submit. BBC sets `BBC_GOOGLE_OAUTH_VERIFIED=true` to flip the UI 'beta' pill."

Commit.

---

### Task 22: Update apps/dashboard/CLAUDE.md env table + wrangler.toml

Add three env vars:
- `BBC_OAUTH_STATE_SECRET` (required for OAuth callbacks)
- `BBC_GOOGLE_OAUTH_CLIENT_ID` (optional)
- `BBC_GOOGLE_OAUTH_CLIENT_SECRET` (optional)
- `BBC_PUBLIC_URL` (required when `BBC_GOOGLE_OAUTH_CLIENT_ID` is set)

Commit.

---

### Task 23: README quick start — OAuth setup section

**Files:**
- Modify: `apps/dashboard/README.md` (auth section)

Add a small block under "Auth": "Connector OAuth (optional). To enable Gmail/Drive install, register a Google OAuth app with redirect `<BBC_PUBLIC_URL>/api/oauth/google/callback`, then set the four env vars above. GitHub installs via PAT only — no OAuth app needed."

Commit.

---

### Task 24: Smoke-test report + open PR

**Files:**
- Create: `docs/plans/2026-05-17-phase-k-smoke-test-report.md`

Manual end-to-end:
1. Set env vars in `.env.local`
2. `pnpm --filter @bbc/dashboard dev`
3. /library → click Install on GitHub → paste PAT → see "Installed"
4. /library → click Install on Gmail → consent → see "Installed" on gmail AND drive
5. Reinstall Gmail → no error, single active row in DB
6. Bad PAT → error message rendered
7. File-mode tenant → `<NotAvailableInFileMode>` rendered
8. Capture screenshots in `docs/plans/2026-05-17-phase-k-smoke-test-report.md`

Open PR with `gh pr create` (stack on `feat/ops-page` PR #23). Title: `feat(phase-k): real install flow for GitHub PAT + Google OAuth`. Body cites this plan, the design doc, and the 8 codex findings table.

---

## Definition of Done

- All migrations applied to Supabase
- All unit tests green (`pnpm --filter @bbc/dashboard test`)
- Both integration tests green
- Manual smoke screenshots committed
- Type check clean (`pnpm --filter @bbc/dashboard type-check`)
- PR opened and linked to PR #23 (stacked)
- Codex re-review of the diff (`/codex review`) passes (GATE: PASS)
- README + CLAUDE.md updated
- Memory entry `project-phase-k-install-shipped.md` saved on user request after merge

---

## Out of scope reminders (don't drift)

- No Notion / Linear install flows
- No skill install flow
- No disconnect / reconnect UI
- No connection-health dashboard
- No token-refresh cron (connectors trip auth-expired and surface in /ops)
- No webhook subscription setup
- No new connector
