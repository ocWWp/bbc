---
phase: Y-missing-pieces
verified: 2026-05-09T00:00:00Z
status: human_needed
score: 4/4 must-haves verified (1 deferred to human)
re_verification: false
human_verification:
  - test: "docker compose up --build at bbc/ root with .env populated"
    expected: "Container builds, dashboard reachable at http://localhost:3000, /bindings + /queue render against examples/example-tenant volume mount"
    why_human: "Requires Docker daemon running on host; not attempted in this session per the claim"
  - test: "End-to-end self-serve signup with BBC_SIGNUP_MODE=open + working SMTP"
    expected: "POST to /api/auth/self-serve-signup with new email creates tenant + invitation + auth user; user receives confirmation email; can sign in and lands as admin"
    why_human: "Supabase email confirmation requires SMTP configured on the project; flow tests email deliverability and the invitation->trigger->member chain end-to-end"
  - test: "Create + revoke API key via /api-keys UI as a signed-in admin"
    expected: "Plaintext token surfaced once on the redirect; refresh hides it; revoke moves it to the Revoked table"
    why_human: "Requires authenticated session; live probe only confirms 307 redirect for unauthenticated GET"
---

# Y-phases — "What's Still Missing" Verification Report

**Phase Goal:** Ship the four UX/ops gaps flagged in the post-F4 review — `/api-keys` UI, self-serve signup, welcome tour, docker self-host — so a fresh adopter can install BBC without SQL access.

**Verified:** 2026-05-09
**Status:** human_needed (all artifacts + wiring verified; full E2E requires runtime env)

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Tenant admin can issue + revoke MCP tokens via dashboard UI (no SQL) | VERIFIED | `/api-keys/page.tsx` reads from `api_keys`, admin-gated form posts to `createApiKey` action calling `create_api_key` RPC; revoke form calls `revoke_api_key` RPC; plaintext token surfaced once via `?token=` param in a "Save this NOW" panel; route returns 307 to /auth/signin without session |
| 2 | Stranger can sign up + provision their own tenant when operator opts in | VERIFIED | `/api/auth/self-serve-signup` route reads `BBC_SIGNUP_MODE`, returns 403 when not "open" (live probe confirmed `{"error":"Self-service signup is disabled..."}`); calls `setup_self_serve_tenant` RPC then `auth.admin.createUser`; UI page `/auth/self-serve` server-redirects to signin if not open (307 confirmed); `SelfServeForm` posts JSON to the route; signin page conditionally renders "Create my own tenant" link gated on the env var |
| 3 | First-time user has a guided 3-screen orientation accessible at /welcome | VERIFIED | `/welcome/page.tsx` is requireActor-gated server component (307 confirmed); `WelcomeTour.tsx` is client component with three screens (1: Memory contract, 2: Queue, 3: Invite/keys), back/next nav, skip button, `bbc.welcome.skipped` localStorage flag; step 3 forks admin vs member messaging; cross-links to /bindings, /queue, /team, /api-keys |
| 4 | Operator can self-host BBC via docker compose | VERIFIED (build) / DEFERRED (runtime) | `apps/dashboard/Dockerfile` — multi-stage (deps → builder → runner) on node:22-alpine, corepack pnpm@10.12.1, runs `pnpm --filter @bbc/dashboard build`, runtime EXPOSE 3000 + `next start`; `docker-compose.yml` at bbc/ root mounts `${BBC_REPO_HOST_PATH:-./examples/example-tenant}:/app/tenant:ro`, reads four env vars from root `.env`; `.env.example` documents all four; `.gitignore` excludes `.env`/`.env.*`. Actual `docker compose up` not attempted (no Docker in session — explicitly out of scope per claim) |

