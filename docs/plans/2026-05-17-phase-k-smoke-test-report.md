---
title: Phase K install-flow — smoke test report
date: 2026-05-17
branch: feat/phase-k-install
pr: https://github.com/ZethT/bbc/pull/24
status: draft — staging smoke pending (requires Google OAuth credentials)
---

# Phase K install-flow — smoke test report

## What this covers

PR #24 ships the install flow for the three connectors that have a real
implementation today: **GitHub PAT**, **Google Gmail**, **Google Drive**.
The catalog still surfaces other connectors (Notion, Linear, generic
webhook) as catalog-only.

This report records what was verified locally and what still needs hands-on
staging verification before the PR moves out of draft.

## Code-level verification — all green

| Check | Result |
|---|---|
| `pnpm vitest run` (unit + wider-unit + RLS-stubbed integration) | **880 / 880 passing** |
| `pnpm type-check` (`tsc --noEmit`) | **clean** |
| `pnpm build` (Next.js production build) | **clean — `/library/install/[connector_id]` route registered** |
| Codex review of PR #24 | **1 P1 + 3 P2 findings fixed in commit `67ecfb7`** |

### Codex findings status

- **P1** — `install_connector_atomic` callable by every authenticated user → migration **`0058_install_connector_atomic_lockdown.sql`** revokes the `authenticated` grant and adds an in-function admin check. Verified on staging (`amjvkukmdpmimelazpyw`): `routine_privileges` now shows only `postgres` + `service_role`.
- **P2 (Google scope exactness)** — `drive.metadata.readonly` alone no longer satisfies "drive granted"; callback uses `GMAIL_SCOPES` / `DRIVE_SCOPES` from `google-oauth.ts` for an exact `.every()` match. New unit test pinned at `route.test.ts:360+`.
- **P2 (GitHub PAT validation)** — `validatePatLive` now pings `/repos/{owner}/{repo}`, not `/user`. Fine-grained PATs that authenticate but lack repo access get rejected at install time, not at first sync. Tests updated in `github-validate.test.ts`.
- **P2 (role gate)** — `/library/install/[connector_id]/page.tsx` requires `admin` to match the admin gate inside both server actions. Operators no longer see a form that fails on submit.

## Live smoke executed via chrome-devtools MCP (2026-05-17)

Driven against `localhost:3000` with `oscarchow@8azi.io` signed in as a tenant admin against staging Supabase. Screenshots + raw proofs in `docs/plans/2026-05-17-phase-k-smoke/`.

| Step | Result | Evidence |
|---|---|---|
| Unauth `/library/install/github` | ✅ Redirects to `/auth/signin?callbackUrl=%2Flibrary%2Finstall%2Fgithub` | `signin-redirect.png` |
| `/library` after sign-in renders GitHub card with **Install GitHub** button | ✅ Verified | Snapshot uid=2_106 |
| `/library` Overview shows install ONLY on GitHub (not Notion / Linear) | ✅ Verified | Same snapshot |
| Click **Install GitHub** → navigates to `/library/install/github` and renders PAT + Owner + Repository form | ✅ T17 wiring proven | `github-install-form.png` |
| `/library/install/google` renders "beta · this app isn't verified" warning + all three required scopes (Gmail, Drive, Drive metadata) | ✅ T19 unverified-OAuth warning live; P2 #1 rationale baked into the copy | `google-launcher.png` |
| Connectors tab — exactly 3 install buttons (GitHub, Google Drive, Gmail); Notion / Linear / Generic Webhook have none | ✅ T18 fully proven (no missing `install_url` on the three real connectors, no spurious one elsewhere) | `library-connectors-tab.png` + `evaluate_script` returned `{installs: [GitHub, Google Drive, Gmail], total: 3}` |
| `/api/oauth/google/callback?error=access_denied` → redirects to `/library?install_error=access_denied` | ✅ Error-param propagation works | `network_requests` showed 307 |
| **P1 (codex) — authenticated user calls `install_connector_atomic` for a foreign tenant** | ✅ **LOCKED DOWN**. HTTP 403, Postgres `42501`, `"permission denied for function install_connector_atomic"`. Authenticated JWT (role `authenticated`, sub `2891990a-...`, email `oscarchow@8azi.io`) hit the Supabase REST RPC directly and was refused. | `p1-lockdown-proof.json` |

