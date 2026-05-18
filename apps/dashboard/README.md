# @bbc/dashboard

Visual front-end (PM tab) for BBC. Workspace member of the BBC monorepo (`bbc/apps/dashboard/`). Read-only views over `_log/`, `queue/`, `bindings.yaml` (file-mode) or the equivalent tables (DB-mode), plus Accept/Reject server actions. **Multi-tenant + invite-only: every signup is gated by a `tenant_invitations` row in Supabase.**

## Run (local dev)

From the **bbc/** monorepo root:
```bash
pnpm install
cp apps/dashboard/.env.example apps/dashboard/.env.local
# fill in NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, SUPABASE_SERVICE_ROLE_KEY
pnpm --filter @bbc/dashboard dev          # http://localhost:3000
```

Default tenant: the dashboard reads `examples/example-tenant/` (the Acme Co demo) so you see populated data immediately.

To point at your own tenant repo:
```bash
BBC_REPO=/path/to/your-tenant pnpm --filter @bbc/dashboard dev
```

See [`docs/tenant-repo-architecture.md`](../../docs/tenant-repo-architecture.md) for the skeleton+slot model.

## Routes

- `/` — overview: tenant repo path, current state, last-7d counts, latest log entry.
- `/queue` — pending proposals + recent accepts/rejects. Accept/Reject buttons (member+).
- `/queue/[id]` — single proposal detail (frontmatter + body + manager_review).
- `/skills` — slash commands + skill hierarchy + leaf agents.
- `/graph` — three SVG views (layer hierarchy, folder tree, queue workflow).
- `/log` — operations log paginated.
- `/bindings` — current role → adapter table.
- `/team` — list members + pending invitations; invite/role-change/remove (admin).
- `/api-keys` — list + issue + revoke MCP tokens (admin). Plaintext token shown once.
- `/welcome` — 3-screen tour for first-time users (memory → queue → invite).
- `/auth/signin` — GitHub OAuth + Google OAuth + email/password.
- `/auth/self-serve` — create-your-own-tenant signup. Gated by `BBC_SIGNUP_MODE=open`.
- `/auth/callback` — OAuth code-exchange route.
- `/auth/signout` — POST to clear session.
- `/api/auth/self-serve-signup` — POST endpoint for self-serve. Same gating.

## Auth

Supabase Auth with three providers: **GitHub OAuth, Google OAuth, email + password**. Sessions are cookie-based, refreshed in `src/middleware.ts`.

Sign-up is **invite-only**, gated by the `public.tenant_invitations` table. A `BEFORE INSERT` trigger on `auth.users` rejects any signup whose `(provider, identifier)` does not match an invitation (raises `not_invited` — surfaced in the UI as a clear error). On allowed signup, an `AFTER INSERT` trigger creates two rows: a `public.profiles` row carrying the provider + identifier + tenant_id, and a `public.tenant_members` row carrying the role from the invitation (`admin`, `member`, or `viewer`).

Every server action (Accept / Reject) calls `requireActor()` (see `src/lib/auth/require-user.ts`), which resolves the user's profile + tenant + role via the server-side Supabase client. `requireRole(actor, 'member')` then gates write actions: viewers can read but not Accept or Reject. Phase 5 (RBAC) may further tighten Accept to admin-only.

### Connector OAuth (Gmail / Drive)

`/library/install/google` opens Google's consent screen for Gmail + Drive, redirects through `/api/oauth/google/callback`, and writes one row per granted scope into `external_accounts` via `install_connector_atomic` (migration 0057, locked down further in 0058). Only tenant **admins** can install — operators and members see a degraded view. Setup:

1. **Create an OAuth client (Web)** in the [Google Cloud Console](https://console.cloud.google.com/apis/credentials) and **enable the Gmail API and the Drive API** on the same project.
2. **Whitelist the redirect URI** under "Authorized redirect URIs" — `${BBC_PUBLIC_URL}/api/oauth/google/callback`. The value must match `BBC_PUBLIC_URL` exactly (scheme + host + no trailing slash).
3. **Set four env vars** (see `.env.example`):
   - `BBC_GOOGLE_OAUTH_CLIENT_ID`
   - `BBC_GOOGLE_OAUTH_CLIENT_SECRET` (Cloudflare: `wrangler secret put BBC_GOOGLE_OAUTH_CLIENT_SECRET`)
   - `BBC_PUBLIC_URL`
   - `BBC_GOOGLE_OAUTH_VERIFIED` — leave unset until verification clears
4. **`BBC_OAUTH_STATE_SECRET`** is shared with all OAuth connectors (`openssl rand -base64 32`). Routes refuse to boot if it's unset.

While Google has your OAuth client in **Testing** mode, only the up-to-**100 test users** you list on the consent screen can complete install — Google's hard cap, see [`memory/ops/providers/google.md`](../../memory/ops/providers/google.md) for the verification path. The catalog surfaces a "this app isn't verified" warning on Gmail/Drive while `BBC_GOOGLE_OAUTH_VERIFIED` is not `"true"`.

GitHub PAT install (`/library/install/github`) needs no extra env config — the user pastes their personal access token, BBC pings `/repos/{owner}/{repo}` to confirm access before persisting the encrypted PAT.

## Hosting prerequisites

Before exposing this on a network:

1. **Provision a Supabase project** and apply all migrations in `supabase/migrations/` in order (0001 → 0004 as of Phase 1).

2. **Configure providers in the Supabase dashboard** (Authentication → Providers):
   - **GitHub**: register an OAuth app at <https://github.com/settings/developers> with callback `https://<project-ref>.supabase.co/auth/v1/callback`. Paste Client ID + Secret into Supabase.
   - **Google**: create an OAuth client in Google Cloud Console with the same callback URI. Paste Client ID + Secret into Supabase.
   - **Email**: enable; turn on "Confirm email" in production. Keep "Enable signups" ON so the invitation trigger can return a clean `not_invited` error (vs. an opaque "couldn't authenticate").

3. **Site URL + redirect URLs** (Authentication → URL Configuration): `http://localhost:3000` (dev), production URL when deployed. Add `http://localhost:3000/auth/callback` to additional redirect URLs.

4. **Populate `.env.local`** (gitignored): see `.env.example`.

5. **Seed a tenant + invitations**:

   ```sql
   -- Create a tenant
   insert into public.tenants (slug, name, plan)
   values ('my-team', 'My Team', 'free')
   returning id;
   -- Use the returned tenant_id below.

   -- Invite people. Role is one of: admin | member | viewer.
   insert into public.tenant_invitations (tenant_id, provider, identifier, role) values
     ('<tenant_id>', 'github', 'your-gh-login',     'admin'),
     ('<tenant_id>', 'email',  'you@yourdomain.com', 'admin'),
     ('<tenant_id>', 'email',  'teammate@your.co',   'member');
   ```

   Only invited identities can sign up. Roles: **admin** (full Accept/Reject + member management), **member** (Accept/Reject + read), **viewer** (read only).

## Security

Auth-gated, but the Accept/Reject server actions still shell out to `bash bbc/scripts/{accept,reject}.sh` server-side. That's a **trust-the-invited-user** model: a logged-in member can submit any proposal_id matching the regex, and the action will fire the script. Viewers are blocked at the application layer (`requireRole(actor, 'member')`).

**This is acceptable for invite-only deployments where every user is trusted to operate the BBC.** It is NOT acceptable for uncurated/public hosting. To make it public-safe, replace `child_process.exec` with a typed RPC layer (deferred to a future plan) and add per-user role-based permissions.

Inputs are validated:
- `proposal_id` matches `^prop_[\w:.-]+$`.
- Reject reason capped at 500 chars.
- Actor string (built from the user's profile row) matches `^human:(github|google|email):[A-Za-z0-9._%+@-]{1,254}$`.

## Auto-update (BBC side, not dashboard)

BBC's `scripts/install-daemons.sh --install all` schedules:
- `refresh-all.sh` every 15 minutes (re-indexes memory + archives, runs validators, idempotently re-bootstraps every leaf).
- `heartbeat-emit.sh --loop` continuously (F3 up-monitoring, surfaced via `/bbc:failover-status` and the dashboard overview).

The dashboard reflects the up-to-date state because every page is `dynamic = "force-dynamic"`. No client-side polling.

## What's in here vs not

- **Read paths** (`src/lib/read-*.ts`) — pure fs reads, parsed inline (BBC's YAML is simple enough that we don't need js-yaml).
- **Write paths** (`src/app/queue/actions.ts`) — server actions wrapping `child_process.exec`, gated by `requireActor()`.
- **Auth** (`src/lib/supabase/`, `src/lib/auth/`, `src/middleware.ts`, `src/app/auth/`) — Supabase Auth (`@supabase/ssr`) with GitHub, Google, email/password.
- **No client-side state** beyond the `ActionButtons` and `SignInForm` components.

## Connection to BBC

This package is governed by the dashboard Distribution leaf in the BBC monorepo (we live inside it now). The leaf file is:

```
../../distribution/dashboard/CLAUDE.md
```

(The earlier `.bbc-leaf/` back-pointer file was redundant after the move into the monorepo and was removed.)
