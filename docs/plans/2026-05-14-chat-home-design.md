# Chat-Home Redesign — Design Doc

**Date:** 2026-05-14
**Branch:** `phase-p-trust-made-visible` (extends Step 1b)
**Status:** Design approved, ready for plan
**Inputs:** brainstorming skill, codex consult (session `019e2953-…`), Mobbin chat-interface scan (22 screens, web)

---

## Why this exists

User feedback after Step 1b "One Way In" shipped (23 commits, not pushed): the resulting `/gallery` "feels like a lot" and the whole app feels "undereffort." Specific signal: "some buttons feel not usable but I don't know which."

Audit found the answer has three layers:
- **Layer A — junk shadowing a prior cleanup.** Commits `bd763eb`, `9bb74ac`, `f098043` already migrated `/team`, `/bindings`, `/log`, `/skills`, `/marketplace` into `/settings/*` and `/library` with redirects in `next.config.ts:25-37`. Five top-level route folders re-appeared in the working tree as untracked junk and shadow those redirects. Plus 19MB of design-canvas mockups under `docs/design/library/bbc/project/`.
- **Layer B — nav inconsistencies.** Brand link points to `/queue` not Home. Role-conditional nav means admin/operator/member each see different items. Fake search bar in nav is `aria-hidden`. Workspace switcher has a caret but no implementation.
- **Layer C — `/gallery` overcrowded.** Stacks Ask BBC + search + 8 dept chips + 45-card grid + recent runs all in one screen.

All three get fixed in one pass.

## What this is NOT

- Not Option B from the chat-direction decision (full conversational chat with inline generation). Codex's verdict: that undermines the plan-before-run trust model and recreates the studio engine as a parallel surface. Hard rules in this design prevent drift toward B.
- Not a full nav overhaul or role-permission rethink. Same six primary items, just consistent across roles.
- Not new visual design tokens. Reuse existing `--paper-*` tokens and editorial voice (lowercase eyebrows, serif-italic accents).
- Not changes to `/studio/<role>` or the plan-before-run flow. Step 1b's deep links (`?template=&task=`) keep working unchanged.

## Decisions (locked)

1. **Chat behavior:** conversational routing (Option C). Type a task → either 2-3 candidate templates OR one clarifying question → if clarify answered → candidates → pick → hand off to existing studio plan-before-run. Hard cap: 1 clarification turn. No inline generation, no streaming, no chat history.
2. **Routing:** `/home` becomes the chat-home for member/operator/admin. Viewers route to `/brain` at root. Empty brain still → `/welcome`. Unauth still → `/queue`.
3. **Admin dashboard:** new route `/dashboard` (admin-only, server-gated). Houses the existing 4 widgets (`BrainHealth`, `QueueSummary`, `Loop3Today`, `TeamActivity`). Reached from a role-aware `Dashboard →` link in `AvatarMenu`.
4. **`/gallery`:** just the template grid (search + 8 chips + 45 cards). No Ask BBC box, no recent runs footer — those move to `/home`.
5. **Nav:** same six items for all signed-in roles — Home / Gallery / Memory / Queue / Library / Settings. Brand link → `/home`. Role-permission enforcement moves into the pages themselves (e.g., `/queue` accept/reject is admin-only inside the page), not the nav visibility.
6. **First-use states on `/home`:** (a) happy path = chat + recent runs; (b) no runs = chat + starter pills get visual promotion; (c) no provider key = chat disabled + "Connect a provider" CTA for admins / "Ask your admin" for non-admins.
7. **Junk cleanup (Layer A):** delete all listed files in the same PR.

## Information architecture

### Routes