**Score:** 4/4 truths verified at code+wiring level; 1 deferred to human runtime test.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `apps/dashboard/src/app/api-keys/page.tsx` | server component, lists active+revoked, admin form, token panel | VERIFIED | 205 lines; uses `requireActor` + `isAdmin`; renders Active/Revoked tables; conditional Issue form |
| `apps/dashboard/src/app/api-keys/actions.ts` | `createApiKey`, `revokeApiKey` server actions, role-gated | VERIFIED | Both call `requireActor` + `requireRole(actor, 'admin')`; create returns plaintext via `?token=` redirect param |
| `apps/dashboard/src/components/Nav.tsx` | `/api-keys` link | VERIFIED | Line 30: `<Link href="/api-keys">api-keys</Link>` |
| `apps/dashboard/src/app/api/auth/self-serve-signup/route.ts` | POST handler gated by env, calls SQL fn + auth admin | VERIFIED | 113 lines; service-role admin client; validates email regex + password ≥8 + tenant name ≥2; calls `setup_self_serve_tenant` then `auth.admin.createUser({email_confirm: false})` |
| `apps/dashboard/supabase/migrations/0014_setup_self_serve_tenant.sql` | atomic tenant + invitation + 3 unbound bindings + log | VERIFIED | SECURITY DEFINER, EXECUTE revoked from public/anon/authenticated; slug regex validation; idempotency check on existing invitation; inserts into tenants, tenant_invitations, bindings (db/llm/email-delivery as `(unbound)`), operations_log |
| `apps/dashboard/src/app/auth/self-serve/page.tsx` + SelfServeForm.tsx | env-gated UI | VERIFIED | Server page redirects to `/auth/signin?error=self_serve_disabled` if not open; client form posts JSON to API route, surfaces `message`/`error` |
| `apps/dashboard/src/app/auth/signin/page.tsx` | conditional self-serve link | VERIFIED | Lines 92-100: dashed-bordered panel rendered when `BBC_SIGNUP_MODE === 'open'` |
| `apps/dashboard/src/app/welcome/page.tsx` + WelcomeTour.tsx | actor-gated, 3 screens, skip, localStorage | VERIFIED | Server page parses `?step=` (clamped 1..3), passes role+slug; client nav with `useRouter`, sets `bbc.welcome.skipped=1` on done/skip |
| `apps/dashboard/Dockerfile` | multi-stage, pnpm, next start | VERIFIED | 64 lines; deps/builder/runner stages; `corepack prepare pnpm@10.12.1`; `pnpm --filter @bbc/dashboard build`; runtime CMD `node_modules/.bin/next start -p 3000` |
| `docker-compose.yml` | dashboard service + tenant volume + env wiring | VERIFIED | Builds from `apps/dashboard/Dockerfile`; image `bbc-dashboard:local`; mounts `${BBC_REPO_HOST_PATH:-./examples/example-tenant}:/app/tenant:ro`; passes 4 env vars + `BBC_MODE`/`BBC_SIGNUP_MODE` defaults |
| `.env.example` | 4 required vars + optional | VERIFIED | NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, SUPABASE_SERVICE_ROLE_KEY, optional BBC_REPO_HOST_PATH/BBC_MODE/BBC_SIGNUP_MODE |
| `database.types.ts` regen | api_keys table + setup_self_serve_tenant fn | VERIFIED | Line 15: `api_keys: {`; line 98: `setup_self_serve_tenant: { Args: { p_email: string; p_name: string; p_slug: string }; Returns: string }` — types regenerated from live introspection, confirming both exist server-side |
| Migration 0013 RLS for SELECT | `api_keys_member_read` policy | VERIFIED | Line 26: `create policy api_keys_member_read on public.api_keys for select using (public.is_member_of(tenant_id));` |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| `/api-keys` page | `api_keys` table | `sb.from("api_keys").select(...).order(...)` | WIRED | Result mapped to `KeyRow[]`, split into active/revoked, both rendered |
| `createApiKey` action | `create_api_key` RPC | `sb.rpc("create_api_key", {p_name, p_scope})` | WIRED | Token returned, surfaced via redirect query param |
| `revokeApiKey` action | `revoke_api_key` RPC | `sb.rpc("revoke_api_key", {p_key_id})` | WIRED | Errors bounce back as `?error=` |
| `SelfServeForm` | `/api/auth/self-serve-signup` | `fetch(..., {method:"POST",body:JSON.stringify(...)})` | WIRED | Response JSON parsed for `ok`/`error`/`message` |
| `self-serve-signup` route | `setup_self_serve_tenant` SQL fn | `sb.rpc("setup_self_serve_tenant", {p_email,p_slug,p_name})` | WIRED | Followed by `sb.auth.admin.createUser` |
| `signin` page | `/auth/self-serve` | conditional `<a href="/auth/self-serve">` gated on env | WIRED (env-conditional) |
| `WelcomeTour` | `/bindings` `/queue` `/team` `/api-keys` | client `<a href>` per screen | WIRED |
| `docker-compose` | `apps/dashboard/Dockerfile` | `build.dockerfile: apps/dashboard/Dockerfile` | WIRED |
| `docker-compose` | tenant repo | volume `${BBC_REPO_HOST_PATH:-./examples/example-tenant}:/app/tenant:ro` + env `BBC_REPO=/app/tenant` | WIRED |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `apps/dashboard/Dockerfile` | runtime stage | Copies full `node_modules` instead of using `output: 'standalone'` | Warning | Image is larger than necessary; runs fine. `next.config.ts` has no `output: 'standalone'` set — would shrink runtime image significantly |
| `self-serve-signup/route.ts:93` | `email_confirm: false` | Requires Supabase SMTP for the confirm email; if unconfigured, user is stuck post-signup | Warning | Operator must configure SMTP or override to `email_confirm: true` for self-host without email |
| `WelcomeTour` first-visit redirect | (no file) | Page exists at /welcome but nothing redirects new users to it | Warning | Users must navigate manually; localStorage gate is client-only so middleware can't read it |
| `self-serve-signup` UX | route returns `{next: "/auth/signin"}` | No auto-sign-in via `signInWithPassword` after success | Info | Means tenant created → email confirm → manual signin (3 hops) instead of 1 |
| `docker-compose.yml:71-73` | mcp service commented out | Info | Documented Y.4 follow-up; not in scope of this verification |

