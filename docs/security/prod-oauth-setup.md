# Prod OAuth setup (Cloudflare)

Operator runbook for turning on **Sign-in with Google** and the **Gmail / Drive connector** flow on a fresh Cloudflare-deployed BBC. The dashboard ships the code; this is the env-side configuration the maintainer does outside the repo.

The hosted demo at `bigbraincompany.online` runs behind this exact setup. Self-hosters mirror it.

This is a launch blocker for **item #4** in `docs/internal-launch-audit.md` — code is live, env is not. Without these steps the `/auth/signin` page renders only the GitHub button and `/library` Gmail/Drive cards return *"not configured"*.

Time: ~30 min the first time (Google Cloud Console paperwork + verifying); ~5 min after that on a fresh zone.

## What you're wiring up

Two separate flows share most of these env vars:

| Flow | Surface | Code path |
|---|---|---|
| **Sign-in with Google** (Supabase Auth) | `/auth/signin` Google button | `apps/dashboard/src/app/auth/signin/page.tsx` |
| **Gmail / Drive connector** install | `/library` install buttons | `apps/dashboard/src/app/library/install/_actions.ts`, `apps/dashboard/src/app/api/oauth/google/callback/route.ts` |

The sign-in flow goes through Supabase's hosted callback (`https://<project-ref>.supabase.co/auth/v1/callback`). The connector flow goes through BBC's own callback (`${BBC_PUBLIC_URL}/api/oauth/google/callback`). Same Google client can serve both as long as both redirect URIs are whitelisted.

## Prerequisites

- Cloudflare zone fronting the worker; `wrangler` authed to the right account.
- Supabase project linked, migrations applied (per `docs/operating-bbc.md`).
- A Google Cloud project you control. Free tier is fine.
- `BBC_PUBLIC_URL` decided — the canonical origin (no trailing slash) the dashboard is served from. For the hosted demo: `https://bigbraincompany.online`.

## Step 1 — Google Cloud Console