| Route | Before | After |
|---|---|---|
| `/` | branches by role: admin→/home, op/member→/gallery, viewer→? | unauth→/queue · empty→/welcome · viewer→/brain · everyone else→/home |
| `/home` | admin-only 4-widget dashboard; non-admins bounce to /studio | chat-home for admin/operator/member; viewer doesn't land here |
| `/dashboard` | doesn't exist | **new** — admin-only, the 4 widgets |
| `/gallery` | Ask BBC + search + chips + 45 cards + recent runs | template grid only (search + chips + cards) |
| `/brain` | member/viewer-only memory browser | unchanged; viewers route here from `/` |
| `/studio/<role>` | unchanged | unchanged (Step 1b deep links intact) |
| `/queue`, `/memory`, `/library`, `/settings`, `/welcome`, `/inbox` | unchanged | unchanged |
| `/bindings`, `/graph`, `/log`, `/skills`, `/team` (top-level) | exist as untracked junk shadowing redirects | **deleted** — redirects to `/settings/*` fire correctly again |
| `/marketplace` | tracked page shadowing the `/library` redirect | **deleted** — redirect to `/library` fires |

### Nav (same for all signed-in roles)

```
brand → /home   |  Home  Gallery  Memory  Queue  Library  Settings  |  bell  avatar
```

- Brand link goes to `/home` (today: `/queue`).
- Same six items for admin, operator, member (uniform).
- Viewer: nav shows Home, Gallery, Memory (read-only badge), Library — Queue and Settings hidden since viewer can't act on them.
- Avatar menu adds **`Dashboard →`** for admins only (role plumbed via `AvatarMenuProps`).
- Fake "search memory… ⌘K" placeholder: wire to the existing command palette (`components/command-palette.tsx`).
- Workspace switcher button caret: remove until a real switcher exists.

## Chat surface mechanic

### State machine

```
empty            → user types
typed (< 8 chars)→ submit disabled
typed (≥ 8 chars)→ submit enabled
thinking         → spinner, "BBC is routing…"
candidates       → 2-3 candidate cards, each: glyph + label + rationale + dept tag + arrow
clarify          → one question + 2-4 answer chips + "or refine your task ↑" hint
clarify-answered → re-call routeTask with original task + clarification; transition to candidates
candidates → click → /studio/<role>?template=…&task=… (existing plan-before-run)
error            → inline message, retry button
```

**Hard cap: one clarification turn.** After the user answers the clarifying question, `routeTask` MUST return candidates (the server-side prompt is constrained to commit). No second clarify allowed.

### Server action contract

`apps/dashboard/src/lib/studio/route-task-action.ts` extends to return a discriminated union:

```typescript
type RouteResult =
  | { ok: true; kind: "candidates"; candidates: RoutedTemplate[] }
  | { ok: true; kind: "clarify"; question: string; suggestions: string[] }
  | { ok: false; error: string };
```

