# Operating your own BBC

You cloned this repo and want to use it for your team. This is the operator playbook — the steps a tenant admin takes from "I just installed it" to "my team is running on BBC."

For the **protocol** (precedence rules, lock matrix, queue mechanics) read `bbc/CLAUDE.md`. For **agent onboarding** (what an LLM does when it opens a session inside `bbc/`) read `bbc/AGENTS.md`. This file is for **humans operating the dashboard**.

## What you have after `git clone && pnpm install`

A monorepo:

```
bbc/
├── CLAUDE.md, AGENTS.md, README.md     ← protocol docs
├── memory/, manager/, distribution/    ← BBC-protocol content (file-mode)
├── queue/, _log/                       ← file-mode state
├── scripts/                            ← bash file-mode transport (propose/accept/reject)
├── apps/dashboard/                     ← Next.js dashboard (@bbc/dashboard)
├── apps/mcp-server/                    ← Model Context Protocol bridge for agents (@bbc/mcp-server)
├── packages/store/                     ← shared storage interface (@bbc/store)
└── templates/initial-tenant/           ← seed content for new SaaS tenants
```

Two deployment modes (see ADR-0004):
- **file-mode** (default): single-tenant, the dashboard reads `memory/`, `queue/`, `_log/`, `bindings.yaml` from disk and writes via `bash scripts/{accept,reject,propose}.sh`. Use this for solo dev or one-team self-host.
- **DB-mode** (`BBC_MODE=db`): multi-tenant, RLS-gated Supabase. The SaaS deployment uses this; multi-team self-hosters point at their own Supabase.

## First-run quickstart (file-mode, ≤ 5 minutes)

```bash
cd bbc
pnpm install
cp apps/dashboard/.env.example apps/dashboard/.env.local
# .env.local default works for file-mode; only NEXT_PUBLIC_SUPABASE_*
# vars are needed if you want the auth flow to work locally.

pnpm --filter @bbc/dashboard dev      # http://localhost:3000
```

Without Supabase configured, sign-in won't work — you'll just see redirects to `/auth/signin`. To use the dashboard locally with auth, follow the **Supabase setup** section below.

## Supabase setup (one-time)

1. Create a Supabase project (free tier is fine for dev).
2. Apply migrations in order: `apps/dashboard/supabase/migrations/0001_*.sql` through `0013_api_keys.sql`. Easiest: `supabase db push` from the project root after `supabase link`.
3. Copy `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` from Project Settings → API into `apps/dashboard/.env.local`.
4. Copy the `service_role` key into `apps/dashboard/.env.local` as `SUPABASE_SERVICE_ROLE_KEY`. Server-only — never expose to the client.
5. Configure Auth Providers (Authentication → Providers in Supabase dashboard):
   - **Email**: enable. Keep "Enable signups" ON so the invitation trigger can return clean errors.
   - **GitHub OAuth** (optional): register an OAuth app with callback `https://<project-ref>.supabase.co/auth/v1/callback`, paste Client ID + Secret.
   - **Google OAuth** (optional): same, in Google Cloud Console.
6. URL Configuration → Site URL: `http://localhost:3000`. Add `http://localhost:3000/auth/callback` to additional redirect URLs.

You're now ready to bootstrap your first tenant.

## Bootstrap your first tenant + admin

The check_invitation trigger gates signup on a matching `tenant_invitations` row. Your first time, there's no tenant yet — bootstrap manually:

```sql
-- Run in Supabase SQL editor (service_role context)

-- 1. Create your tenant
insert into public.tenants (slug, name, plan)
values ('my-team', 'My Team', 'free')
returning id;
-- Copy the returned UUID; we'll call it <TENANT_ID> below.

-- 2. Pre-seed an invitation for your email so the BEFORE trigger lets you sign up
insert into public.tenant_invitations (tenant_id, provider, identifier, role)
values ('<TENANT_ID>', 'email', 'you@yourdomain.com', 'admin');

-- (Optional) Same for your GitHub login if you want OAuth signup:
insert into public.tenant_invitations (tenant_id, provider, identifier, role)
values ('<TENANT_ID>', 'github', 'your-gh-login', 'admin');
```

Now sign up at `http://localhost:3000/auth/signin` with the matching email. The signup AFTER trigger will:
- Create your `profiles` row pointing at `<TENANT_ID>`
- Create your `tenant_members` row with `role='admin'`

Verify:

```sql
select tm.role, p.identifier, t.slug
from public.tenant_members tm
join public.profiles p on p.user_id = tm.user_id
join public.tenants t on t.id = tm.tenant_id
where t.slug = 'my-team';
-- Expect: admin | you@yourdomain.com | my-team
```

## Daily-use loop (the actual operator UX)

Once you're admin in a tenant:

### Invite teammates
- **/team page** (admin only) → "Invite someone" form. Pick provider + identifier + role. Submit.
- The invited identity can sign up via `/auth/signin` and lands in your tenant with the role you set.

### Review the queue
- **/queue** lists pending proposals (file-mode reads `bbc/queue/*.md`; DB-mode reads `queue_items`).
- Click a proposal to see body + frontmatter + manager review annotations.
- **Accept** or **Reject** (Reject requires a reason). Both actions:
  - Append to `_log/operations.jsonl` (file-mode) or `operations_log` table (DB-mode)
  - Move/flip the proposal to accepted/rejected (file: `_accepted/`/`_rejected/`; DB: status enum)
  - Are atomic at the transport layer (bash transaction OR SQL transaction)