## Top 3 Gaps (improvements, not blockers)

1. **Self-serve signup leaves the user at a dead end if SMTP isn't configured.** Route uses `email_confirm: false` which requires Supabase to send the confirmation. For self-host without SMTP, the user creates a tenant + auth account but cannot sign in. Recommend: surface this in `.env.example` (e.g., `BBC_SIGNUP_AUTOCONFIRM=true` to override) or auto-`signInWithPassword` after createUser succeeds, returning a session cookie.

2. **Welcome tour has no first-visit gate.** `/welcome` exists but nothing routes new users there on first sign-in. The localStorage flag is client-only and unreadable by middleware. Cleanest fix: add a `welcomed_at` column on `profiles`, check in the home page server component, redirect if null; mark on tour completion via a server action.

3. **Dockerfile would benefit from `output: 'standalone'`.** Currently the runner stage drags full `node_modules`. Adding `output: 'standalone'` to `next.config.ts` and switching the runner to copy `.next/standalone` + `.next/static` would shrink the image substantially. Functional but not optimal.

## Original "what's still missing" status

| Item | Status |
|------|--------|
| Y.1 — `/api-keys` UI for issuing + revoking MCP tokens | DONE |
| Y.2 — Self-service signup endpoint + UI gated by env | DONE (with the SMTP caveat above) |
| Y.3 — Welcome tour at `/welcome` | PARTIAL (page + 3 screens shipped; no first-visit auto-redirect) |
| Y.4 — Dockerfile + docker-compose for self-host | DONE (build path verified; runtime `docker compose up` deferred to human; `output: 'standalone'` is a follow-up optimization) |

---

_Verified: 2026-05-09_
_Verifier: Claude (gsd-verifier)_
