# @bbc/dashboard

Visual front-end (PM tab) for BBC. Workspace member of the BBC monorepo (`bbc/apps/dashboard/`). Read-only views over `_log/`, `queue/`, `bindings.yaml` (file-mode) or the equivalent tables (DB-mode), plus Accept/Reject server actions. **Multi-tenant + invite-only: every signup is gated by a `tenant_invitations` row in Supabase.**

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

Sign-up is **invite-only**, gated by the `public.tenant_invitations` table. A `BEFORE INSERT` trigger on `auth.users` rejects any signup whose `(provider, identifier)` does not match an invitation (raises `not_invited` — surfaced in the UI as a clear error). On allowed signup, an `AFTER INSERT` trigger creates two rows: a `public.profiles` row carrying the provider + identifier + tenant_id, and a `public.tenant_members` row carrying the role from the invitation (`admin`, `member`, or `viewer`).

Every server action (Accept / Reject) calls `requireActor()` (see `src/lib/auth/require-user.ts`), which resolves the user's profile + tenant + role via the server-side Supabase client. `requireRole(actor, 'member')` then gates write actions: viewers can read but not Accept or Reject. Phase 5 (RBAC) may further tighten Accept to admin-only.

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