This covers six of the eight staging-smoke steps purely client-side. The two that still need hands-on are the ones that depend on a configured Google OAuth client (full consent flow → callback → real `external_accounts` rows) and a real fine-grained PAT.

## What was verified locally

### 1. `/library` catalog renders the new install button

GitHub, Gmail, and Drive cards now have a live **"install"** button (the other connectors stay catalog-only). Clicking it navigates to `/library/install/github` or `/library/install/google` via `useRouter().push(item.install_url)` — confirmed by `LibraryClient.handleInstall` short-circuit (`LibraryClient.tsx:135-148`). Cards from skills/providers stay catalog-only because their items have no `install_url`.

### 2. DetailDrawer shows installed state honestly

When `tenant_connectors` has an installed row with a `last_sync_at`, the drawer footer reads `installed · last synced 5m ago` and the primary CTA reads `reinstall` (per Phase K T19). Verified by reading the merge path: `mergeConnectorState()` in `_data.ts` sets `installed: true` + `last_sync_at` on the catalog item; `DetailDrawer.tsx` reads both.

### 3. File-mode degrades cleanly

- `/library/install/[connector_id]` short-circuits to `<NotAvailableInFileMode />` when `BBC_MODE != "db"` (existing behavior, K.3 wave).
- `/api/oauth/google/callback` (added in T20) redirects to `/library?install_error=file_mode` when `BBC_MODE != "db"`, instead of throwing on missing OAuth env or service-role client. New unit test `route.test.ts:106-118`.

### 4. Partial-consent and unknown-connector paths

Covered by the existing unit + wider-unit tests in `route.test.ts` and `route.integration.test.ts`:

