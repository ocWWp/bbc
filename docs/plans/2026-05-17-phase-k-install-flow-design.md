# Phase K — install-flow design (post-codex review)

**Branch:** `feat/phase-k-install` (stacked on `feat/ops-page` / PR #23)
**Status:** design approved, ready to plan
**Codex review:** 8 findings applied; see "Revisions from codex review" at bottom

## Goal

An admin can click "Install" on the GitHub or Google entry in `/library`, complete a real flow, and the connector starts producing memory proposals. After this PR, the install pipeline (`/library` → `/library/install/[id]` → server action → `external_accounts` row → `tenant_connectors` row → sync schedule) is real for three connectors: **github**, **gmail**, **drive**.

Notion/Linear stay disabled. Connector code already exists; this PR builds the install rails around them.

## Scope (IN)

1. **Schema migration** — `external_accounts` gains the columns OAuth actually needs:
   - `access_secret_ciphertext`, `refresh_secret_ciphertext`, `expires_at`, `key_version`
   - Backfill: existing rows (LLM keys, GitHub PATs) keep working via `secret_ciphertext` (legacy column kept; helpers prefer the new fields when present).
2. **Signed OAuth state** — rewrite `buildOAuthState()` / `parseOAuthState()` in `lib/connectors/google-oauth.ts` to be HMAC-signed, scoped to `(tenant_id, actor_user_id, redirect_url)`, single-use (nonce stored in cache table), 5-minute expiry.
3. **`/library/install/[connector_id]`** route — server component that renders the right install UI:
   - `github` → `<GithubPatForm/>` (paste-PAT, validate via GitHub `/user`, then call `installGithubPat()`)
   - `google` → server action `startGoogleOAuth()` that builds the OAuth URL with signed state and `redirect()`s to Google
4. **`/api/oauth/google/callback`** — verify state, exchange code, encrypt access+refresh, insert **two separate** `external_accounts` rows (one per scope: gmail, drive), then `installConnector()` twice. Idempotent via upsert.
5. **Real `handleInstall`** — replace the `setTimeout` fake in `_components/LibraryClient.tsx:135` with a router push to `/library/install/[id]`.
6. **Patch fixture catalog** — in `_data.ts`, set `installEnabled: true` and `install_url: "/library/install/<id>"` for github/gmail/drive only. **Don't replace** the catalog (codex finding #6: `mergeConnectorState` already merges real state).
7. **Idempotent install adapter** — wrap `installConnector()` calls in a Supabase adapter that:
   - Upserts on `(tenant_id, provider_id, kind)` for `external_accounts`
   - Upserts on `(tenant_id, connector_id)` for `tenant_connectors` (active rows)
   - Runs both inserts in a single transaction (Postgres function or `rpc`)
8. **Install state in DetailDrawer** — read `tenant_connectors` for the current tenant; show "Installed" / "Reinstall" instead of "Install" when the row exists.
9. **File-mode degradation** — `/library/install/[id]` renders `<NotAvailable mode="file"/>` honestly when `getStore()` reports file-mode (per `feedback_bbc_mode_duality`).

## Scope (OUT — deferred)

- Notion / Linear install flows
- Skill install flow (different lifecycle, no `installConnector` analog)
- Disconnect / reconnect UI (separate /ops follow-up)
- Connection-health dashboard (separate /ops follow-up)
- Token refresh path (Phase K.2: scheduled cron + retry on 401)
- Webhook subscription setup post-install (Phase K.3)

## Architecture

```
/library  (admin clicks Install)
   ↓  router push (real, not fake)
/library/install/[connector_id]
   │
   ├─ github  → <GithubPatForm/>  (server component)
   │     ↓ form action: installGithubPat(formData)
   │           ├─ requireRole(actor, "admin")
   │           ├─ validatePatLive(pat)  → GitHub /user 200 OK
   │           ├─ encrypt(pat) → upsert external_accounts row
   │           └─ installConnector(actor, {connector_id:"github", external_account_id})
   │     ↓ redirect /library?installed=github
   │
   └─ google  → server action startGoogleOAuth(formData{scopes:["gmail","drive"]})
         ├─ requireRole(actor, "admin")
         ├─ state = signState({tenant_id, actor_user_id, redirect_url, scopes, nonce})
         ├─ cache nonce → state_nonces table (single-use, 5 min TTL)
         └─ redirect → https://accounts.google.com/o/oauth2/v2/auth?...&state=<signed>
                ↓ Google consent
                ↓ /api/oauth/google/callback?code=...&state=<signed>
                     ├─ verifyState(state) → reject if expired / nonce-spent / actor-mismatch
                     ├─ exchangeCodeForTokens(code)
                     ├─ for each scope (gmail, drive):
                     │     ├─ encrypt(access_token, refresh_token, expires_at)
                     │     ├─ upsert external_accounts row (provider_id=google, kind=gmail|drive)
                     │     └─ installConnector(actor, {connector_id, external_account_id})
                     └─ redirect /library?installed=gmail,drive
```

## Data model

### Migration 0040: `external_accounts` OAuth columns

```sql
alter table public.external_accounts
  add column access_secret_ciphertext bytea,
  add column refresh_secret_ciphertext bytea,
  add column expires_at timestamptz,
  add column key_version smallint default 1;

-- legacy secret_ciphertext kept; new columns preferred by helpers
comment on column public.external_accounts.secret_ciphertext is
  'Legacy single-blob secret (LLM keys, GitHub PATs). New OAuth rows use access_* / refresh_* instead.';
```

### Migration 0041: `oauth_state_nonces` (single-use replay protection)

```sql
create table public.oauth_state_nonces (
  nonce uuid primary key,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  actor_user_id uuid not null,
  redirect_url text not null,
  scopes text[] not null,
  expires_at timestamptz not null,
  consumed_at timestamptz
);
create index oauth_state_nonces_expires_idx on public.oauth_state_nonces(expires_at);
-- RLS: service-role only (no member access)
```

### Migration 0042: idempotent install RPC

```sql
create or replace function public.install_connector_atomic(
  p_tenant_id uuid,
  p_actor_user_id uuid,
  p_connector_id text,
  p_provider_id text,
  p_kind text,
  p_access_ciphertext bytea,
  p_refresh_ciphertext bytea,
  p_expires_at timestamptz,
  p_mapping jsonb
) returns uuid as $$
declare ext_id uuid;
begin
  -- 1. upsert external_accounts (returns id)
  insert into external_accounts (tenant_id, provider_id, kind, access_secret_ciphertext,
                                 refresh_secret_ciphertext, expires_at, created_by)
    values (p_tenant_id, p_provider_id, p_kind, p_access_ciphertext,
            p_refresh_ciphertext, p_expires_at, p_actor_user_id)
    on conflict (tenant_id, provider_id, kind) where status = 'active'
    do update set access_secret_ciphertext = excluded.access_secret_ciphertext,
                  refresh_secret_ciphertext = excluded.refresh_secret_ciphertext,
                  expires_at = excluded.expires_at,
                  updated_at = now()
    returning id into ext_id;

  -- 2. upsert tenant_connectors
  insert into tenant_connectors (tenant_id, connector_id, external_account_id, mapping, installed_by)
    values (p_tenant_id, p_connector_id, ext_id, p_mapping, p_actor_user_id)
    on conflict (tenant_id, connector_id) where last_sync_status != 'uninstalled'
    do update set external_account_id = ext_id,
                  mapping = excluded.mapping,
                  updated_at = now();

  return ext_id;
end;
$$ language plpgsql security definer;
```

(Tightened RLS / function security details in the implementation plan.)

## Security

- **HMAC state signing.** `signState({...})` uses `BBC_OAUTH_STATE_SECRET` (new env var, `openssl rand -base64 32`). Format: `base64url(payload) + "." + hex(hmac-sha256(payload))`. Verification rejects on signature mismatch, expiry, nonce reuse, or actor mismatch (the authenticated user at callback must equal `payload.actor_user_id`).
- **Open-redirect protection.** Allowed `redirect_url` values are a fixed allowlist (`/library?installed=...`). Never echo unvalidated `redirect_url` from state into a real redirect.
- **Admin gate.** Both `/library/install/[id]` GET and the install server actions call `requireRole(actor, "admin")` before any side effect.
- **PAT scrubbing.** PAT never logged, never written to a non-encrypted column, never returned from server action. Test asserts plaintext PAT does not appear in `_log/` after install.
- **Key rotation readiness.** `key_version` column lets future rotation re-encrypt without schema churn. v0 always writes `key_version=1`.

## Error handling

| Failure | Behavior |
|---|---|
| PAT invalid (GitHub `/user` returns 401) | Render form again with "GitHub rejected this token" message. No DB write. |
| OAuth user denies consent | Google redirects with `error=access_denied`. Callback redirects `/library?install_error=denied&connector=google`. No DB write. |
| State HMAC mismatch | Reject 400 with `install_error=state_mismatch`. Log to `_log/oauth-error/<timestamp>.json` (tenant_id only, no secret). |
| State expired or nonce reused | Reject 400 with `install_error=state_expired`. Same logging. |
| Token exchange 5xx | Redirect `/library?install_error=token_exchange&connector=google`. No DB write. |
| `install_connector_atomic` raises | Redirect `/library?install_error=install_failed&detail=<safe message>`. Transaction rolls back, no orphan rows. |
| Re-install of already-installed connector | Idempotent: upsert refreshes ciphertext + mapping. UI shows "Reinstalled at <time>". |

No partial state: every error path either writes nothing (validation failures, denials) or rolls back atomically (install RPC).

## Testing

**Unit:**
- `signState` / `verifyState` — round-trip, tampered signature rejected, expired rejected, actor mismatch rejected, nonce reuse rejected
- `installGithubPat` — happy path, invalid PAT path, encryption call verified, RPC call args verified
- `startGoogleOAuth` — state contains correct payload, nonce persisted, redirect URL well-formed
- Google callback handler — happy path inserts both rows, denied path no-ops, state-mismatch path 400, scope-mismatch rejected

**Integration (Supabase test branch):**
- Full GitHub PAT install end-to-end: form submit → row in `external_accounts` → row in `tenant_connectors` → connector visible in `/library` as "Installed"
- Full Google OAuth install end-to-end: mock token exchange → two `external_accounts` rows → two `tenant_connectors` rows → /library shows both installed
- Re-install idempotency: install twice in a row, assert single active row per `(tenant_id, connector_id)`
- Atomic failure: force `installConnector("drive")` to fail → assert `gmail` row also absent (transaction rolled back)

**File-mode:**
- `/library/install/github` in file-mode → renders `<NotAvailable>`, no DB calls attempted

## Risks

- **Google "test users" mode** caps at 100 users until verified. Document in `memory/ops/providers/google.md` so self-hosters know.
- **`BBC_OAUTH_STATE_SECRET` deploy gate** — Cloudflare unset env returns empty string (per `feedback_cloudflare_env_vars_empty_string`); refuse to boot the OAuth route if the secret is empty.
- **Schema rollback** — new columns are nullable; legacy code path keeps working if migration is reverted, as long as no OAuth rows have been written.
- **Sync trigger after install** — out of v0 scope; first sync waits for the existing scheduled trigger. Document this so the install UX doesn't promise instant data.

## Revisions from codex review

| # | Codex finding | Original design | Revised design |
|---|---|---|---|
| 1 | `handleInstall` is fake | (Missed; assumed `installEnabled` flip was enough) | Real router push to `/library/install/[id]` + `handleInstall` rewrite in scope |
| 2 | `buildOAuthState` is plaintext | "Must be signed/scoped" (handwave) | HMAC + nonce + actor-binding + 5-min expiry spec'd above; `BBC_OAUTH_STATE_SECRET` env var |
| 3 | Google one-row decision contradicts existing code | One shared `external_accounts` row | **Two separate rows** (matches `google-oauth.ts:6`); also enables independent Gmail/Drive disconnect later |
| 4 | Schema too thin for OAuth | Reuse `secret_ciphertext` blob | Migration 0040 adds `access_secret_ciphertext`, `refresh_secret_ciphertext`, `expires_at`, `key_version` |
| 5 | Orphan rows from "leave row in place" | Leave row, retry | Idempotent upsert via `install_connector_atomic` RPC; no orphans possible |
| 6 | Don't replace fixture catalog | Replace `_data.ts` fixtures with real registry | Patch flags only; `mergeConnectorState` already does the work |
| 7 | Two-connector atomicity for Google | Sequential `installConnector` calls | Single transactional RPC `install_connector_atomic` per row, called once per scope |
| 8 | `installConnector()` is a stub | Use as-is | Wrap in Supabase adapter + transactional RPC with idempotent upsert |

## Open questions

None blocking. Implementation plan can be written.

## Next step

Hand to `superpowers:writing-plans` skill to produce `PLAN.md` with task breakdown.