- **Member or admin role required.** Viewers can read but not Accept/Reject.

### Watch the audit trail
- **/log** shows the recent operations_log entries, paginated.
- Every accept/reject/invite/role-change/api-key-issue is recorded with actor + target.

### Issue agent API keys
- **/api-keys** page (admin-only). Form to create a new key (name + scope: read | write | admin); list of active keys with `last_used_at`; revoke buttons.
- Plaintext token is shown ONCE on creation (in a dismissible green panel). Copy it then; only the bcrypt hash is stored.
- SQL fallback (still works): `select public.create_api_key('my-claude-desktop', 'read');` returns `bbc_<key_id>.<secret>` once.
- Wire the token into Claude Desktop / Cursor / your custom agent. See `apps/mcp-server/README.md` for transport config.

### Manage roles
- **/team** → change-role select per member. Hierarchy: admin > member > viewer.
- Last-admin protection: you can't demote the only remaining admin.
- Self-remove protection: you can't remove yourself; demote first.

## Health checks

```bash
# Dashboard build clean?
pnpm --filter @bbc/dashboard build

# MCP server type-checks?
pnpm --filter @bbc/mcp-server type-check

# Live security advisors clean?
# (run from Supabase SQL editor or via mcp__supabase__get_advisors)
```

In a healthy DB-mode tenant you should see:
- 1 tenant, ≥1 admin in `tenant_members`
- All RLS policies in place (advisors warns if missing)
- `last_used_at` populated on any active API keys

## Mode switching

To run the dashboard against your DB instead of the filesystem:

```bash
echo "BBC_MODE=db" >> apps/dashboard/.env.local
pnpm --filter @bbc/dashboard dev
```

The `getStore()` factory will route reads to `SupabaseStore` and writes through the SQL functions (`accept_proposal`, `reject_proposal`, etc.). All audit invariants hold in both modes.

To go back: remove the line.

## Where things live (cheat sheet)

| Want to… | Look in… |
|---|---|
| Change protocol principles | `bbc/CLAUDE.md` (Main only — locked from below) |
| Add a memory file | `bbc/memory/<category>/...` (file-mode); the dashboard's "new memory" page (DB-mode, future) |
| File a proposal | `bash scripts/propose.sh ...` (file-mode); the dashboard's "new proposal" UI (DB-mode, future) |
| Audit who did what | `bbc/_log/operations.jsonl` (file-mode); `operations_log` table (DB-mode); `/log` page in either |
| Generate dashboard types | `mcp__supabase__generate_typescript_types` then drop into `apps/dashboard/src/lib/supabase/database.types.ts` |
| Add a new BBC tool agents can call | `apps/mcp-server/src/tools/<name>.ts` + register in `src/server.ts` |

## Self-service signup

Off by default (invite-only). To enable:

```bash
echo "BBC_SIGNUP_MODE=open" >> apps/dashboard/.env.local
pnpm --filter @bbc/dashboard dev
```

In `open` mode, `/auth/signin` shows a "Create my own tenant" CTA that links to `/auth/self-serve`. New users pick a tenant name + email + password; the route handler `setup_self_serve_tenant()` (migration 0014) atomically creates a tenant + admin invitation + bindings + audit log row, then `auth.admin.createUser` triggers normal signup.

Caveat: `auth.admin.createUser({ email_confirm: false })` requires Supabase to send the confirmation email. Without SMTP wired (Resend / Postmark / SES), the user creates a tenant but can't sign in. For local dev, you can manually confirm via Supabase Studio → Auth → Users.

## Welcome tour

`/welcome` route shows a 3-screen client-side tour for new users (memory → queue → invite/api-keys). Skip button + localStorage flag (`bbc.welcome.skipped`) so it doesn't re-show. **Currently you have to navigate there manually** — first-visit auto-redirect from `/` is a follow-up (needs a `welcomed_at` profile column for server-side detection).

## Self-host via Docker

```bash
cp .env.example .env   # at repo root, fill in Supabase keys
docker compose up --build
# → http://localhost:3000 against examples/example-tenant/
```

The `dashboard` service builds from `apps/dashboard/Dockerfile` (multi-stage Node 22 + pnpm), mounts `examples/example-tenant/` (or whatever you point `BBC_REPO_HOST_PATH=` at) as `/app/tenant`, reads Supabase env from your root `.env`. `BBC_SIGNUP_MODE` is also configurable per the same env file.

## What's still missing

- **Welcome tour first-visit auto-redirect** — page exists but nothing routes new users there from `/`. Needs a `welcomed_at` profile column for server-side detection.
- **Self-serve signup auto-confirm** — when running without SMTP, signup completes but user can't sign in until manually confirmed in Supabase Studio. Add a `BBC_SIGNUP_AUTOCONFIRM` toggle.
- **Stripe billing UI** (Phase 8 of the productization roadmap).
- **`bbc-cli` for self-host bootstrapping** (`bbc-cli init my-team` mentioned in `examples/example-tenant/README.md`).

If you find yourself doing something that *should* be in the dashboard but isn't yet, file an issue.