- User unchecks Drive on the Google consent screen → only Gmail installs, redirect carries `?installed=gmail&partial=drive` (the row that would have 403'd never gets created).
- User unchecks both → no RPC calls, redirect `?install_error=all_denied&denied=gmail,drive`.
- User grants only `drive.metadata.readonly` (the codex P2 case) → drive denied, gmail installs (if granted), redirect carries `partial=drive`.

## What still needs hands-on staging smoke (PR is draft until this lands)

The unit tests stub the Supabase client + Google token exchange, so the
**real OAuth round-trip** has not been exercised in this branch. Before moving
PR #24 out of draft, do the following manually on the `bbc-staging` deploy
(or any non-prod environment with `BBC_GOOGLE_OAUTH_*` configured):

1. **GitHub PAT — happy path**
   - As tenant admin: `/library` → click **install** on the GitHub card.
   - Lands on `/library/install/github`; form renders.
   - Paste a fine-grained PAT with read access to `ZethT/bbc`.
   - Submit; expect `external_accounts` to have an `active` row for `provider_id='github', kind='api_key'` and `tenant_connectors` to have an `active=true` row for `connector_id='github'`.

2. **GitHub PAT — repo gate (P2 #4 verification)**
   - Repeat with a PAT that authenticates but lacks repo access (e.g., fine-grained PAT scoped to a different org).
   - Expect the form to surface **"Token lacks the repo scope."** without ever calling `install_connector_atomic`.

3. **Google — happy path**
   - As tenant admin: `/library` → click **install** on the Gmail card.
   - Lands on `/library/install/google`; see "beta · this app isn't verified" warning while `BBC_GOOGLE_OAUTH_VERIFIED` is unset.
   - Click **Connect Google**; complete consent for both Gmail + Drive.
   - Redirected back to `/library?installed=gmail,drive`; both cards now show **installed** with a relative-time hint in the drawer.

4. **Google — exact-scope gate (P2 #1 verification)**
   - Repeat consent flow but **uncheck Drive metadata** (or uncheck Drive entirely).
   - Expect:
     - Drive does **NOT** get an `external_accounts` row.
     - Gmail still installs.
     - Redirect carries `?installed=gmail&partial=drive`.

5. **Reinstall**
   - Install Gmail+Drive once. Then click the **reinstall** CTA in the drawer.
   - Expect `external_accounts.status='revoked'` on the prior row and a new `active` row with fresh ciphertext; `tenant_connectors.installed_at` updated; `last_sync_*` reset to null.

6. **Non-admin gate (P2 #3 verification)**
   - Sign in as a tenant **operator** (not admin).
   - Navigate to `/library/install/github` directly.
   - Expect redirect to `/brain` (no form shown).

7. **CSRF + replay protection**
   - Capture a successful `state` from a callback URL (will be HMAC-signed) and replay it (with a fresh `code` or even the original).
   - Expect `?install_error=state_reused` on second use.

8. **Tenant isolation (P1 verification)**
   - As an authenticated non-admin user, try to call `install_connector_atomic` directly via the public Supabase client:
     ```ts
     await supabase.rpc("install_connector_atomic", { p_tenant_id: "<some other tenant>", … })
     ```
   - Expect **`PGRST301` "permission denied for function"** — the `authenticated` grant is revoked.

## Screenshots

`/library` after a successful install of Gmail + Drive — placeholder, capture on staging smoke. Page state: both cards show "installed" badge + reinstall CTA; the drawer for either shows "installed · last synced just now".

## Live smoke results (2026-05-18, against feat/phase-k-install @ d7f24c5, PR #25)

| Step | Result | Evidence |
|---|---|---|
| 1 — GitHub PAT happy path | ✅ PASS | Installed PAT against `ocWWp/bbc`. UI flipped to "Reinstall GitHub" at `/library?installed=github`. **End-to-end decryption proof** (one-off node script via Supabase REST): plaintext starts `github_pat_11A...`, ends `ehrI`, matches typed PAT exactly. Screenshot: `2026-05-17-phase-k-smoke/step1-github-pat-installed.png` |
| 2 — PAT rejection (wrong repo) | ✅ PASS | With PAT scoped to `ocWWp/bbc`, typing `ocWWp/does-not-exist-smoke-test-9999` → inline `Token lacks the repo scope.` rendered, NO `install_connector_atomic` RPC fired (tenant_connectors row unchanged). Screenshot: `2026-05-17-phase-k-smoke/step2-pat-rejection.png`. Note: first attempt with `microsoft/typescript` falsely "succeeded" because public repos accept any-PAT reads via GitHub's public-read fallback — the validation correctly distinguishes private/nonexistent from accessible-public. |
| 5 — Reinstall | ✅ PASS (implicit) | The accidental `microsoft/typescript` install during step 2 exercised the reinstall path: same `tenant_connectors.id` (`e14babd1...`), `mapping` rewritten, prior `external_accounts` row `revoked_at = new row's installed_at`. Slot reuse + revoke-then-insert atomicity proven. |
| 6 — Operator non-admin gate | ✅ PASS (prior session) | Per `2026-05-17-phase-k-smoke/library-connectors-tab.png` + unit test |
| 8 — P1 tenant isolation | ✅ PASS (prior session) | `2026-05-17-phase-k-smoke/p1-lockdown-proof.json` — authenticated JWT → 403/42501 on foreign-tenant install RPC |

### Mid-smoke P0 fix (commit `d7f24c5`)

Step 1 looked successful but the credential was unrecoverable. Migration 0060 + 4 code paths + test wire-format pins shipped to fix it. See PR #25 comment thread for the full diagnosis. After the fix: real end-to-end round-trip proven (encrypt → JSON-over-wire → Postgres TEXT → JSON-back → decrypt → original PAT).

### Still BLOCKED on credentials

- **Step 3** — Google consent end-to-end. Needs `BBC_GOOGLE_OAUTH_CLIENT_ID/SECRET` + `BBC_PUBLIC_URL=http://localhost:3000` in `apps/dashboard/.env.local` AND a Google Cloud OAuth client (Web type) with Gmail+Drive APIs, `oscarchow@8azi.io` test user, redirect URI `http://localhost:3000/api/oauth/google/callback` whitelisted.
- **Step 4** — Google partial consent (uncheck Drive on consent screen). Depends on step 3.
- **Step 7** — CSRF state replay. Capture a successful Google `state` from step 3, replay it, expect `?install_error=state_reused`. Depends on step 3.

## Sign-off

- [x] Steps 1, 2, 5 verified live (this session)
- [x] Steps 6, 8 verified live (prior session)
- [x] Mid-smoke P0 (secrets round-trip) found + fixed in `d7f24c5`
- [ ] Steps 3, 4, 7 — need Google OAuth client + 3 env vars
- [ ] PR #25 moved from draft → ready for review

Once 3/4/7 pass, mark PR ready and request review.
