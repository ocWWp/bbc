# Chat-Home Redesign Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Test-first per `superpowers:test-driven-development`. Each task ends with a verified commit.

**Goal:** Make BBC feel calm. Turn `/home` into a chat-home (conversational routing), move the 4 admin widgets to `/dashboard`, simplify `/gallery`, delete the junk shadowing prior migrations, and unify nav across roles — in one design pass.

**Architecture:** `/home` becomes the chat-home for member/operator/admin (viewers route to `/brain`). Ask BBC moves off `/gallery` into a new `ChatHome` component with a constrained state machine (1-clarify-turn budget, no inline generation, no streaming, no history — codex-enforced guardrails). The existing `routeTask` server action gains a `clarify` discriminated-union branch. The 4 widgets relocate to a new admin-only `/dashboard` route. Junk top-level routes (`/bindings`, `/graph`, `/log`, `/skills`, `/team`, `/marketplace`) get deleted so the already-shipped `next.config.ts` redirects fire correctly.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Vitest, Supabase SSR, server actions. Existing `--paper-*` design tokens + editorial voice from `apps/dashboard/src/app/gallery/AskBbc.tsx`.

**Design doc:** `docs/plans/2026-05-14-chat-home-design.md` — read first for context, decisions, and rationale.

**Branch:** `phase-p-trust-made-visible` (continues from Phase P Step 1b — 23 commits already on branch).

---

## How to use this plan

- Tasks are grouped into **10 phases**. Phases 1-3 are foundational and low-risk. Phases 4-7 are the new build. Phases 8-9 are integration/cleanup. Phase 10 is QA.
- **Phases run in order.** Within a phase, tasks must run sequentially unless explicitly marked parallel-safe.
- Every task ends with a green test run and a commit. No multi-task commits.
- Where a UI task needs design judgment, the task says **"Invoke `<skill>`"**. Use that skill; don't shortcut to your own taste. References must come from Mobbin scans first.
- If a step fails: stop. Don't move forward. Investigate per `superpowers:systematic-debugging`.

---

## Phase 1 — Cleanup (Layer A): delete junk shadowing migrations

Net delta: roughly -2,000 lines + repo hygiene. Zero UX change visible to the user until the redirects start firing — then the dead routes go away cleanly.

### Task 1: Inventory and verify the untracked junk

**Files:** read-only inventory.

**Step 1: Inventory current untracked state**

```bash
cd /Users/ocwwp/Desktop/BB-C
git status --short | grep '^??' | tee /tmp/bbc-untracked-before.txt
```

Expected: `??` entries for `apps/dashboard/src/app/{bindings,graph,log,skills,team}/`, `apps/dashboard/src/components/{FolderList,SvgTree,SvgWorkflow,theme-toggle}.tsx`, `apps/dashboard/src/lib/graph-data.ts`, `docs/design/library/bbc/project/`, `.context/`.

**Step 2: Verify next.config has the redirects these files would shadow**

```bash
grep -E '/team|/bindings|/tools|/log|/skills|/marketplace|/api-keys' apps/dashboard/next.config.ts
```

Expected: 7 redirect lines (already shipped in commit `f098043`). If a redirect is missing, STOP and report — design assumed all 7 exist.

**Step 3: Inbound-link grep — ensure deletion is safe**

```bash
for p in bindings graph log skills team; do
  echo "=== /$p inbound (excluding the file itself and tests) ==="
  grep -rn "\"/${p}\"\|'/${p}'\|href=\"/${p}\"" apps/dashboard/src --include='*.ts' --include='*.tsx' 2>/dev/null \
    | grep -v "/app/${p}/" | grep -v "\.test\."
done
```

Expected outputs:
- `/bindings`: only references to `/settings/bindings` (path contains `/settings/`). If any bare `/bindings` reference exists outside, note for Task 3.
- `/graph`: zero or only refs from `linear.ts` (connector) and `SvgTree`/`FolderList`/`SvgWorkflow` (also being deleted). If anything else points to `/graph`, STOP.
- `/log`: only `queue/page.tsx` and `team/actions.ts` — both stale; will be updated in Phase 9.
- `/skills`: only `/graph/page.tsx` (also being deleted).
- `/team`: only `team/actions.ts` (which is in the folder being deleted).

**Step 4: Inbound-link grep for `marketplace` and `theme-toggle`**

```bash
grep -rn "\"/marketplace\"\|'/marketplace'\|href=\"/marketplace\"" apps/dashboard/src --include='*.ts' --include='*.tsx' | grep -v "/app/marketplace/"
grep -rn "theme-toggle" apps/dashboard/src --include='*.ts' --include='*.tsx' | grep -v "components/theme-toggle.tsx"
```

Expected: `/marketplace` referenced from `InboxBell` icon, `LibraryClient`, `AppNav`, `command-palette` (these need updating in Phase 9 — note for now); `theme-toggle` should have zero or only self-references (an `AvatarMenu` already includes inline theme segment). If `theme-toggle` is imported by a tracked file, do NOT delete it in Task 3.

**Step 5: No commit — this is read-only.** Output the four greps' findings as a single comment in your work log.

---

### Task 2: Delete untracked dead route folders + support components

**Files:**
- Delete: `apps/dashboard/src/app/bindings/`
- Delete: `apps/dashboard/src/app/graph/`
- Delete: `apps/dashboard/src/app/log/`
- Delete: `apps/dashboard/src/app/skills/`
- Delete: `apps/dashboard/src/app/team/`
- Delete: `apps/dashboard/src/components/FolderList.tsx`
- Delete: `apps/dashboard/src/components/SvgTree.tsx`
- Delete: `apps/dashboard/src/components/SvgWorkflow.tsx`
- Delete: `apps/dashboard/src/lib/graph-data.ts`
- Conditional delete: `apps/dashboard/src/components/theme-toggle.tsx` (only if Task 1 Step 4 showed zero tracked inbound refs)

**Step 1: Delete the folders**

```bash
cd /Users/ocwwp/Desktop/BB-C
rm -rf apps/dashboard/src/app/bindings \
       apps/dashboard/src/app/graph \
       apps/dashboard/src/app/log \
       apps/dashboard/src/app/skills \
       apps/dashboard/src/app/team
```

**Step 2: Delete the support components**

```bash
rm -f apps/dashboard/src/components/FolderList.tsx \
      apps/dashboard/src/components/SvgTree.tsx \
      apps/dashboard/src/components/SvgWorkflow.tsx \
      apps/dashboard/src/lib/graph-data.ts
```

If Task 1 Step 4 showed zero inbound refs to `theme-toggle.tsx`:

```bash
rm -f apps/dashboard/src/components/theme-toggle.tsx
```

**Step 3: Verify nothing tracked got deleted**

```bash
git status --short
```

Expected: zero lines starting with ` D` (deleted-tracked). Only `??` entries removed. If anything tracked shows deleted, STOP and `git restore` the file.

**Step 4: Type-check still passes**

```bash
pnpm --filter @bbc/dashboard type-check
```

Expected: zero errors. If errors appear, an inbound ref was missed in Task 1 — fix it now or `git restore` the deletions.

**Step 5: No commit yet — these files weren't tracked, so there's nothing to commit. Move to Task 3.**

---

### Task 3: Delete `marketplace/page.tsx` so the `/marketplace → /library` redirect fires

**Files:**
- Delete: `apps/dashboard/src/app/marketplace/page.tsx`
- Modify if needed: `apps/dashboard/src/app/marketplace/` (the whole folder if only contains `page.tsx`)

**Step 1: Inspect the folder**

```bash
ls apps/dashboard/src/app/marketplace/
```