The clarify branch fires only on the first call when intent is genuinely ambiguous. Second call (with the user's clarification appended) is forced to return `candidates`.

### Component refactor

- `apps/dashboard/src/app/gallery/AskBbc.tsx` → `apps/dashboard/src/components/chat-home/ChatHome.tsx` (moved out of /gallery since it's the home now).
- `ChatHome` owns the state machine, the clarify-turn budget, and the starter pills.
- `apps/dashboard/src/app/home/page.tsx` becomes the chat-home server page: reads recent runs, role, provider-key status; passes to `ChatHome`.
- Old `HomeDashboard.tsx` and its 4 widgets move from `home/_components/` to `dashboard/_components/` (or stay shared, imported by the new `/dashboard` route).
- Recent-runs query moves from `gallery/page.tsx` to `home/page.tsx` (single query owner — codex flagged this).

### Guardrails (must be in plan, must be in tests)

- No streaming on `/home`.
- No persisted chat threads (each page load = fresh state).
- No inline workflow execution (no buttons that run a generation from chat-home).
- No draft preview on chat-home (drafts only happen post plan-before-run in `/studio/<role>`).
- Max one clarification turn per task.
- Final CTA always navigates to `/studio/<role>?template=&task=`.

## Starter prompts

4-6 hand-picked pills under the input. Curated to show breadth across departments:

- Draft an NDA (Legal)
- Win-back email (Support)
- Board memo (Founder)
- Bug ack (Engineering)
- Blog post draft (Marketing)
- Job description (People)

**Behavior:**
- Click pill = fill the input with the phrase (don't auto-submit; user can edit).
- In `no-runs` state, pills get visual promotion + an eyebrow: "no runs yet · pick a starter".
- In `no-provider-key` state, pills are hidden; only the setup CTA shows.
- These are static for v1. Future: rotate based on tenant's most-used templates.

## Visual / layout

### Layout shape (centered, editorial)

Mobbin references that inform this: **Plane** (chat + widgets stacked), **Claude** (centered greeting, clean serif), **Origin** (serif-italic accent matches BBC voice), **Bard** (grouped suggestion pills), **ChatGPT/Gemini** (single big input baseline).

```
                  big brain company  /  acme
                              ⌄

                   what can we make today?

                Tell BBC what you need.
              ┌──────────────────────────────────┐
              │  e.g. follow up with a customer  │
              │  who churned, or draft an NDA…   │
              │                                  │
              │                          [Ask →] │
              └──────────────────────────────────┘
                    ⌘+enter to send

           [Draft an NDA]  [Win-back email]  [Board memo]
           [Bug ack]       [Blog post]       [Job description]

                ─────────────────────────────────

                       recent runs
              • Win-back email     · 2h ago   →
              • Bug ack            · yesterday →
              • Board memo Q3      · 3d ago   →
```

### Voice + typography

- Headline: existing `.page-title` with serif-italic accent ("tell BBC what you *need*").
- Eyebrow: lowercase mono ("ask bbc · the fast path") — already in `AskBbc.tsx`, reuse.
- Body: `--paper-ink-2` for secondary text, `--paper-muted` for hints.
- No new tokens — work inside the existing paper aesthetic.

### Component reuse

- Existing `ask-bbc`, `ask-row`, `ask-input`, `ask-go`, `ask-cands` CSS classes → reuse for `ChatHome`. May need to rename to `chat-home-*` to break the gallery coupling, but visual rules identical.
- Existing `pill`, `card`, `btn`, `btn-ghost` reused for starter prompts and recent-runs strip.

## Implementation methodology (UI/UX)

During implementation, **always** lean on:

1. **Mobbin (`mcp__mobbin__search_screens`)** — pull live references for any component pattern under iteration (clarify-turn UI, recent-runs strip, no-runs empty state, no-provider-key state, dashboard widgets). Don't ship a screen state without scanning 5-10 references first.
2. **`frontend-design` skill** — invoke when building the actual `ChatHome.tsx`, `Dashboard` page, and the simplified `/gallery`. Use it for the production-grade polish pass (avoiding generic AI aesthetics).
3. **`ui-ux-pro-max` skill** — invoke for layout, spacing, typography, color-system, and interaction-state decisions where multiple options exist.
4. **`make-interfaces-feel-better` skill** — final polish pass: animations, hover states, shadows, tabular numbers, optical alignment, micro-interactions.
5. **`design-shotgun` skill** — invoke if visual direction needs exploration (e.g., the clarify-turn UI shape, the recent-runs strip density).
6. **`design-review` skill** — after the build, run a visual audit against the implemented pages.

These skills get invoked **inside** the implementation plan, not as separate side-tasks. Each plan task that touches UI lists which skill it invokes.

## Auth + role plumbing

- `apps/dashboard/src/app/page.tsx` (root) updated routing:
  ```
  unauth         → /queue
  empty brain    → /welcome
  viewer         → /brain
  any other role → /home
  ```
- `apps/dashboard/src/app/home/page.tsx` no longer admin-only. Accepts member/operator/admin. Viewer arrives here only via direct URL and is redirected to `/brain` server-side.
- `apps/dashboard/src/app/dashboard/page.tsx` (new) calls `requireRole(actor, "admin")`. Non-admins get 403 → redirected back to `/home`.
- `AvatarMenu` accepts `role` in props (currently only `user`). Admin-role renders `Dashboard →` item.
- Existing `requireActor()` and `requireRole()` in `apps/dashboard/src/lib/auth/require-user.ts` are reused; no new auth primitives.

## Data flow

- `home/page.tsx` server component loads in parallel:
  - `requireActor()`
  - `readRecentRuns(actor.tenant_id, { limit: 5 })` (lifted from gallery)
  - `readBindings(actor.tenant_id)` → derive `hasProviderKey` boolean
  - Role from actor for the no-provider-key admin/non-admin branch
- `dashboard/page.tsx` server component loads in parallel (lifted from existing `home/page.tsx`):
  - `requireRole(actor, "admin")`
  - `readBrainHealth`, `readQueueSummary`, `readPendingRecommendations`, `readTeamActivity`
- `gallery/page.tsx` server component loses the `studio_runs` query (moved to `/home`).

## Tests

### Unit (Vitest)

- `route-task-action.test.ts` — extends: returns `candidates` shape, `clarify` shape, second call with clarification forced to `candidates`, error case.
- `ChatHome.test.tsx` — state transitions: empty → typed → thinking → candidates; empty → typed → thinking → clarify → clarify-answered → candidates; max-one-clarify enforced.
- `page-root.test.ts` — root routing: viewer → `/brain`, member/operator/admin → `/home`, empty brain → `/welcome`, unauth → `/queue`.
- `dashboard-page.test.ts` — non-admin gets 403/redirect; admin sees widgets.
- `home-page.test.ts` — no-runs state renders starter prompt eyebrow; no-provider-key admin renders setup CTA; no-provider-key non-admin renders "ask admin"; happy path renders chat + recent runs.
- `gallery-client.test.tsx` — recent-runs prop removed, no longer crashes when absent.

### Visual QA (browse + design-review skill)

- `/home` empty / typed / thinking / clarify / candidates / no-runs / no-provider-key states
- `/dashboard` admin happy path
- `/gallery` simplified (no Ask BBC, no recent runs)
- Viewport: 375 (mobile), 768 (tablet), 1280 (desktop)
- Theme: light + dark
- Brand link goes to `/home` on every page

### Build + type

- `pnpm --filter @bbc/dashboard type-check`
- `pnpm --filter @bbc/dashboard build`
- `pnpm --filter @bbc/dashboard cf:build` (no Cloudflare-incompatible changes)

## Cleanup checklist (Layer A)

Files to delete (untracked, shadow migrations or are dead):

- `apps/dashboard/src/app/bindings/` (whole folder)
- `apps/dashboard/src/app/graph/` (whole folder)
- `apps/dashboard/src/app/log/` (whole folder)
- `apps/dashboard/src/app/skills/` (whole folder)
- `apps/dashboard/src/app/team/` (whole folder)
- `apps/dashboard/src/components/FolderList.tsx`
- `apps/dashboard/src/components/SvgTree.tsx`
- `apps/dashboard/src/components/SvgWorkflow.tsx`
- `apps/dashboard/src/components/theme-toggle.tsx` (verify no inbound refs first)
- `apps/dashboard/src/lib/graph-data.ts`

Files to delete (tracked, contradict migration):

- `apps/dashboard/src/app/marketplace/page.tsx` (next.config redirects `/marketplace → /library` already)
- Check `apps/dashboard/src/app/marketplace/` for any other contents.

Repo hygiene:

- Add `docs/design/library/bbc/project/` to `.gitignore` (19MB of design-canvas mockup files).
- Add `.context/` to `.gitignore` (codex session file).

After cleanup, verify:

- `curl -I http://localhost:3000/bindings` → 308 to `/settings/bindings`
- `curl -I http://localhost:3000/marketplace` → 308 to `/library`
- Same for `/team`, `/tools`, `/log`, `/skills`

## Nav fixes (Layer B)

- `apps/dashboard/src/components/AppNav.tsx`:
  - Brand `Link href="/queue"` → `Link href="/home"` (line ~140).
  - `routesForRole` collapses to a single `PRIMARY_ROUTES` array (Home / Gallery / Memory / Queue / Library / Settings) for admin/operator/member. Viewer gets a `VIEWER_ROUTES` subset (Home, Gallery, Memory, Library — no Queue, no Settings since viewers can't act there).
  - Remove `OPERATOR_ROUTES` and `memberRoutes` helper.
  - Remove the `app-workspace` button caret (or wire to a real workspace switcher — deferred).
  - Replace `aria-hidden` fake search div with a `<button>` that opens the existing command palette (`components/command-palette.tsx`).
- `AvatarMenu`:
  - Accept new `role` prop.
  - If `role === "admin"`, render `<Link href="/dashboard">Dashboard →</Link>` above Settings.

## Stale link sweep (called out by codex)

- `apps/dashboard/src/lib/welcome/demo-brain.ts` — references `/gallery`; check if should be `/home`.
- `apps/dashboard/src/app/welcome/_steps/done-step.tsx` and `seed-demo-button.tsx` — same.
- `apps/dashboard/src/components/command-palette.tsx` — has a dead `/dashboard` route entry; replace with the new admin `/dashboard` route.

## Risks + mitigations

- **Drift toward Option B.** Mitigated by hard guardrails listed in the chat surface section + a `ChatHome.test.tsx` test that asserts no `<form>` submits to a generation endpoint.
- **Empty-brain new tenant lands somewhere unhelpful.** Empty brain still routes to `/welcome` — unchanged. Non-empty brain + zero runs → no-runs state with starter prompts.
- **Viewers losing access.** Viewers route to `/brain` at root and can still read Memory and Library. They lose nothing they had.
- **Step 1b deep links breaking.** `/studio/<role>?template=&task=` URLs are untouched. Tests pin this.
- **Cleanup deletes something used.** Inbound-link grep already done for `/graph`, `/skills`, `/log`, `/team`, `/bindings`; only references are to `/settings/*` versions or to the dead files themselves. `theme-toggle.tsx` and `marketplace/page.tsx` need a final inbound-grep before delete.

## Out of scope (next milestones)

- Workspace switcher (the caret in `app-workspace` button) — requires multi-tenant UI work.
- Inbox-as-nav-item consistency across roles — keep current split for now (bell for all, nav-item for member/viewer).
- Conversational chat history / threads — Option B was explicitly rejected.
- Generation on `/home` — Option B again.
- Dynamic starter prompts based on usage — static list for v1.

## File summary

**New:**
- `apps/dashboard/src/app/dashboard/page.tsx`
- `apps/dashboard/src/app/dashboard/_components/` (move from `home/_components/`)
- `apps/dashboard/src/components/chat-home/ChatHome.tsx`
- `apps/dashboard/src/components/chat-home/ChatHome.test.tsx`
- `apps/dashboard/src/components/chat-home/StarterPrompts.tsx`
- `apps/dashboard/src/components/chat-home/RecentRunsStrip.tsx`

**Edited:**
- `apps/dashboard/src/app/page.tsx` — viewer branch
- `apps/dashboard/src/app/home/page.tsx` — chat-home shell
- `apps/dashboard/src/app/gallery/page.tsx` — remove recent runs
- `apps/dashboard/src/app/gallery/GalleryClient.tsx` — remove Ask BBC, remove recent runs prop
- `apps/dashboard/src/lib/studio/route-task-action.ts` — extend to clarify shape
- `apps/dashboard/src/components/AppNav.tsx` — brand, routes, search, AvatarMenu role
- `apps/dashboard/src/components/command-palette.tsx` — fix `/dashboard` entry
- `apps/dashboard/.gitignore` (or repo root) — add design canvas + `.context/`

**Deleted:** see "Cleanup checklist" above.

---

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | — | — |
| Codex Review | `/codex` consult (Option A/B/C, IA review) | Independent 2nd opinion | 2 | clean | strategic verdict: pick Option C; IA review found viewer-role bug, nav inconsistency, /admin naming, stale-link sweep, hard guardrails on Option C drift |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 0 | — | — |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | — | — |

**CODEX:** consult validated Option C over A/B; surfaced viewer routing break, /admin → /dashboard rename, nav role-conditional split, stale `/gallery` links, hard product guardrails to prevent drift to Option B.

**VERDICT:** strategic direction validated by codex (2 passes). Eng review + design review required before implementation. Mobbin reference scan complete (22 screens, web).
