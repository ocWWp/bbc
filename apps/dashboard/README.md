# @bbc/dashboard

Visual front-end (PM tab) for BBC. Workspace member of the BBC monorepo (`bbc/apps/dashboard/`). Read-only views over `_log/`, `queue/`, `bindings.yaml` (file-mode) or the equivalent tables (DB-mode), plus Accept/Reject server actions. **Auth-gated by an invite-only allowlist in Supabase.**

## Run (local dev)

From the **bbc/** monorepo root:
```bash
pnpm install
cp apps/dashboard/.env.example apps/dashboard/.env.local
# fill in NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, SUPABASE_SERVICE_ROLE_KEY
pnpm dev          # http://localhost:3000
```

Or from `apps/dashboard/` directly: `pnpm dev`.

`BBC_REPO` env var overrides the BBC repo location (default: `../../` relative to this package — i.e. the monorepo root).

## Routes

- `/` — overview: BBC repo path, current phase, last-7d counts, latest log entry.
- `/queue` — pending proposals + recent accepts/rejects. Accept/Reject buttons.
- `/queue/[id]` — single proposal detail (frontmatter + body + manager_review).
- `/skills` — slash commands, F2 skill hierarchy, leaf agents, external pinned skills.
- `/graph` — three SVG views (layer hierarchy, folder tree, queue workflow).
- `/log` — operations log paginated.
- `/bindings` — current role → adapter table.
- `/auth/signin` — GitHub OAuth + Google OAuth + email/password.
- `/auth/callback` — OAuth code-exchange route.
- `/auth/signout` — POST to clear session.

## Auth

Supabase Auth with three providers: **GitHub OAuth, Google OAuth, email + password**. Sessions are cookie-based, refreshed in `src/middleware.ts`.

Sign-up is **invite-only**, gated by the `public.allowlist` table in the Supabase project. A `BEFORE INSERT` trigger on `auth.users` rejects any signup whose `(provider, identifier)` isn't in the allowlist (raises `not_invited` — surfaced in the UI as a clear error). On allowed signup, a row is inserted into `public.profiles` with the provider + identifier; that row is the source of truth for the BBC actor string `human:<provider>:<identifier>`.

Every server action (Accept / Reject) calls `requireActor()` (see `src/lib/auth/require-user.ts`), which loads the profile via the server-side Supabase client and refuses unauthorized requests.

## Hosting prerequisites

Before exposing this on a network:

1. **Provision a Supabase project** and apply the migration in `supabase/migrations/0001_dashboard_auth_init.sql`.

2. **Configure providers in the Supabase dashboard** (Authentication → Providers):
   - **GitHub**: register an OAuth app at <https://github.com/settings/developers> with callback `https://<project-ref>.supabase.co/auth/v1/callback`. Paste Client ID + Secret into Supabase.
   - **Google**: create an OAuth client in Google Cloud Console with the same callback URI. Paste Client ID + Secret into Supabase.
   - **Email**: enable; turn on "Confirm email" in production. Keep "Enable signups" ON so the allowlist trigger can return a clean error (vs. an opaque "couldn't authenticate").

3. **Site URL + redirect URLs** (Authentication → URL Configuration): `http://localhost:3000` (dev), production URL when deployed. Add `http://localhost:3000/auth/callback` to additional redirect URLs.

4. **Populate `.env.local`** (gitignored): see `.env.example`.

5. **Seed the allowlist**:

   ```sql
   insert into public.allowlist(provider, identifier) values
     ('github', 'your-gh-login'),
     ('email',  'you@yourdomain.com');
   ```

   Only listed identities can sign up. Every signed-in user has full Accept/Reject power; per-user RBAC is deferred.

## Security

Auth-gated, but the Accept/Reject server actions still shell out to `bash bbc/scripts/{accept,reject}.sh` server-side. That's a **trust-the-allowlisted-user** model: a logged-in user can submit any proposal_id matching the regex, and the action will fire the script.

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