One-time, in [console.cloud.google.com](https://console.cloud.google.com):

1. **Pick or create a project.** Top-bar project picker → New Project. Name it after the deployment (`bbc-prod`, `bbc-acme`, etc.).
2. **Enable the APIs.** `APIs & Services > Library`:
   - Gmail API → Enable
   - Google Drive API → Enable
   Search by name. The Sign-in-with-Google flow does not need a separate API.
3. **Configure the OAuth consent screen.** `APIs & Services > OAuth consent screen`:
   - User type: **External** (Internal only works for Google Workspace orgs).
   - App name, support email, developer contact email. These are the strings end users see on the consent page — use real ones.
   - Authorized domains: add the apex of `BBC_PUBLIC_URL` (e.g. `bigbraincompany.online`).
   - Scopes: leave default for now; the connector requests Gmail / Drive scopes per-install via the dashboard, you don't need to pre-add them here.
   - Test users: add the emails that will install Gmail/Drive **before verification clears**. Google caps Testing-mode apps at 100 distinct test users — see [`memory/ops/providers/google.md`](../../memory/ops/providers/google.md).
4. **Create the OAuth client.** `APIs & Services > Credentials > Create credentials > OAuth client ID`:
   - Application type: **Web application**.
   - Name: `bbc-dashboard-prod` (or similar).
   - Authorized redirect URIs — add **both**:
     - `https://<your-supabase-project-ref>.supabase.co/auth/v1/callback` (sign-in flow)
     - `${BBC_PUBLIC_URL}/api/oauth/google/callback` (connector flow, e.g. `https://bigbraincompany.online/api/oauth/google/callback`)
   - The redirect URI must match exactly — scheme, host, no trailing slash. A mismatch fails with Google's opaque *"redirect_uri_mismatch"*.
   - Save. Copy the **Client ID** and **Client secret** — they appear once in a modal, then are masked. Paste them somewhere you can refer back to in Step 4.

## Step 2 — Supabase Auth provider (sign-in flow only)

In the Supabase dashboard → `Authentication > Providers > Google`:

1. Enable.
2. Paste the **same Client ID + Client Secret** from Step 1.
3. Confirm the callback URL on this screen matches the Supabase redirect URI you whitelisted in Step 1.
4. Save.

This is what makes the Supabase-managed Google sign-in flow work. It's separate from the four BBC env vars below — the connector flow doesn't read Supabase's stored credentials, it uses the wrangler secrets.

## Step 3 — Generate the OAuth state secret

The connector flow HMAC-signs the OAuth `state` parameter. The signing key is one secret, shared across every OAuth connector you install — generate it once:

```bash
openssl rand -base64 32
```

Copy the output. You'll paste it in Step 4 as `BBC_OAUTH_STATE_SECRET`.

## Step 4 — Set Cloudflare worker secrets

From the repo root, with `wrangler` authed against the right account:

```bash
cd apps/dashboard

# Enables both OAuth buttons on /auth/signin.
# WHY explicit: Cloudflare's "unset env" reads back as empty string, not
# undefined, so the code's "default to github,google" branch never fires
# in prod. You must set this explicitly. See feedback_cloudflare_env_vars_empty_string.
wrangler secret put BBC_OAUTH_PROVIDERS
# Paste: github,google

# HMAC signing key for /api/oauth/* state. Refuses to boot if unset.
wrangler secret put BBC_OAUTH_STATE_SECRET
# Paste: the `openssl rand -base64 32` output from Step 3.

# Google OAuth client (Web) from Step 1.
wrangler secret put BBC_GOOGLE_OAUTH_CLIENT_ID
# Paste: the Client ID.

wrangler secret put BBC_GOOGLE_OAUTH_CLIENT_SECRET
# Paste: the Client secret.

# Canonical origin used to build the connector redirect_uri. Must match
# the value whitelisted in Step 1 exactly — scheme, host, no trailing slash.
wrangler secret put BBC_PUBLIC_URL
# Paste: https://bigbraincompany.online   (or your domain)
```

The dashboard's `apps/dashboard/wrangler.toml` already lists these vars in the header comment — no toml edit needed; `wrangler secret put` writes to the encrypted secret store, which the worker reads at request time.

`BBC_GOOGLE_OAUTH_VERIFIED` stays **unset** until Google completes verification on your OAuth app (see `memory/ops/providers/google.md`). While unset/empty/`"false"`, the Gmail/Drive cards in `/library` render a *"this app isn't verified"* warning — that's intended, not a bug.

## Step 5 — Deploy + verify

```bash
pnpm --filter @bbc/dashboard cf:deploy
```

Then verify each piece:

1. **All five secrets present.**
   ```bash
   wrangler secret list | grep -E 'BBC_OAUTH_PROVIDERS|BBC_OAUTH_STATE_SECRET|BBC_GOOGLE_OAUTH_CLIENT_ID|BBC_GOOGLE_OAUTH_CLIENT_SECRET|BBC_PUBLIC_URL'
   ```
   Expect 5 lines back.

2. **Sign-in button renders.**
   ```bash
   curl -s https://<your-domain>/auth/signin | grep -i 'continue with google'
   ```
   Expect a match. If empty: `BBC_OAUTH_PROVIDERS` is missing or doesn't include `google`.

3. **Sign-in flow works end-to-end.** In an incognito window, hit `/auth/signin`, click *Continue with Google*, complete consent → land on `/home`. If you get *"redirect_uri_mismatch"* the Supabase callback URI in Step 1 doesn't match what Supabase actually uses; copy it from the Supabase dashboard exactly.

4. **Connector install works.** As a tenant admin, hit `/library`, switch to the Connectors tab, click **Install** on Gmail. You should see Google's consent screen with the right app name and the Gmail scope requested — not *"not configured"* and not *"redirect_uri_mismatch"*. Complete consent → return to `/library` with the connector showing **connected**.

5. **No-op the verification warning** (skip until verification clears). The warning is informational; install still works for whitelisted test users.

## Common failure modes

- **Google button missing on signin, everything else fine.** `BBC_OAUTH_PROVIDERS` is unset. Cloudflare's empty-string-on-unset behavior bypasses the in-code default. Set it explicitly.
- **`/library` Gmail install returns *"not configured"*.** One of `BBC_GOOGLE_OAUTH_CLIENT_ID`, `BBC_GOOGLE_OAUTH_CLIENT_SECRET`, `BBC_PUBLIC_URL`, `BBC_OAUTH_STATE_SECRET` is unset. Re-run `wrangler secret list`.
- **`redirect_uri_mismatch` on the Google consent screen.** The redirect URI in Step 1 doesn't exactly match what the dashboard sends. Diff scheme, host, path, and trailing slash. `${BBC_PUBLIC_URL}/api/oauth/google/callback` must equal the value in Google Cloud Console verbatim.
- **Install returns successfully but no `external_accounts` row.** Almost always a secret mismatch — connector code refuses to write when state HMAC verification fails. Check worker logs (`wrangler tail`) for the verify error.

## After the runbook

Tick item #4 in `docs/security/launch-checklist.md`. Update item #4 STATUS in `docs/internal-launch-audit.md` to point at this runbook.
