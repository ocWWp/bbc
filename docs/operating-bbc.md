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
- Today (Phase 6): no UI yet. Run in SQL editor as admin:
  ```sql
  select public.create_api_key('my-claude-desktop', 'read');
  -- Returns: bbc_<key_id>.<secret>  (one time only — store it now)
  ```
- A future Phase 9 release adds an `/api-keys` page in the dashboard.
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

## What's deferred

- A welcome-tour UI for first-time users (Phase 11).
- An `/api-keys` page in the dashboard (Phase 9).
- Self-host docker-compose stack (Phase 7).
- Stripe billing UI (Phase 8).
- The auto-tenant-creation flow for a stranger signing up without an invitation (Phase 9 wires `create_tenant_with_seed()` into the signup endpoint).

If you find yourself doing something that *should* be in the dashboard but isn't yet, that's probably a phase-deferred item — file an issue and link to the relevant phase in `/Users/grid/.claude/plans/i-need-you-to-merry-teacup.md`.