If only `page.tsx`, delete the whole folder. Otherwise, only delete `page.tsx`.

**Step 2: Delete**

```bash
git rm apps/dashboard/src/app/marketplace/page.tsx
# If the folder is empty after, remove it:
rmdir apps/dashboard/src/app/marketplace 2>/dev/null || true
```

**Step 3: Verify redirect would fire**

Static check — read `apps/dashboard/next.config.ts:33` and confirm `{ source: "/marketplace", destination: "/library", permanent: true }` is present.

**Step 4: Type-check + build**

```bash
pnpm --filter @bbc/dashboard type-check
pnpm --filter @bbc/dashboard build 2>&1 | tail -20
```

Expected: both succeed. Build output should NOT list `/marketplace` as a generated route.

**Step 5: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
chore: delete marketplace page so /library redirect fires

next.config.ts:33 has had a permanent /marketplace -> /library redirect
since commit f098043, but apps/dashboard/src/app/marketplace/page.tsx
sat on top and shadowed it. Delete the page so the redirect actually
applies.

Inbound /marketplace references in InboxBell, LibraryClient, AppNav,
and command-palette will be updated in a later cleanup task.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Add design canvas + `.context/` to `.gitignore`

**Files:**
- Modify: `.gitignore` (repo root) or create `apps/dashboard/.gitignore`

**Step 1: Locate existing gitignore**

```bash
ls -la .gitignore apps/dashboard/.gitignore 2>/dev/null
```

Use whichever exists; if both, prefer repo root.

**Step 2: Append the two new ignore patterns**

Use the Edit tool. Open `.gitignore` (or apps/dashboard/.gitignore if that's where similar entries already live) and append:

```
# Design canvas mockups (Claude Design port reference, 19MB) — not app code
docs/design/library/bbc/project/

# Codex session ID cache (per-machine state, see /codex skill)
.context/
```

**Step 3: Verify the patterns work**

```bash
git status --short docs/design/library/bbc/project/ .context/
```

Expected: both paths no longer appear. (They were `??` entries before.)

**Step 4: Stage the gitignore change**

```bash
git status --short
```

Expected: one modified `.gitignore` line.

**Step 5: Commit**

```bash
git add .gitignore
git commit -m "$(cat <<'EOF'
chore: gitignore design-canvas mockups and codex session cache

docs/design/library/bbc/project/ is 19MB of jsx/css/html mockups
from the Claude Design port (May 12) — reference material, not
app code. Keep on disk but stop showing as untracked.

.context/ is the codex skill's per-machine session-id store.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase 2 — Auth + routing foundation

### Task 5: Add viewer branch to root routing

**Files:**
- Modify: `apps/dashboard/src/app/page.tsx`
- Create: `apps/dashboard/src/app/page.test.ts`

**Step 1: Write the failing test**

Create `apps/dashboard/src/app/page.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/navigation", () => ({ redirect: vi.fn((to: string) => { throw new Error(`REDIRECT:${to}`); }) }));
vi.mock("@/lib/auth/require-user", () => ({ requireActor: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ getSupabaseServerClient: vi.fn() }));

import Root from "./page";
import { requireActor } from "@/lib/auth/require-user";
import { getSupabaseServerClient } from "@/lib/supabase/server";

function mockSupabaseCount(count: number) {
  const eq = vi.fn().mockResolvedValue({ count });
  const select = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ select }));
  (getSupabaseServerClient as any).mockResolvedValue({ from });
}

describe("root /", () => {
  beforeEach(() => vi.clearAllMocks());

  it("redirects unauth → /queue", async () => {
    (requireActor as any).mockResolvedValue({ ok: false });
    await expect(Root()).rejects.toThrow("REDIRECT:/queue");
  });

  it("redirects empty-brain → /welcome", async () => {
    (requireActor as any).mockResolvedValue({ ok: true, actor: { tenant_id: "t1", role: "member" } });
    mockSupabaseCount(0);
    await expect(Root()).rejects.toThrow("REDIRECT:/welcome");
  });

  it("redirects viewer → /brain", async () => {
    (requireActor as any).mockResolvedValue({ ok: true, actor: { tenant_id: "t1", role: "viewer" } });
    mockSupabaseCount(5);
    await expect(Root()).rejects.toThrow("REDIRECT:/brain");
  });

  it("redirects member → /home", async () => {
    (requireActor as any).mockResolvedValue({ ok: true, actor: { tenant_id: "t1", role: "member" } });
    mockSupabaseCount(5);
    await expect(Root()).rejects.toThrow("REDIRECT:/home");
  });

  it("redirects admin → /home", async () => {
    (requireActor as any).mockResolvedValue({ ok: true, actor: { tenant_id: "t1", role: "admin" } });
    mockSupabaseCount(5);
    await expect(Root()).rejects.toThrow("REDIRECT:/home");
  });

  it("redirects operator → /home", async () => {
    (requireActor as any).mockResolvedValue({ ok: true, actor: { tenant_id: "t1", role: "operator" } });
    mockSupabaseCount(5);
    await expect(Root()).rejects.toThrow("REDIRECT:/home");
  });
});
```

**Step 2: Run — expect failures on viewer + member + operator branches**

```bash
pnpm --filter @bbc/dashboard test page.test.ts 2>&1 | tail -30
```

Expected: viewer redirects to `/gallery` not `/brain` (FAIL); member redirects to `/gallery` not `/home` (FAIL); admin already passes.

**Step 3: Update `apps/dashboard/src/app/page.tsx`**

Replace the entire body of `Root()` with:

```typescript
export default async function Root() {
  const a = await requireActor();
  if (!a.ok) redirect("/queue");

  const supabase = await getSupabaseServerClient();
  const { count } = await supabase
    .from("memory_files")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", a.actor.tenant_id);
  if ((count ?? 0) === 0) redirect("/welcome");

  // Viewers can't write — send them to the read-only memory browser.
  if (a.actor.role === "viewer") redirect("/brain");

  // Everyone else (member, operator, admin) lands on the chat-home.
  redirect("/home");
}
```

**Step 4: Run tests — expect all six to pass**

```bash
pnpm --filter @bbc/dashboard test page.test.ts 2>&1 | tail -15
```

Expected: 6 passed.

**Step 5: Commit**

```bash
git add apps/dashboard/src/app/page.tsx apps/dashboard/src/app/page.test.ts
git commit -m "$(cat <<'EOF'
feat(routing): unify root '/' → /home for member/operator/admin, viewer → /brain

