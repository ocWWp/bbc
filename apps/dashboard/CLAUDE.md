# CLAUDE.md — `apps/dashboard/` (Next.js code)

You are operating inside the BBC dashboard Next.js workspace. This is the codebase; the BBC-side governance for this workspace lives in `../../distribution/dashboard/CLAUDE.md` (read that for "what proposals this workspace files" and "what the leaf rules are"). The roots are governed by `../../CLAUDE.md` (Main).

## What this is

`@bbc/dashboard` — Next.js 16 / React 19 visual front-end for BBC. Multi-tenant + invite-only. Routes are mostly read-only views over the tenant's BBC state (`_log/`, `queue/`, `bindings.yaml` in file-mode, or equivalent Supabase tables in DB-mode), plus a small set of write-paths (Accept/Reject queue, manage API keys, invite team) implemented as Next.js server actions.

Full route list, auth model, hosting prerequisites: see `README.md`. Don't duplicate that here.

## Quick start (from this directory)

```bash
pnpm install                          # from repo root, not from here
pnpm --filter @bbc/dashboard dev      # http://localhost:3000
pnpm --filter @bbc/dashboard build
pnpm --filter @bbc/dashboard type-check
pnpm --filter @bbc/dashboard cf:build       # Cloudflare worker bundle (OpenNext)
pnpm --filter @bbc/dashboard cf:deploy      # deploy to Cloudflare Workers
```

Default tenant for local dev: `examples/example-tenant/` (Acme Co fixture). Override with `BBC_REPO=/path/to/tenant`.

## Code map

- `src/app/` — Next.js App Router. One folder per route in the README's route list.
- `src/lib/read-*.ts` — pure `fs` reads of BBC state. Inline YAML parsing (BBC YAML is simple enough that we don't pull `js-yaml`).
- `src/lib/supabase/` — `@supabase/ssr` clients (browser, server, service). Tag callsites `bbc-provider:supabase` per F4-build-2.
- `src/lib/auth/require-user.ts` — `requireActor()` + `requireRole(actor, min)`. Every server action calls these.
- `src/app/queue/actions.ts` — server actions that shell out to `../../scripts/{accept,reject}.sh`. See "Gotchas" below.
- `src/middleware.ts` — refreshes Supabase session cookies on every request.
- `src/components/` — UI. No client-side state beyond `ActionButtons` and `SignInForm`.

## Gotchas (the non-obvious stuff)

1. **Server actions shell out to bash scripts.** `src/app/queue/actions.ts` runs `bash ../../scripts/accept.sh` and `reject.sh` server-side to mutate BBC state. This is **only safe for invite-only deployments** where every authenticated user is trusted to operate the BBC. Do NOT expose to public/uncurated audiences without replacing the shell-out with a typed RPC layer (and tightening per-user RBAC). The leaf doc (`../../distribution/dashboard/CLAUDE.md`) records this as a hard constraint.
2. **All pages are `dynamic = "force-dynamic"`.** No ISR, no client polling — the dashboard re-reads BBC state on every request. Daemons (`bash ../../scripts/refresh-all.sh`) keep that state fresh.
3. **Invite-only signup.** Users cannot sign up unless a row exists in `public.tenant_invitations` matching their `(provider, identifier)`. The Supabase trigger raises `not_invited` if missing. See README §Auth for the SQL to seed invitations.
4. **Three sign-in providers, one cookie session.** GitHub OAuth, Google OAuth, email + password — all go through the same `requireActor()` resolver. New auth-touching code must work for all three.
5. **The dashboard reads; BBC's bash scripts write.** Direct `fs.writeFile` against BBC repo files from this dashboard is forbidden by the leaf rules. Every BBC state change goes through `accept.sh` / `reject.sh` invoked server-side.
6. **No `js-yaml` dependency on purpose.** BBC's YAML is simple frontmatter; we parse it with regex/split. If you find yourself reaching for `js-yaml`, ask whether the file is too complex (and should be simplified) before adding the dep.

## Env vars (deploy + local dev)

| Var | Required | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | yes | from Supabase project |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | yes | the public anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | yes | server-side only |
| `BBC_SECRET_ENCRYPTION_KEY` | yes | `openssl rand -base64 32` — used by `src/lib/encryption.ts` |
| `ANTHROPIC_API_KEY` | optional | tenants can BYOK at `/settings/keys` |
| `BBC_SIGNUP_MODE` | yes | `open` or `invite_only` |
| `BBC_HOSTED_DEMO_MODE` | yes | `true` only on the bbc.tools demo |

Local: `apps/dashboard/.env.local` (gitignored; see `.env.example`). Deploy: Cloudflare dashboard env vars; `wrangler.toml` has comments documenting the same list.

## Reading order for a fresh session in this directory

1. This file.
2. `README.md` — full route list, auth model, hosting prerequisites.
3. `../../distribution/dashboard/CLAUDE.md` — BBC-side governance for this workspace.
4. `../../CLAUDE.md` — Main BBC rules.