Phase P Step 2 routing foundation. Today: admin → /home, operator/
member → /gallery, viewer → /gallery (broken — they can't act there).
After: any non-empty-brain actor goes to /home; viewer routes to
/brain (read-only). One less role-branch, viewers stop landing on a
chat surface they can't use.

Test: apps/dashboard/src/app/page.test.ts covers all 6 branches
(unauth, empty, viewer, member, operator, admin).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Remove non-admin bounce from `/home`

**Files:**
- Modify: `apps/dashboard/src/app/home/page.tsx`
- Create or modify: `apps/dashboard/src/app/home/page.test.ts`

**Step 1: Write the failing test**

Create `apps/dashboard/src/app/home/page.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/navigation", () => ({ redirect: vi.fn((to: string) => { throw new Error(`REDIRECT:${to}`); }) }));
vi.mock("@/lib/auth/require-user", () => ({ requireActor: vi.fn() }));

import HomePage from "./page";
import { requireActor } from "@/lib/auth/require-user";

describe("/home", () => {
  beforeEach(() => vi.clearAllMocks());

  it("redirects unauth → /auth/signin?callbackUrl=/home", async () => {
    (requireActor as any).mockResolvedValue({ ok: false });
    await expect(HomePage()).rejects.toThrow("REDIRECT:/auth/signin?callbackUrl=/home");
  });

  it("renders for admin (does not bounce)", async () => {
    (requireActor as any).mockResolvedValue({ ok: true, actor: { tenant_id: "t1", role: "admin", tenant_slug: "acme" } });
    // The page now renders ChatHome — we don't unit-test the JSX here, just verify no redirect throws.
    await expect(HomePage()).resolves.toBeDefined();
  });

  it("renders for member (does NOT bounce to studio)", async () => {
    (requireActor as any).mockResolvedValue({ ok: true, actor: { tenant_id: "t1", role: "member", tenant_slug: "acme", templateSlug: "marketing" } });
    await expect(HomePage()).resolves.toBeDefined();
  });

  it("renders for operator (does not bounce)", async () => {
    (requireActor as any).mockResolvedValue({ ok: true, actor: { tenant_id: "t1", role: "operator", tenant_slug: "acme" } });
    await expect(HomePage()).resolves.toBeDefined();
  });

  it("redirects viewer → /brain (defense in depth — root '/' should catch first)", async () => {
    (requireActor as any).mockResolvedValue({ ok: true, actor: { tenant_id: "t1", role: "viewer", tenant_slug: "acme" } });
    await expect(HomePage()).rejects.toThrow("REDIRECT:/brain");
  });
});
```

**Step 2: Run — expect FAIL (current /home bounces non-admins)**

```bash
pnpm --filter @bbc/dashboard test home/page.test.ts 2>&1 | tail -30
```

Expected: the `member` and `operator` cases throw `REDIRECT:/studio/<slug>`; the `viewer` case currently does the same and we need it to be `/brain`.

**Step 3: Update `apps/dashboard/src/app/home/page.tsx`**

This task ONLY removes the role-bounce. The chat-home content (ChatHome component, recent runs, provider-key check) lands in Phase 6 Task 19. For now, render a minimal placeholder so the test passes and the page works.

```typescript
import { redirect } from "next/navigation";
import { requireActor } from "@/lib/auth/require-user";

export const dynamic = "force-dynamic";
export const metadata = { title: "Home · BBC" };

export default async function HomePage() {
  const a = await requireActor();
  if (!a.ok) redirect("/auth/signin?callbackUrl=/home");

  // Defense in depth: root '/' should route viewers to /brain first,
  // but if a viewer hits /home directly, send them there.
  if (a.actor.role === "viewer") redirect("/brain");

  // Phase 6 Task 19 will replace this with the ChatHome render.
  return (
    <div className="container page">
      <h1 className="page-title">Home (placeholder — chat-home lands in Phase 6)</h1>
    </div>
  );
}
```

This intentionally tears out the existing 4-widget dashboard. Those widgets resurface on `/dashboard` in Phase 3. Note: any direct visit to `/home` between this commit and Phase 6 sees a placeholder; that's intentional — it forces us to ship the dashboard route first.

**Step 4: Run tests — expect 5 passes**

```bash
pnpm --filter @bbc/dashboard test home/page.test.ts 2>&1 | tail -15
```

**Step 5: Commit**

```bash
git add apps/dashboard/src/app/home/page.tsx apps/dashboard/src/app/home/page.test.ts
git commit -m "$(cat <<'EOF'
feat(routing): remove non-admin bounce from /home, gate viewer to /brain

Phase P Step 2: /home is no longer admin-only. Member/operator/admin
all render here. Viewer is bounced to /brain as defense in depth
(root '/' already routes them there).

The 4-widget dashboard previously rendered here is removed; it moves
to /dashboard in Phase 3. /home renders a placeholder until the
ChatHome component lands in Phase 6.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase 3 — `/dashboard` new admin-only route

### Task 7: Scaffold `/dashboard` route with admin gate

**Files:**
- Create: `apps/dashboard/src/app/dashboard/page.tsx`
- Create: `apps/dashboard/src/app/dashboard/page.test.ts`
- Move: `apps/dashboard/src/app/home/_components/` → `apps/dashboard/src/app/dashboard/_components/`

**Step 1: Move the 4 widget components**

```bash
mkdir -p apps/dashboard/src/app/dashboard/_components
git mv apps/dashboard/src/app/home/_components/BrainHealth.tsx \
       apps/dashboard/src/app/home/_components/QueueSummary.tsx \
       apps/dashboard/src/app/home/_components/Loop3Today.tsx \
       apps/dashboard/src/app/home/_components/TeamActivity.tsx \
       apps/dashboard/src/app/home/_components/HomeDashboard.tsx \
       apps/dashboard/src/app/dashboard/_components/
```

**Step 2: Rename `HomeDashboard.tsx` → `AdminDashboard.tsx`** and update the exported component name accordingly. Use the Edit tool to update the component name and any imports inside the moved files. Run:

```bash
git mv apps/dashboard/src/app/dashboard/_components/HomeDashboard.tsx \
       apps/dashboard/src/app/dashboard/_components/AdminDashboard.tsx
```

Then Edit `AdminDashboard.tsx` to rename the `HomeDashboard` function and `HomeDashboardProps` type to `AdminDashboard` / `AdminDashboardProps`. Update the page subtitle from "today — at a glance" if you want a different framing (keep it for now — design doc says reuse).

**Step 3: Write the failing test**

Create `apps/dashboard/src/app/dashboard/page.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/navigation", () => ({ redirect: vi.fn((to: string) => { throw new Error(`REDIRECT:${to}`); }) }));
vi.mock("@/lib/auth/require-user", () => ({ requireActor: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ getSupabaseServerClient: vi.fn() }));
vi.mock("@/lib/home/read-brain-health", () => ({ readBrainHealth: vi.fn().mockResolvedValue({}) }));
vi.mock("@/lib/home/read-queue-summary", () => ({ readQueueSummary: vi.fn().mockResolvedValue({}) }));
vi.mock("@/lib/loop3/read-recommendations", () => ({ readPendingRecommendations: vi.fn().mockResolvedValue([]) }));
vi.mock("@/lib/home/read-team-activity", () => ({ readTeamActivity: vi.fn().mockResolvedValue({}) }));

import DashboardPage from "./page";
import { requireActor } from "@/lib/auth/require-user";

describe("/dashboard", () => {
  beforeEach(() => vi.clearAllMocks());

  it("redirects unauth → /auth/signin", async () => {
    (requireActor as any).mockResolvedValue({ ok: false });
    await expect(DashboardPage()).rejects.toThrow(/REDIRECT:\/auth\/signin/);
  });

  it("redirects non-admin (operator) → /home", async () => {
    (requireActor as any).mockResolvedValue({ ok: true, actor: { tenant_id: "t1", role: "operator", tenant_slug: "acme" } });
    await expect(DashboardPage()).rejects.toThrow("REDIRECT:/home");
  });

  it("redirects non-admin (member) → /home", async () => {
    (requireActor as any).mockResolvedValue({ ok: true, actor: { tenant_id: "t1", role: "member", tenant_slug: "acme" } });
    await expect(DashboardPage()).rejects.toThrow("REDIRECT:/home");
  });

  it("redirects non-admin (viewer) → /brain", async () => {
    (requireActor as any).mockResolvedValue({ ok: true, actor: { tenant_id: "t1", role: "viewer", tenant_slug: "acme" } });
    await expect(DashboardPage()).rejects.toThrow("REDIRECT:/brain");
  });

  it("renders for admin", async () => {
    (requireActor as any).mockResolvedValue({ ok: true, actor: { tenant_id: "t1", role: "admin", tenant_slug: "acme" } });
    await expect(DashboardPage()).resolves.toBeDefined();
  });
});
```

**Step 4: Create `apps/dashboard/src/app/dashboard/page.tsx`**

```typescript
import { redirect } from "next/navigation";
import { requireActor } from "@/lib/auth/require-user";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { readBrainHealth } from "@/lib/home/read-brain-health";
import { readQueueSummary } from "@/lib/home/read-queue-summary";
import { readTeamActivity } from "@/lib/home/read-team-activity";
import { readPendingRecommendations } from "@/lib/loop3/read-recommendations";
import { AdminDashboard } from "./_components/AdminDashboard";

export const dynamic = "force-dynamic";
export const metadata = { title: "Dashboard · BBC" };

export default async function DashboardPage() {
  const a = await requireActor();
  if (!a.ok) redirect("/auth/signin?callbackUrl=/dashboard");

  // Viewers go to /brain (read-only memory). Non-admin acting roles
  // bounce to /home (chat-home).
  if (a.actor.role === "viewer") redirect("/brain");
  if (a.actor.role !== "admin") redirect("/home");

  const supabase = await getSupabaseServerClient();
  const [brain, queue, loop3, activity] = await Promise.all([
    readBrainHealth(a.actor.tenant_id),
    readQueueSummary(a.actor.tenant_id),
    readPendingRecommendations(supabase),
    readTeamActivity(a.actor.tenant_id, { days: 7 }),
  ]);

  return (
    <AdminDashboard
      tenantSlug={a.actor.tenant_slug}
      brain={brain}
      queue={queue}
      loop3={loop3}
      activity={activity}
    />
  );
}
```

**Step 5: Run tests, type-check, commit**

```bash
pnpm --filter @bbc/dashboard test dashboard/page.test.ts 2>&1 | tail -15
pnpm --filter @bbc/dashboard type-check
```

Both must pass.

```bash
git add apps/dashboard/src/app/dashboard
git rm -r apps/dashboard/src/app/home/_components
git commit -m "$(cat <<'EOF'
feat(dashboard): new admin-only /dashboard route housing the 4 widgets

Phase P Step 2: the brain-health / queue-summary / loop-3 / team-
activity widgets that used to squat at /home (admin-only) move to
their own /dashboard route. Codex flagged that /home was wearing two
hats (admin status surface + role-default landing) — splitting them
fixes both.

/dashboard server-gates with requireRole-style logic: viewer→/brain,
member/operator→/home, admin renders. Component renamed
HomeDashboard→AdminDashboard accordingly.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase 4 — Server action: clarify discriminated union

### Task 8: Extend `RouteResult` type with `clarify` variant

**Files:**
- Modify: `apps/dashboard/src/lib/studio/route-task-action.ts`
- Modify: `apps/dashboard/src/lib/studio/route-task-action.test.ts` (or create if missing)

**Step 1: Read the current `route-task-action.ts`** to understand the prompt structure, what the LLM is being asked, and how candidates are validated.

```bash
cat apps/dashboard/src/lib/studio/route-task-action.ts
```

Note the existing `RouteTaskResult` type and how the LLM call is structured.

**Step 2: Write the failing test (TDD)**

Add test cases to `route-task-action.test.ts`:

```typescript
import { describe, it, expect, vi } from "vitest";
import { routeTask } from "./route-task-action";

// Mock the LLM call layer (whichever module provides it — adjust import).
// The mock returns whatever shape the prompt produces.

describe("routeTask — clarify branch", () => {
  it("returns clarify shape when intent is genuinely ambiguous", async () => {
    // Mock LLM to return a clarification request
    // ... (depends on existing test setup — match it)
    const res = await routeTask("help");  // very short / ambiguous
    if (res.ok) {
      expect(res.kind).toBe("clarify");
      if (res.kind === "clarify") {
        expect(res.question).toBeTruthy();
        expect(res.suggestions.length).toBeGreaterThan(0);
        expect(res.suggestions.length).toBeLessThanOrEqual(4);
      }
    }
  });

  it("returns candidates after a clarification is provided", async () => {
    const res = await routeTask("help", { clarification: "writing an email to a customer" });
    if (res.ok) {
      expect(res.kind).toBe("candidates");
      if (res.kind === "candidates") {
        expect(res.candidates.length).toBeGreaterThan(0);
        expect(res.candidates.length).toBeLessThanOrEqual(3);
      }
    }
  });

  it("with clarification always returns candidates (never clarify again)", async () => {
    // Force LLM into a state where it might want to clarify again — assert we coerce to candidates
    const res = await routeTask("help", { clarification: "still vague" });
    if (res.ok) {
      expect(res.kind).toBe("candidates");
    }
  });
});

describe("routeTask — candidates branch (existing behavior)", () => {
  it("returns candidates for clear tasks", async () => {
    const res = await routeTask("write an NDA for a contractor");
    if (res.ok) {
      expect(res.kind).toBe("candidates");
    }
  });
});
```

**Step 3: Update the type and signature**

In `route-task-action.ts`:

```typescript
export type RoutedTemplate = {
  templateId: string;
  owningRole: string;
  label: string;
  rationale: string;
};

export type ClarifyRequest = {
  question: string;
  suggestions: string[];  // 2-4 short answer chips
};

export type RouteResult =
  | { ok: true; kind: "candidates"; candidates: RoutedTemplate[] }
  | { ok: true; kind: "clarify"; question: string; suggestions: string[] }
  | { ok: false; error: string };

export async function routeTask(
  task: string,
  opts?: { clarification?: string }
): Promise<RouteResult> {
  // ... existing validation ...

  const hasClarification = opts?.clarification && opts.clarification.length > 0;
  const llmInstruction = hasClarification
    ? `... MUST return candidates, do not request further clarification ...`
    : `... If intent is ambiguous, you may return a single clarifying question with 2-4 suggested answers; otherwise return candidates ...`;

  // Update the LLM prompt accordingly. When hasClarification, force JSON schema
  // to only allow candidates. When !hasClarification, allow either shape.

  // Parse the LLM output into either shape; validate; return.
}
```

The implementation detail (LLM call) depends on the existing pattern — match it. The contract is what matters:
- First call (no clarification): may return either `candidates` or `clarify`.
- Second call (clarification present): forced to `candidates`.

**Step 4: Run tests**

```bash
pnpm --filter @bbc/dashboard test route-task-action.test.ts 2>&1 | tail -20
```

Expected: all pass. If existing tests break because the return type changed from `{ok, candidates}` to discriminated union, update existing callers in `AskBbc.tsx` to handle the new shape — but defer the UI change to Phase 5 Task 11. For now, the easiest path: in existing `AskBbc.tsx` callsite, treat `kind === "clarify"` as `setError("...")` so the old UI still functions during the transition.

**Step 5: Commit**

```bash
git add apps/dashboard/src/lib/studio/route-task-action.ts \
        apps/dashboard/src/lib/studio/route-task-action.test.ts \
        apps/dashboard/src/app/gallery/AskBbc.tsx
git commit -m "$(cat <<'EOF'
feat(routeTask): add clarify discriminated-union branch

routeTask now returns either candidates (2-3 templates) OR a single
clarifying question with 2-4 suggested answers, when intent is
ambiguous. When called with opts.clarification, it is forced to
return candidates — guaranteeing max one clarify turn per task
(codex's hard guardrail to prevent drift toward Option B).

Existing /gallery AskBbc surfaces clarify as an error message for now;
the conversational-routing UI in ChatHome (Phase 5) handles it
properly.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase 5 — `ChatHome` component

### Task 9: Pull Mobbin references for the clarify-turn UI

**Files:** read-only research; no commit.

Use the `mcp__mobbin__search_screens` tool. Run TWO searches:

**Search 1:**
- Query: `AI chat clarifying question with answer chips or pill suggestions`
- Platform: `web`
- Limit: 8

**Search 2:**
- Query: `assistant clarifying follow-up question minimalist editorial design`
- Platform: `web`
- Limit: 8

Skim outputs. Save 3-5 reference screen IDs to your work log along with one-line notes on what to steal from each (layout, chip style, transition, copy tone). These inform Task 10's component build.

Then invoke the `ui-ux-pro-max` skill via the `Skill` tool with: "Design the clarify-turn UI for BBC's chat-home. Constraints: 1 clarifying question max, 2-4 chip answers, editorial voice (lowercase eyebrows, serif-italic accents in body copy, `--paper-*` tokens), must visually distinguish from the candidates-list state, must not feel like a chat thread (each load is fresh — no history). Reference Mobbin screens [list IDs from search]. Give layout, spacing, typography, and interaction-state spec."

Capture the spec from `ui-ux-pro-max` in your work log. Move to Task 10 with it.

---

### Task 10: Build `ChatHome` component with state machine

**Files:**
- Create: `apps/dashboard/src/components/chat-home/ChatHome.tsx`
- Create: `apps/dashboard/src/components/chat-home/ChatHome.test.tsx`

**Step 1: Write the failing state-machine test**

`ChatHome.test.tsx`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import ChatHome from "./ChatHome";

vi.mock("@/lib/studio/route-task-action", () => ({
  routeTask: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

import { routeTask } from "@/lib/studio/route-task-action";

const defaultProps = {
  hasProviderKey: true,
  recentRunsCount: 3,
};

describe("ChatHome state machine", () => {
  beforeEach(() => vi.clearAllMocks());

  it("starts in empty state with submit disabled", () => {
    render(<ChatHome {...defaultProps} />);
    expect(screen.getByRole("button", { name: /ask bbc/i })).toBeDisabled();
  });

  it("enables submit once task is long enough", () => {
    render(<ChatHome {...defaultProps} />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "write an NDA for a contractor" } });
    expect(screen.getByRole("button", { name: /ask bbc/i })).toBeEnabled();
  });

  it("renders candidates when routeTask returns kind=candidates", async () => {
    (routeTask as any).mockResolvedValue({
      ok: true, kind: "candidates",
      candidates: [{ templateId: "t1", owningRole: "legal", label: "NDA", rationale: "for contractors" }],
    });
    render(<ChatHome {...defaultProps} />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "write an NDA for a contractor" } });
    fireEvent.click(screen.getByRole("button", { name: /ask bbc/i }));
    await waitFor(() => expect(screen.getByText("NDA")).toBeInTheDocument());
  });

  it("renders clarify when routeTask returns kind=clarify", async () => {
    (routeTask as any).mockResolvedValue({
      ok: true, kind: "clarify",
      question: "Which department is this for?",
      suggestions: ["Sales", "Support", "Engineering"],
    });
    render(<ChatHome {...defaultProps} />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "draft a follow-up" } });
    fireEvent.click(screen.getByRole("button", { name: /ask bbc/i }));
    await waitFor(() => expect(screen.getByText("Which department is this for?")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Sales" })).toBeInTheDocument();
  });

  it("max 1 clarify turn: clicking a suggestion forces candidates", async () => {
    (routeTask as any)
      .mockResolvedValueOnce({ ok: true, kind: "clarify", question: "Which dept?", suggestions: ["Sales", "Support"] })
      .mockResolvedValueOnce({ ok: true, kind: "candidates", candidates: [{ templateId: "t1", owningRole: "support", label: "Reply", rationale: "ok" }] });
    render(<ChatHome {...defaultProps} />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "draft a follow-up" } });
    fireEvent.click(screen.getByRole("button", { name: /ask bbc/i }));
    await waitFor(() => screen.getByText("Which dept?"));
    fireEvent.click(screen.getByRole("button", { name: "Sales" }));
    // Second call must have been with clarification
    await waitFor(() => expect(routeTask).toHaveBeenNthCalledWith(2, "draft a follow-up", { clarification: "Sales" }));
    await waitFor(() => screen.getByText("Reply"));
  });

  it("never renders a second clarify even if server tries to send one", async () => {
    // Simulate a misbehaving server — we should still coerce to error or empty candidates, never show clarify twice.
    (routeTask as any)
      .mockResolvedValueOnce({ ok: true, kind: "clarify", question: "Q1?", suggestions: ["a", "b"] })
      .mockResolvedValueOnce({ ok: true, kind: "clarify", question: "Q2?", suggestions: ["c", "d"] });
    render(<ChatHome {...defaultProps} />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "ambiguous task" } });
    fireEvent.click(screen.getByRole("button", { name: /ask bbc/i }));
    await waitFor(() => screen.getByText("Q1?"));
    fireEvent.click(screen.getByRole("button", { name: "a" }));
    await waitFor(() => {
      // We should NOT see Q2 — client refuses to render a second clarify
      expect(screen.queryByText("Q2?")).not.toBeInTheDocument();
    });
  });

  it("shows error inline on routeTask failure", async () => {
    (routeTask as any).mockResolvedValue({ ok: false, error: "service unavailable" });
    render(<ChatHome {...defaultProps} />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "anything" } });
    fireEvent.click(screen.getByRole("button", { name: /ask bbc/i }));
    await waitFor(() => screen.getByText(/service unavailable/i));
  });
});
```

**Step 2: Run tests — all should fail (no component yet)**

```bash
pnpm --filter @bbc/dashboard test ChatHome.test.tsx 2>&1 | tail -15
```

**Step 3: Build the component**

Create `apps/dashboard/src/components/chat-home/ChatHome.tsx` per the `ui-ux-pro-max` spec from Task 9. State machine:

```typescript
"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { routeTask, type RoutedTemplate } from "@/lib/studio/route-task-action";
import { TASK_MIN_LEN } from "@/lib/studio/task-limits";

type Stage =
  | { kind: "idle" }
  | { kind: "thinking" }
  | { kind: "candidates"; candidates: RoutedTemplate[] }
  | { kind: "clarify"; question: string; suggestions: string[]; task: string }
  | { kind: "error"; message: string };

type Props = {
  hasProviderKey: boolean;
  recentRunsCount: number;
};

export default function ChatHome({ hasProviderKey, recentRunsCount }: Props) {
  const router = useRouter();
  const [task, setTask] = useState("");
  const [stage, setStage] = useState<Stage>({ kind: "idle" });
  const [hasClarified, setHasClarified] = useState(false);
  const [pending, start] = useTransition();

  const submit = (taskText: string, clarification?: string) => {
    const t = taskText.trim();
    if (t.length < TASK_MIN_LEN) {
      setStage({ kind: "error", message: "Describe what you need in a few more words." });
      return;
    }
    setStage({ kind: "thinking" });
    start(async () => {
      const res = await routeTask(t, clarification ? { clarification } : undefined);
      if (!res.ok) {
        setStage({ kind: "error", message: res.error });
        return;
      }
      if (res.kind === "clarify") {
        // Hard guardrail: refuse a second clarify even if the server sends one.
        if (hasClarified) {
          setStage({ kind: "error", message: "Couldn't narrow this down — try rephrasing." });
          return;
        }
        setStage({ kind: "clarify", question: res.question, suggestions: res.suggestions, task: t });
        return;
      }
      setStage({ kind: "candidates", candidates: res.candidates });
    });
  };

  const onClarifyClick = (suggestion: string) => {
    if (stage.kind !== "clarify") return;
    setHasClarified(true);
    submit(stage.task, suggestion);
  };

  const onCandidateClick = (c: RoutedTemplate) => {
    const taskToCarry = stage.kind === "clarify" ? stage.task : task;
    router.push(`/studio/${c.owningRole}?template=${encodeURIComponent(c.templateId)}&task=${encodeURIComponent(taskToCarry.trim())}`);
  };

  const onKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      submit(task);
    }
  };

  // ... JSX (per ui-ux-pro-max spec from Task 9):
  //  - eyebrow "ask bbc · the fast path"
  //  - h1 with serif-italic accent
  //  - textarea + submit button
  //  - state-conditional render: thinking / clarify / candidates / error
  //  - StarterPrompts below input (Task 11)
  //  - no-runs eyebrow promotion when recentRunsCount === 0
  //  - no-provider-key gate when !hasProviderKey
}
```

**Step 4: Run tests until green**

```bash
pnpm --filter @bbc/dashboard test ChatHome.test.tsx 2>&1 | tail -15
```

Iterate on the component until all 7 tests pass.

**Step 5: Commit**

```bash
git add apps/dashboard/src/components/chat-home/ChatHome.tsx \
        apps/dashboard/src/components/chat-home/ChatHome.test.tsx
git commit -m "$(cat <<'EOF'
feat(chat-home): ChatHome component with constrained state machine

Conversational-routing UI per Phase P design doc. State machine:
idle → thinking → (candidates | clarify | error). Max 1 clarify
turn enforced client-side; server-side coercion in routeTask is
the primary guardrail, this is defense in depth.

No generation, no streaming, no thread history — each page load
starts fresh. Final CTA always navigates to /studio/<role> deep
link with task carried through.

Built with reference layouts from Mobbin (8 chat-clarify screens
scanned, see Task 9 work log) and ui-ux-pro-max design spec.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 11: Build `StarterPrompts` sub-component

**Files:**
- Create: `apps/dashboard/src/components/chat-home/StarterPrompts.tsx`
- Create: `apps/dashboard/src/components/chat-home/StarterPrompts.test.tsx`

**Step 1: Define the static starter list**

```typescript
// apps/dashboard/src/components/chat-home/StarterPrompts.tsx
export const STARTER_PROMPTS = [
  { label: "Draft an NDA",      task: "draft an NDA for a contractor",         role: "legal" },
  { label: "Win-back email",    task: "write a win-back email for a churned customer", role: "support" },
  { label: "Board memo",        task: "draft a board update memo",             role: "founder" },
  { label: "Bug ack",           task: "acknowledge a bug report from a customer", role: "engineering" },
  { label: "Blog post",         task: "draft a blog post about our latest feature", role: "marketing" },
  { label: "Job description",   task: "write a job description for a senior engineer", role: "people" },
] as const;
```

**Step 2: Write the failing test**

```typescript
// StarterPrompts.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import StarterPrompts, { STARTER_PROMPTS } from "./StarterPrompts";

describe("StarterPrompts", () => {
  it("renders all 6 prompts as buttons", () => {
    render(<StarterPrompts onPick={vi.fn()} promoted={false} />);
    expect(screen.getAllByRole("button")).toHaveLength(STARTER_PROMPTS.length);
  });

  it("calls onPick with the task text when a pill is clicked", () => {
    const onPick = vi.fn();
    render(<StarterPrompts onPick={onPick} promoted={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Draft an NDA" }));
    expect(onPick).toHaveBeenCalledWith("draft an NDA for a contractor");
  });

  it("shows the 'no runs yet' eyebrow when promoted=true", () => {
    render(<StarterPrompts onPick={vi.fn()} promoted={true} />);
    expect(screen.getByText(/no runs yet/i)).toBeInTheDocument();
  });

  it("does not show the eyebrow when promoted=false", () => {
    render(<StarterPrompts onPick={vi.fn()} promoted={false} />);
    expect(screen.queryByText(/no runs yet/i)).not.toBeInTheDocument();
  });
});
```

**Step 3: Build the component**

```typescript
"use client";

type Props = {
  onPick: (task: string) => void;
  promoted: boolean;  // visually promote when no runs yet
};

export default function StarterPrompts({ onPick, promoted }: Props) {
  return (
    <div className={`chat-home-starters ${promoted ? "is-promoted" : ""}`}>
      {promoted && (
        <span className="eyebrow">
          <span className="dot" aria-hidden /> no runs yet · pick a starter
        </span>
      )}
      <div className="starter-pills">
        {STARTER_PROMPTS.map((p) => (
          <button key={p.label} type="button" className="starter-pill" onClick={() => onPick(p.task)}>
            {p.label}
          </button>
        ))}
      </div>
    </div>
  );
}
```

**Step 4: Wire into `ChatHome.tsx`** — import `StarterPrompts`, render below the input, pass `onPick={setTask}` and `promoted={recentRunsCount === 0}`.

**Step 5: Run tests, commit**

```bash
pnpm --filter @bbc/dashboard test chat-home 2>&1 | tail -15
```

```bash
git add apps/dashboard/src/components/chat-home/
git commit -m "feat(chat-home): starter prompts with no-runs promotion state

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 12: Build `RecentRunsStrip` sub-component

**Files:**
- Create: `apps/dashboard/src/components/chat-home/RecentRunsStrip.tsx`
- Create: `apps/dashboard/src/components/chat-home/RecentRunsStrip.test.tsx`

Mirror the existing recent-runs footer in `GalleryClient.tsx:230-273` but extract it as a standalone component. Same `RecentRun` type. Limit to 5 (was 8). Show eyebrow "recent runs" only when items present.

Steps:
1. Write failing test (renders nothing when empty; renders N rows when populated; each row links to `/studio/runs/:id`).
2. Build component.
3. Wire into ChatHome.
4. Tests pass.
5. Commit.

---

## Phase 6 — `/home` chat-home page

### Task 13: Wire `/home/page.tsx` to render `ChatHome` with real data

**Files:**
- Modify: `apps/dashboard/src/app/home/page.tsx`
- Update: `apps/dashboard/src/app/home/page.test.ts` (extend earlier test)

**Step 1: Identify the bindings/provider-key check**

```bash
grep -rn "readBindings\|hasProviderKey\|llm-provider" apps/dashboard/src/lib --include='*.ts' | head -10
```

Find the existing helper that determines whether the tenant has an LLM-provider binding. Use it.

**Step 2: Identify the recent-runs query**

Lift the query from `apps/dashboard/src/app/gallery/page.tsx`. Keep the same shape, return type `RecentRun[]`.

**Step 3: Update `/home/page.tsx`**

```typescript
import { redirect } from "next/navigation";
import { requireActor } from "@/lib/auth/require-user";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import ChatHome from "@/components/chat-home/ChatHome";
import { readRecentRuns } from "@/lib/studio/read-recent-runs";  // extract helper
import { readHasProviderKey } from "@/lib/bindings/read-has-provider-key";  // adjust path

export const dynamic = "force-dynamic";
export const metadata = { title: "Home · BBC" };

export default async function HomePage() {
  const a = await requireActor();
  if (!a.ok) redirect("/auth/signin?callbackUrl=/home");
  if (a.actor.role === "viewer") redirect("/brain");

  const [recentRuns, hasProviderKey] = await Promise.all([
    readRecentRuns(a.actor.tenant_id, { limit: 5 }),
    readHasProviderKey(a.actor.tenant_id),
  ]);

  return (
    <ChatHome
      role={a.actor.role}
      hasProviderKey={hasProviderKey}
      recentRuns={recentRuns}
    />
  );
}
```

**Step 4: Extend the `home/page.test.ts`** to mock `readRecentRuns` and `readHasProviderKey`. Add tests:
- Admin with provider key + runs → renders ChatHome with both
- Admin without provider key → ChatHome receives `hasProviderKey: false`
- Member with empty runs → ChatHome receives `recentRuns: []`

**Step 5: Run tests, type-check, commit**

---

### Task 14: First-use state — no provider key

**Files:**
- Modify: `apps/dashboard/src/components/chat-home/ChatHome.tsx`
- Modify: `apps/dashboard/src/components/chat-home/ChatHome.test.tsx`

**Step 1: Add tests**

```typescript
it("admin without provider key sees Connect a provider CTA", () => {
  render(<ChatHome {...defaultProps} role="admin" hasProviderKey={false} />);
  expect(screen.getByRole("link", { name: /connect a provider/i })).toBeInTheDocument();
  expect(screen.queryByRole("textbox")).not.toBeInTheDocument(); // input hidden
});

it("non-admin without provider key sees Ask admin copy", () => {
  render(<ChatHome {...defaultProps} role="member" hasProviderKey={false} />);
  expect(screen.getByText(/ask your admin/i)).toBeInTheDocument();
  expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
});

it("no starter pills shown when provider key missing", () => {
  render(<ChatHome {...defaultProps} role="admin" hasProviderKey={false} />);
  expect(screen.queryByRole("button", { name: /draft an NDA/i })).not.toBeInTheDocument();
});
```

**Step 2: Add the no-provider-key branch to `ChatHome` JSX**

```typescript
if (!hasProviderKey) {
  return (
    <div className="chat-home no-provider-key">
      <h1 className="page-title">No provider key yet.</h1>
      {role === "admin" ? (
        <Link href="/settings/api-keys" className="btn primary">Connect a provider →</Link>
      ) : (
        <p>Ask your admin to connect a provider so you can ask BBC.</p>
      )}
    </div>
  );
}
```

**Step 3: Tests, commit.**

---

### Task 15: No-runs promotion is already wired

The `StarterPrompts` component already promotes itself when `recentRunsCount === 0`. Verify this works end-to-end by adding a `/home` integration test that mocks `readRecentRuns` to return `[]` and asserts the "no runs yet · pick a starter" eyebrow appears. Run, commit.

---

## Phase 7 — `/gallery` simplify

### Task 16: Remove `AskBbc` and recent runs from `GalleryClient`

**Files:**
- Modify: `apps/dashboard/src/app/gallery/GalleryClient.tsx`
- Modify: `apps/dashboard/src/app/gallery/page.tsx`
- Modify: `apps/dashboard/src/app/gallery/GalleryClient.test.tsx`
- Delete: `apps/dashboard/src/app/gallery/AskBbc.tsx` (component moved to `chat-home/`)
- Delete: `apps/dashboard/src/app/gallery/AskBbc.test.tsx`

**Step 1: Update the test first**

In `GalleryClient.test.tsx`, remove the `recentRuns` prop from every render call and the "recent runs across all studios" assertions. Add an assertion that the page does NOT contain the Ask BBC eyebrow.

**Step 2: Run — expect FAIL (component still renders these)**

**Step 3: Update `GalleryClient.tsx`**

- Remove the `import AskBbc from "./AskBbc"` line.
- Remove the `<AskBbc />` render.
- Remove the `recentRuns` prop from `Props`.
- Remove the entire "recent runs across all studios" `<section>` (lines ~230-273).
- Remove the `RecentRun` export type (move to `chat-home/RecentRunsStrip.tsx`).

**Step 4: Update `gallery/page.tsx`**

- Remove the recent-runs Supabase query (moved to `/home`).
- Stop passing `recentRuns` to `GalleryClient`.

**Step 5: Delete `AskBbc.tsx` and `AskBbc.test.tsx`**

```bash
git rm apps/dashboard/src/app/gallery/AskBbc.tsx \
       apps/dashboard/src/app/gallery/AskBbc.test.tsx
```

**Step 6: Tests, type-check, commit**

```bash
pnpm --filter @bbc/dashboard test gallery 2>&1 | tail -15
pnpm --filter @bbc/dashboard type-check
```

```bash
git add apps/dashboard/src/app/gallery/
git commit -m "$(cat <<'EOF'
refactor(gallery): /gallery is now just the template grid

Ask BBC moved to /home (chat-home). Recent runs moved to /home.
/gallery now does one job — browse templates — so it can be calm.

Deep links (?template=&task=) from chat-home + template cards still
land in /studio/<role>?template=&task=  (Step 1b deep-link contract
intact).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase 8 — Nav fixes (Layer B)

### Task 17: Brand link → `/home`, collapse role-conditional routes

**Files:**
- Modify: `apps/dashboard/src/components/AppNav.tsx`
- Modify: `apps/dashboard/src/components/AppNav.test.tsx` (create if missing)

**Step 1: Write tests for the new nav behavior**

```typescript
// AppNav.test.tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { AppNav } from "./AppNav";

const baseProps = {
  pendingCount: 0,
  user: { label: "Alice", avatar: null, initial: "A" },
  workspace: { name: "acme", role: "admin", templateSlug: null },
};

describe("AppNav", () => {
  it("brand link points to /home", () => {
    render(<AppNav {...baseProps} />);
    const brand = screen.getByRole("link", { name: /big brain company/i });
    expect(brand).toHaveAttribute("href", "/home");
  });

  it.each(["admin", "operator", "member"] as const)("shows the same 6 primary items for %s", (role) => {
    render(<AppNav {...baseProps} workspace={{ ...baseProps.workspace, role }} />);
    expect(screen.getByRole("link", { name: "Home" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Gallery" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Memory" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Queue" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Library" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Settings" })).toBeInTheDocument();
  });

  it("shows the viewer nav subset (no Queue, no Settings)", () => {
    render(<AppNav {...baseProps} workspace={{ ...baseProps.workspace, role: "viewer" }} />);
    expect(screen.getByRole("link", { name: "Home" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Gallery" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Memory" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Library" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Queue" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Settings" })).not.toBeInTheDocument();
  });

  it("admin sees Dashboard link in avatar menu", async () => {
    // ... open avatar menu, assert /dashboard link with role-aware visibility
  });
});
```

**Step 2: Run — expect failures**

**Step 3: Update `AppNav.tsx`**

- Line ~140: change `<Link href="/queue" className="brand">` to `<Link href="/home" className="brand">`.
- Replace `ADMIN_ROUTES`, `OPERATOR_ROUTES`, `memberRoutes()` with:

```typescript
const PRIMARY_ROUTES: ReadonlyArray<Route> = [
  HOME_ROUTE, GALLERY_ROUTE, MEMORY_ROUTE, QUEUE_ROUTE, LIBRARY_ROUTE, SETTINGS_ROUTE,
];
const VIEWER_ROUTES: ReadonlyArray<Route> = [
  HOME_ROUTE, GALLERY_ROUTE, MEMORY_ROUTE, LIBRARY_ROUTE,
];

function routesForRole(role: string | null): ReadonlyArray<Route> {
  return role === "viewer" ? VIEWER_ROUTES : PRIMARY_ROUTES;
}
```

Update the call site at line ~135 to drop the `templateSlug` arg.

**Step 4: Pass `role` to `AvatarMenu`**

```typescript
// In AvatarMenuProps:
type AvatarMenuProps = { user: ...; role: string | null };

// In AvatarMenu pop:
{role === "admin" && (
  <Link href="/dashboard" className="avatar-menu-item" role="menuitem" onClick={() => setOpen(false)}>
    <span>Dashboard</span>
    <span className="mono hint">/dashboard</span>
  </Link>
)}
```

Pass `role={workspace?.role ?? null}` from `AppNav`.

**Step 5: Tests, commit**

---

### Task 18: Wire fake "search memory…" to command palette

**Files:**
- Modify: `apps/dashboard/src/components/AppNav.tsx`
- Read: `apps/dashboard/src/components/command-palette.tsx`

**Step 1:** Read `command-palette.tsx` to find how it's opened — there's likely a global keyboard shortcut (⌘K) or a context. Confirm it has an exported opener.

**Step 2:** Replace the `<div className="app-search" aria-hidden>` (lines ~172-175) with a `<button>` that triggers the command palette opener. If no programmatic opener exists, expose one (small refactor inside `command-palette.tsx`).

**Step 3:** Visual: keep the same styling — placeholder text "search memory…" + ⌘K kbd hint, but now it's an interactive `<button>`.

**Step 4:** Add a test that the button is clickable and the palette opens (mock the opener).

**Step 5:** Commit.

---

### Task 19: Remove workspace switcher caret (until real switcher exists)

**Files:**
- Modify: `apps/dashboard/src/components/AppNav.tsx`

**Step 1:** The `<button className="app-workspace">` element renders `<span className="ws-caret">▾</span>` implying it's clickable. There's no implementation. Remove the caret span and change the `<button>` to a `<div>` (or `<span>`) — it's purely informational until a switcher exists.

**Step 2:** Update tests if they rely on the button.

**Step 3:** Commit.

---

## Phase 9 — Stale link sweep

### Task 20: Fix `/dashboard` reference in command palette

**Files:**
- Modify: `apps/dashboard/src/components/command-palette.tsx`

**Step 1:** Find the existing `/dashboard` entry. Either re-point at the new `/dashboard` route or remove it if it's no longer the right concept.

**Step 2:** Add new entries to command palette: `/home` (Home), `/dashboard` (Dashboard — admin only).

**Step 3:** Test, commit.

---

### Task 21: Sweep `/gallery` references in welcome + demo

**Files:**
- Modify: `apps/dashboard/src/lib/welcome/demo-brain.ts`
- Modify: `apps/dashboard/src/app/welcome/_steps/done-step.tsx`
- Modify: `apps/dashboard/src/app/welcome/_steps/seed-demo-button.tsx`

**Step 1:** Grep:

```bash
grep -n "/gallery" apps/dashboard/src/lib/welcome/demo-brain.ts \
                   apps/dashboard/src/app/welcome/_steps/done-step.tsx \
                   apps/dashboard/src/app/welcome/_steps/seed-demo-button.tsx
```

**Step 2:** For each: decide whether the user should land on `/home` (most likely after welcome) or `/gallery` (if specifically directing to template browse). Per design: post-welcome → `/home` so the new tenant immediately sees the chat-home with starter prompts.

**Step 3:** Edit each file to point at `/home` where appropriate.

**Step 4:** Test (if welcome flow has tests), commit.

---

### Task 22: Sweep `/marketplace` references

**Files:**
- Modify: `apps/dashboard/src/app/inbox/_components/Inbox.tsx`
- Modify: `apps/dashboard/src/app/library/_components/LibraryClient.tsx`
- Modify: `apps/dashboard/src/components/command-palette.tsx`
- Modify: `apps/dashboard/src/components/AppNav.tsx` (the LIBRARY_ROUTE match function)

**Step 1:** Grep:

```bash
grep -rn "/marketplace" apps/dashboard/src --include='*.ts' --include='*.tsx'
```

**Step 2:** For each callsite, change `/marketplace` to `/library` (the migration target).

**Step 3:** In `AppNav.tsx`, the `LIBRARY_ROUTE.match` function currently matches both `/library` and `/marketplace` — keep this for now (the redirect still lands users on `/library`, but if a stale link triggers `/marketplace`, the nav highlight should still work).

**Step 4:** Test, commit.

---

## Phase 10 — Polish + QA

### Task 23: Invoke `make-interfaces-feel-better` polish pass

Use the `Skill` tool: `make-interfaces-feel-better`.

Scope the polish to:
- `ChatHome` — input focus state, submit button hover, candidate-card hover, clarify chip hover/press
- `StarterPrompts` — pill hover, optical alignment
- `RecentRunsStrip` — row hover, tabular numbers for timestamps
- `AdminDashboard` (on `/dashboard`) — micro-adjustments only; widgets shouldn't change much
- `/gallery` simplified grid — verify still feels intentional after removing two sections

Capture before/after notes per surface. Commit polish in one focused commit per component.

---

### Task 24: Browse visual QA across states + viewports + themes

Run the `browse` skill. For each of these surfaces, capture:
- `/home` in empty / typed / thinking / clarify / candidates / no-runs / no-provider-key (admin) / no-provider-key (non-admin)
- `/dashboard` admin happy path
- `/gallery` simplified (post-Phase-7)

Viewports: `375x812`, `768x1024`, `1280x720`.
Themes: light, dark.

For each combination, take an annotated screenshot. Save to `/tmp/bbc-qa/`. Surface anything broken (overflow, contrast, weird wrap, dark-mode regression) to the user.

---

### Task 25: Invoke `design-review` skill for retrospective audit

After visual QA, invoke `design-review` skill. Pass it the screenshots from Task 24. Capture and act on findings. Commit any fixes.

---

### Task 26: Final integration check

**Step 1:** Full test suite

```bash
pnpm --filter @bbc/dashboard test 2>&1 | tail -20
```

Expected: all green. The pre-existing 591/591 from Step 1b should still pass; new tests from this plan add ~25-30 tests.

**Step 2:** Build

```bash
pnpm --filter @bbc/dashboard build 2>&1 | tail -10
```

**Step 3:** Cloudflare build (deploys to prod)

```bash
pnpm --filter @bbc/dashboard cf:build 2>&1 | tail -10
```

**Step 4:** Type-check

```bash
pnpm --filter @bbc/dashboard type-check
```

**Step 5:** Codex review gate

Use `codex` skill, run a code review against `main`:

```bash
codex review
```

Expected: GATE: PASS, no `[P1]` findings. Fix any P1, re-run.

---

## Done definition

- All 26 tasks complete with green tests and clean commits.
- `pnpm --filter @bbc/dashboard test` shows 591 (pre-existing) + new tests, all passing.
- `pnpm --filter @bbc/dashboard build` succeeds.
- `pnpm --filter @bbc/dashboard cf:build` succeeds.
- Codex review GATE: PASS.
- Browse QA screenshots reviewed, no regressions flagged.
- `/home` renders the chat-home; `/dashboard` houses the 4 widgets; `/gallery` is just the grid; viewer routes to `/brain`.
- Junk routes deleted; redirects fire correctly.
- Nav uniform across acting roles; brand link → `/home`; search wired to command palette.

## After done

- User decides: extend PR #9 (push these new commits onto `phase-p-trust-made-visible`) OR split onto a new branch.
- Update `MEMORY.md` handoff entry to mark the chat-home redesign shipped.
- Consider running `/document-release` to update docs.

---

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | — | — |
| Codex Review | `/codex` consult | Independent 2nd opinion (on design) | 2 | clean | strategic verdict Option C; IA review found viewer routing, /admin → /dashboard, nav role-flat, stale links, hard guardrails |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 0 | — | — |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | — | — |

**CODEX:** consult validated Option C; surfaced viewer routing, /admin → /dashboard rename, nav role-flat, stale `/gallery` links, hard product guardrails baked into Phase 5.

**VERDICT:** strategic direction codex-validated. Eng review (Vitest + Cloudflare Workers + Supabase server actions) and design review (Mobbin + ui-ux-pro-max + make-interfaces-feel-better) baked into Phase 5, 9, 10 tasks. Plan ready for execution.
