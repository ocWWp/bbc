# /ops Operator Cockpit Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Ship `/ops` — a single operator-cockpit page consolidating "needs my attention" actions and a compact system snapshot. Replace `/queue` in nav. Demote `/library/diagnostics`. No new backend lifecycle, all data sources exist today.

**Architecture:** Server-rendered Next.js page at `app/ops/page.tsx` that calls one aggregator reader (`lib/ops/read-ops-state.ts`). Reader fans out parallel Supabase queries against existing tables (`queue_items`, `memory_files`, `external_accounts`, `tenant_connectors`, `webhook_dead_letters`). Page is `dynamic = "force-dynamic"` — no client polling, re-reads on every request, same pattern as every other dashboard page. Queue accept/reject actions reuse `app/queue/actions.ts` verbatim (no duplication).

**Tech Stack:** Next.js 16 App Router, React 19 server components, Supabase (RLS-scoped), Vitest.

**Design source of truth:** `docs/plans/2026-05-17-ops-page-design.md` (committed at `7876824`).

**Permission model (locked):** `/ops` is gated to **operator+** (same as today's `/queue`, per ADR-0012). Members continue to use `/brain`. Admin sees an additional DLQ row inside Needs Attention; everything else is shared with operators.

---

## Phase A — Aggregator reader (`read-ops-state.ts`)

Pure data layer with tests. No UI work in this phase.

### Task A1: Create the reader's type contract

**Files:**
- Create: `apps/dashboard/src/lib/ops/read-ops-state.ts`

**Step 1: Write the type-only skeleton**

```ts
// /ops aggregator. Reads all data sources used by the cockpit page in one
// place so the page component stays declarative. Every field maps to a row
// or section in docs/plans/2026-05-17-ops-page-design.md.

import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

export type OpsPendingProposal = {
  id: string;            // queue_items.id (uuid)
  proposal_id: string;   // queue_items.proposal_id (text slug)
  change_kind: string;
  summary: string;       // frontmatter.diff_summary
  target_file: string;   // frontmatter.target_file
  target_layer: string;  // frontmatter.target_layer
  created_at: string;
};

export type OpsSnapshot = {
  queue: { pending: number; lastAcceptedAt: string | null };
  memory: { files: number; lastUpdatedAt: string | null };
  providers: { configured: number; lastTestedAt: string | null };
  ingest: { connectors: number; lastSyncAt: string | null };
};

export type OpsAttention = {
  pendingProposals: OpsPendingProposal[];
  missingProviderKeys: string[]; // provider names expected by bindings.yaml but missing in external_accounts
  failedConnectors: { connector_id: string; status: string }[]; // last_sync_status in {error, auth_expired}
  dlqCount: number;              // admin section only; 0 for non-admin callers
};

export type OpsState = {
  attention: OpsAttention;
  snapshot: OpsSnapshot;
};

export async function readOpsState(
  supabase: SupabaseClient,
  options: { tenantId: string; isAdmin: boolean; expectedProviders: string[] }
): Promise<OpsState> {
  throw new Error("not implemented");
}
```

**Step 2: Commit the contract**

```bash
git add apps/dashboard/src/lib/ops/read-ops-state.ts
git commit -m "feat(ops): scaffold read-ops-state aggregator contract"
```

---

### Task A2: Write failing tests for the reader

**Files:**
- Create: `apps/dashboard/src/lib/ops/read-ops-state.test.ts`

**Step 1: Write the tests**

Mirror the pattern in `apps/dashboard/src/lib/connectors/read-diagnostics.test.ts` — pass a fake Supabase client. Cover:

1. **Empty tenant** — every table returns `[]` → returns zero counts everywhere, null timestamps, empty arrays. No error.
2. **Pending proposals** — 3 rows in `queue_items` with `status='pending'` → `attention.pendingProposals.length === 3`, ordered newest-first, frontmatter fields surfaced.
3. **Snapshot last-accepted timestamp** — 1 row `status='accepted'` with `updated_at='2026-05-17T10:00:00Z'` → `snapshot.queue.lastAcceptedAt` equals that timestamp.
4. **Missing provider keys** — `expectedProviders = ["anthropic","openai"]`, `external_accounts` has 1 row for "anthropic" → `attention.missingProviderKeys === ["openai"]`.
5. **Failed connectors** — `tenant_connectors` row with `last_sync_status='auth_expired'` → present in `failedConnectors`. Status `'ok'` row → absent.
6. **DLQ admin-only** — `isAdmin: false` → `attention.dlqCount === 0` even if `webhook_dead_letters` has rows. `isAdmin: true` → returns the real count.
7. **Memory snapshot** — `memory_files` has 5 rows with various `updated_at` → `snapshot.memory.files === 5`, `lastUpdatedAt` is the max.

Use the fake-client harness pattern from `read-diagnostics.test.ts`. If the existing helper isn't generic, write a small inline one (≤30 lines).

**Step 2: Run tests to verify they fail**

Run:

```bash
cd apps/dashboard && pnpm vitest run src/lib/ops/read-ops-state.test.ts
```

Expected: all tests fail with "not implemented" or similar.

**Step 3: Commit**

```bash
git add apps/dashboard/src/lib/ops/read-ops-state.test.ts
git commit -m "test(ops): add failing tests for read-ops-state"
```

---

### Task A3: Implement the reader

**Files:**
- Modify: `apps/dashboard/src/lib/ops/read-ops-state.ts`

**Step 1: Implement**

Replace the `throw new Error` body with a real implementation:

```ts
export async function readOpsState(
  supabase: SupabaseClient,
  options: { tenantId: string; isAdmin: boolean; expectedProviders: string[] }
): Promise<OpsState> {
  const { tenantId, isAdmin, expectedProviders } = options;

  const [
    pendingRes,
    lastAcceptedRes,
    memoryCountRes,
    memoryLastRes,
    extAcctRes,
    extAcctLastTestRes,
    connectorsRes,
    connectorsLastSyncRes,
    failedConnectorsRes,
    dlqCountRes,
  ] = await Promise.all([
    supabase
      .from("queue_items")
      .select("id, proposal_id, frontmatter, created_at", { count: "exact" })
      .eq("tenant_id", tenantId)
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("queue_items")
      .select("updated_at")
      .eq("tenant_id", tenantId)
      .eq("status", "accepted")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("memory_files")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId),
    supabase
      .from("memory_files")
      .select("updated_at")
      .eq("tenant_id", tenantId)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("external_accounts")
      .select("provider", { count: "exact" })
      .eq("tenant_id", tenantId),
    supabase
      .from("external_accounts")
      .select("last_tested_at")
      .eq("tenant_id", tenantId)
      .order("last_tested_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("tenant_connectors")
      .select("connector_id, last_sync_status", { count: "exact" })
      .eq("tenant_id", tenantId)
      .eq("active", true)
      .is("uninstalled_at", null),
    supabase
      .from("tenant_connectors")
      .select("last_sync_at")
      .eq("tenant_id", tenantId)
      .eq("active", true)
      .is("uninstalled_at", null)
      .order("last_sync_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("tenant_connectors")
      .select("connector_id, last_sync_status")
      .eq("tenant_id", tenantId)
      .eq("active", true)
      .is("uninstalled_at", null)
      .in("last_sync_status", ["error", "auth_expired"]),
    isAdmin
      ? supabase
          .from("webhook_dead_letters")
          .select("id", { count: "exact", head: true })
          .eq("tenant_id", tenantId)
      : Promise.resolve({ count: 0, error: null, data: null }),
  ]);

  type ProposalRow = {
    id: string;
    proposal_id: string;
    frontmatter: Record<string, unknown> | null;
    created_at: string;
  };

  const pendingProposals: OpsPendingProposal[] = (pendingRes.data ?? []).map(
    (r: ProposalRow) => {
      const fm = r.frontmatter ?? {};
      const get = (k: string, fallback = "") => {
        const v = (fm as Record<string, unknown>)[k];
        return typeof v === "string" ? v : fallback;
      };
      return {
        id: r.id,
        proposal_id: r.proposal_id,
        change_kind: get("change_kind", "edit"),
        summary: get("diff_summary"),
        target_file: get("target_file"),
        target_layer: get("target_layer", "main"),
        created_at: r.created_at,
      };
    }
  );

  const presentProviders = new Set(
    ((extAcctRes.data ?? []) as { provider: string }[]).map((r) => r.provider)
  );
  const missingProviderKeys = expectedProviders.filter(
    (p) => !presentProviders.has(p)
  );

  const failedConnectors = (failedConnectorsRes.data ?? []) as {
    connector_id: string;
    last_sync_status: string;
  }[];

  return {
    attention: {
      pendingProposals,
      missingProviderKeys,
      failedConnectors: failedConnectors.map((c) => ({
        connector_id: c.connector_id,
        status: c.last_sync_status,
      })),
      dlqCount: dlqCountRes.count ?? 0,
    },
    snapshot: {
      queue: {
        pending: pendingRes.count ?? 0,
        lastAcceptedAt: (lastAcceptedRes.data as { updated_at: string } | null)
          ?.updated_at ?? null,
      },
      memory: {
        files: memoryCountRes.count ?? 0,
        lastUpdatedAt: (memoryLastRes.data as { updated_at: string } | null)
          ?.updated_at ?? null,
      },
      providers: {
        configured: extAcctRes.count ?? 0,
        lastTestedAt: (extAcctLastTestRes.data as { last_tested_at: string } | null)
          ?.last_tested_at ?? null,
      },
      ingest: {
        connectors: connectorsRes.count ?? 0,
        lastSyncAt: (connectorsLastSyncRes.data as { last_sync_at: string } | null)
          ?.last_sync_at ?? null,
      },
    },
  };
}
```

**Step 2: Verify tests pass**

Run:

```bash
cd apps/dashboard && pnpm vitest run src/lib/ops/read-ops-state.test.ts
```

Expected: all 7 tests pass.

**Step 3: Verify the full test suite still passes**

```bash
cd apps/dashboard && pnpm test
```

Expected: 801+ tests pass (no regressions).

**Step 4: Commit**

```bash
git add apps/dashboard/src/lib/ops/read-ops-state.ts
git commit -m "feat(ops): implement read-ops-state aggregator"
```

---

## Phase B — Page skeleton (read-only)

Renders all data with honest empty states. **No** accept/reject yet (that's Phase C).

### Task B1: Helper — get expected providers from bindings

**Files:**
- Read first: `apps/dashboard/src/app/library/_providers.server.ts` (existing pattern)
- Create: `apps/dashboard/src/lib/ops/expected-providers.ts`

**Step 1: Write the helper**

`_providers.server.ts` already parses `memory/ops/providers/*.yaml` and `bindings.yaml`. Extract or reuse the binding-list to produce `string[]` of provider names that this tenant is *expected* to have keys for.

```ts
// Returns the list of provider names the current tenant is expected to have
// API keys for, derived from memory/ops/bindings.yaml. Used by /ops to flag
// missing provider keys. Reuses the file-mode reader; in DB-mode this should
// read from the equivalent table (TODO when DB-mode lands for bindings).

import "server-only";
import { loadRealProviders } from "@/app/library/_providers.server";

export async function getExpectedProviders(): Promise<string[]> {
  const providers = await loadRealProviders();
  return providers
    .filter((p) => p.connected) // "bound" in bindings.yaml
    .map((p) => p.name.toLowerCase());
}
```

If `loadRealProviders()` doesn't expose what we need cleanly, write a thin wrapper rather than refactoring the existing file.

**Step 2: Verify it compiles**

```bash
cd apps/dashboard && pnpm type-check
```

Expected: no errors.

**Step 3: Commit**

```bash
git add apps/dashboard/src/lib/ops/expected-providers.ts
git commit -m "feat(ops): add getExpectedProviders helper"
```

---

### Task B2: /ops page skeleton — server component

**Files:**
- Create: `apps/dashboard/src/app/ops/page.tsx`

**Step 1: Write the page**

Pattern: read `apps/dashboard/src/app/queue/page.tsx` for the `requireActor` + `requireRole("operator")` + `WorkspaceCrumb` + dynamic export pattern. Match its visual language (`.container.page`, `.page-head`, `.card`, `.pill`).

```tsx
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireActor, requireRole } from "@/lib/auth/require-user";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { readOpsState } from "@/lib/ops/read-ops-state";
import { getExpectedProviders } from "@/lib/ops/expected-providers";
import { WorkspaceCrumb } from "@/components/WorkspaceCrumb";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Ops · BBC" };

function relTime(iso: string | null): string {
  if (!iso) return "—";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "—";
  const diff = Math.max(0, Date.now() - t);
  const min = Math.floor(diff / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  return new Date(t).toISOString().slice(0, 10);
}

export default async function OpsPage() {
  const a = await requireActor();
  if (!a.ok) redirect(`/auth/signin?callbackUrl=${encodeURIComponent("/ops")}`);
  const r = requireRole(a.actor, "operator");
  if (!r.ok) redirect("/brain");

  const supabase = await getSupabaseServerClient();
  const expectedProviders = await getExpectedProviders();
  const state = await readOpsState(supabase, {
    tenantId: a.actor.tenant_id,
    isAdmin: a.actor.role === "admin",
    expectedProviders,
  });

  const { attention, snapshot } = state;
  const nothingNeeded =
    attention.pendingProposals.length === 0 &&
    attention.missingProviderKeys.length === 0 &&
    attention.failedConnectors.length === 0 &&
    attention.dlqCount === 0;

  return (
    <div className="container page">
      <header className="page-head">
        <div className="page-head-left">
          <div className="page-crumb">
            <WorkspaceCrumb tenantSlug={a.actor.tenant_slug} />
            <span className="sep">/</span>
            <span className="current">ops</span>
          </div>
          <h1 className="page-title">
            ops <span className="serif">cockpit</span>
          </h1>
          <p className="page-blurb">
            What needs your attention, and how the three loops are doing.
          </p>
        </div>
      </header>

      <section className="ops-section">
        <h2 className="section-eyebrow">needs attention</h2>
        {nothingNeeded ? (
          <div className="empty">
            <p>Nothing needs your attention.</p>
          </div>
        ) : (
          <div className="card card-pad ops-attention">
            {attention.pendingProposals.length > 0 && (
              <div className="ops-attention-row">
                <span className="pill warn">{attention.pendingProposals.length}</span>
                <span>
                  proposal{attention.pendingProposals.length === 1 ? "" : "s"} awaiting review
                </span>
                {/* Inline accept/reject lands in Phase C. */}
              </div>
            )}
            {attention.missingProviderKeys.length > 0 && (
              <div className="ops-attention-row">
                <span className="pill warn">{attention.missingProviderKeys.length}</span>
                <span>
                  missing provider key{attention.missingProviderKeys.length === 1 ? "" : "s"}:{" "}
                  <code>{attention.missingProviderKeys.join(", ")}</code>
                </span>
                <Link href="/settings/keys" className="mono" style={{ color: "var(--paper-accent)" }}>
                  configure →
                </Link>
              </div>
            )}
            {attention.failedConnectors.length > 0 && (
              <div className="ops-attention-row">
                <span className="pill err">{attention.failedConnectors.length}</span>
                <span>
                  connector{attention.failedConnectors.length === 1 ? "" : "s"} not syncing
                </span>
                <Link href="/library?tab=connectors" className="mono" style={{ color: "var(--paper-accent)" }}>
                  view →
                </Link>
              </div>
            )}
            {attention.dlqCount > 0 && (
              <div className="ops-attention-row" data-admin="true">
                <span className="pill err">{attention.dlqCount}</span>
                <span>dead-lettered webhook payload{attention.dlqCount === 1 ? "" : "s"} (admin)</span>
                <Link href="/library/diagnostics" className="mono" style={{ color: "var(--paper-accent)" }}>
                  inspect →
                </Link>
              </div>
            )}
          </div>
        )}
      </section>

      <section className="ops-section">
        <h2 className="section-eyebrow">system snapshot</h2>
        <div className="card card-pad ops-snapshot">
          <div className="ops-snap-row">
            <span className="k">Queue</span>
            <span className="v">
              {snapshot.queue.pending} pending · last accepted {relTime(snapshot.queue.lastAcceptedAt)}
            </span>
          </div>
          <div className="ops-snap-row">
            <span className="k">Memory</span>
            <span className="v">
              {snapshot.memory.files} file{snapshot.memory.files === 1 ? "" : "s"} ·
              last updated {relTime(snapshot.memory.lastUpdatedAt)}
              <Link href="/brain" className="mono" style={{ color: "var(--paper-accent)", marginLeft: 8 }}>
                view →
              </Link>
            </span>
          </div>
          <div className="ops-snap-row">
            <span className="k">Providers</span>
            <span className="v">
              {snapshot.providers.configured} configured ·
              last tested {relTime(snapshot.providers.lastTestedAt)}
              <Link href="/settings/keys" className="mono" style={{ color: "var(--paper-accent)", marginLeft: 8 }}>
                manage →
              </Link>
            </span>
          </div>
          <div className="ops-snap-row">
            <span className="k">Ingest</span>
            <span className="v">
              {snapshot.ingest.connectors === 0 ? (
                <>no connectors connected yet — install lands in Phase K</>
              ) : (
                <>
                  {snapshot.ingest.connectors} connector
                  {snapshot.ingest.connectors === 1 ? "" : "s"} ·
                  last sync {relTime(snapshot.ingest.lastSyncAt)}
                </>
              )}
            </span>
          </div>
        </div>
      </section>
    </div>
  );
}
```

**Step 2: Add minimal CSS**

Append to wherever shared page CSS lives (search for `.page-head` definition to find the file — likely `apps/dashboard/src/app/globals.css` or `apps/dashboard/src/app/styles/*.css`). Add:

```css
.ops-section { margin-top: 32px; }
.ops-attention { display: flex; flex-direction: column; gap: 10px; }
.ops-attention-row { display: flex; align-items: center; gap: 10px; font-size: 14px; }
.ops-snapshot { display: grid; grid-template-columns: 120px 1fr; gap: 10px 16px; font-size: 14px; }
.ops-snap-row { display: contents; }
.ops-snap-row .k { color: var(--paper-muted); }
.ops-snap-row .v { color: var(--paper-ink); }
```

If those classes collide with existing ones, namespace tighter (e.g., `.ops .attention-row`).

**Step 3: Type-check + manual smoke**

Run:

```bash
cd apps/dashboard && pnpm type-check
```

Expected: zero errors.

Start dev server, sign in as the admin (8azi tenant), visit `/ops`. Expect:
- Page loads, role gate passes
- Needs Attention either empty or shows real counts
- System Snapshot rows render real numbers (queue, memory, providers, ingest)
- Ingest row shows "no connectors connected yet — install lands in Phase K" copy for fresh tenants

If the dev server isn't already running, start with `pnpm --filter @bbc/dashboard dev`.

**Step 4: Commit**

```bash
git add apps/dashboard/src/app/ops/page.tsx apps/dashboard/src/app/globals.css
git commit -m "feat(ops): add /ops cockpit page skeleton (read-only)"
```

---

## Phase C — Wire queue accept/reject inline

Make the pending-proposals row in Needs Attention actionable, mirroring the queue page's `ActionButtons` pattern. Reuse the existing `app/queue/actions.ts` server actions verbatim — no duplication.

### Task C1: Render expanded proposal rows + inline action buttons

**Files:**
- Modify: `apps/dashboard/src/app/ops/page.tsx`

**Step 1: Read existing pattern**

Look at how `app/queue/page.tsx` renders pending proposals with `ActionButtons` (lines 209–293). The component is `apps/dashboard/src/components/ActionButtons.tsx`. The server actions it posts to live in `apps/dashboard/src/app/queue/actions.ts`. Both reuse as-is.

**Step 2: Replace the "proposal{s} awaiting review" line with a small list**

Replace:

```tsx
{attention.pendingProposals.length > 0 && (
  <div className="ops-attention-row">
    <span className="pill warn">{attention.pendingProposals.length}</span>
    <span>
      proposal{attention.pendingProposals.length === 1 ? "" : "s"} awaiting review
    </span>
  </div>
)}
```

With (still in the same card, but a subsection):

```tsx
{attention.pendingProposals.length > 0 && (
  <div className="ops-pending">
    <div className="ops-pending-head">
      <span className="pill warn">{attention.pendingProposals.length}</span>
      <span>
        proposal{attention.pendingProposals.length === 1 ? "" : "s"} awaiting review
      </span>
    </div>
    <ul className="ops-pending-list">
      {attention.pendingProposals.slice(0, 5).map((p) => (
        <li key={p.proposal_id}>
          <div className="ops-pending-row">
            <Link
              href={`/queue/${p.proposal_id}`}
              className="ops-pending-link"
            >
              {p.summary || p.proposal_id}
            </Link>
            <span className="mono" style={{ color: "var(--paper-muted)", fontSize: 12 }}>
              {p.target_file}
            </span>
          </div>
          <ActionButtons id={p.proposal_id} canAccept={true} />
        </li>
      ))}
    </ul>
    {attention.pendingProposals.length > 5 && (
      <Link
        href="/queue"
        className="mono"
        style={{ color: "var(--paper-accent)", fontSize: 12 }}
      >
        view all {attention.pendingProposals.length} →
      </Link>
    )}
  </div>
)}
```

Add `import ActionButtons from "@/components/ActionButtons";` at the top.

**IMPORTANT:** `canAccept` reflects manager-review approval state in queue/page.tsx (line 214 uses `isApproved(p)`). For the /ops page we render the truncated top-5 — keep the same gate. Update the reader (Task A3) or the page to compute `canAccept` for each proposal. Cheapest path: pass `canAccept: false` initially and let the user click through to `/queue/[id]` for full review (matches the "view all →" affordance). Re-evaluate after dogfooding whether inline accept needs the full manager-review flow.

**Step 3: Add CSS**

```css
.ops-pending { display: flex; flex-direction: column; gap: 8px; }
.ops-pending-head { display: flex; align-items: center; gap: 8px; font-size: 14px; }
.ops-pending-list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 8px; }
.ops-pending-list li { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 8px 0; border-top: 1px solid var(--paper-rule); }
.ops-pending-row { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.ops-pending-link { color: var(--paper-ink); text-decoration: none; font-weight: 500; }
.ops-pending-link:hover { color: var(--paper-accent); }
```

**Step 4: Manual smoke**

Dev server. Visit `/ops` as admin/operator. If `queue_items` has pending rows for the tenant, they should render with accept/reject buttons. Click reject on a test proposal → row should disappear after page refresh. Verify file-mode banner only appears on the /queue page, not /ops (we intentionally aren't surfacing it here — `/ops` is the cockpit, not the audit surface).

**Step 5: Commit**

```bash
git add apps/dashboard/src/app/ops/page.tsx apps/dashboard/src/app/globals.css
git commit -m "feat(ops): wire inline accept/reject for top-5 pending proposals"
```

---

## Phase D — Nav swap + redirect

Make `/ops` the navigable destination, retire `/queue` from nav, demote `/library/diagnostics`.

### Task D1: Replace QUEUE_ROUTE with OPS_ROUTE in AppNav

**Files:**
- Modify: `apps/dashboard/src/components/AppNav.tsx`

**Step 1: Edit the route table**

Find `QUEUE_ROUTE` (lines 37–43). Replace its block with:

```ts
const OPS_ROUTE: Route = {
  key: "ops",
  label: "Ops",
  href: "/ops",
  // /ops is the new home for the queue, so match /queue too — the redirect
  // sends users to /ops, but a brief moment of "stale URL still highlighted"
  // is cheaper than a flicker mismatch.
  match: (p) => p === "/" || p === "/ops" || p.startsWith("/ops/") || p === "/queue" || p.startsWith("/queue/"),
  badge: "pending",
};
```

Update `ADMIN_ROUTES` and `OPERATOR_ROUTES` to use `OPS_ROUTE` instead of `QUEUE_ROUTE`. Delete the now-unused `QUEUE_ROUTE` constant.

**Step 2: Type-check**

```bash
cd apps/dashboard && pnpm type-check
```

**Step 3: Commit**

```bash
git add apps/dashboard/src/components/AppNav.tsx
git commit -m "feat(ops): swap Queue for Ops in primary nav"
```

---

### Task D2: Redirect `/queue` → `/ops`

**Files:**
- Modify: `apps/dashboard/src/app/queue/page.tsx`

**Step 1: Decision — replace page or add redirect**

The page is 372 lines of working queue UI. Two options:

A. **Hard redirect:** Replace the entire page body with `redirect("/ops")`. Old `/queue/[id]/page.tsx` continues to work for per-proposal review. Lose the multi-pane queue triage UI (the rail + recent-activity sidebar). This matches codex's "do not maintain two proposal-review UIs" recommendation. **Recommended.**
B. **Soft replace:** Keep `/queue` as a "view all queue" deep route accessible from `/ops` (the "view all N →" link). Don't redirect. Don't show in nav.

Pick A unless dogfood reveals the triage UI is missed.

For A, replace the entire `apps/dashboard/src/app/queue/page.tsx` body with:

```tsx
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function QueueRedirect() {
  redirect("/ops");
}
```

Delete the now-unused imports + helper functions in the same edit.

Leave `apps/dashboard/src/app/queue/[id]/page.tsx` (per-proposal detail view) untouched — operators reach it via the "view all →" link on /ops and via direct deep links.

**Step 2: Manual smoke**

Visit `/queue` in dev → should land on `/ops`. Visit `/queue/some-proposal-id` → should still render the detail page.

**Step 3: Commit**

```bash
git add apps/dashboard/src/app/queue/page.tsx
git commit -m "feat(ops): redirect /queue to /ops (cockpit absorbs queue list)"
```

---

### Task D3: Verify no orphaned links to `/library/diagnostics` or `/queue` in nav surfaces

**Files:**
- Audit: anywhere a `<Link href="/library/diagnostics">` or `<Link href="/queue">` exists outside the redirect itself

**Step 1: Search**

```bash
cd apps/dashboard && grep -rn '"/library/diagnostics"\|"/queue"' src --include='*.tsx' --include='*.ts' | grep -v "page.tsx"
```

For each hit, decide:
- If it's a documented admin-deep-link to `/library/diagnostics` — leave it.
- If it's a primary nav surface — change to `/ops`.
- The `/ops` page itself links to `/library/diagnostics` for the admin DLQ inspect — leave that.
- `app/library/page.tsx` may have a "diagnostics" link — that's fine if it's positioned as an admin tool, not a primary nav.

**Step 2: If any nav surface changes were needed, commit**

```bash
git add <changed-files>
git commit -m "chore(ops): remove orphaned /queue + /library/diagnostics nav links"
```

If no nav changes were needed, skip this step (just note in the PR description that the audit found none).

---

## Phase E — Verification + ship

### Task E1: Full test suite + type-check

**Step 1: Run all tests**

```bash
cd apps/dashboard && pnpm test
```

Expected: 801+ tests pass, including the 7 new ones from Task A2. No regressions.

**Step 2: Type-check**

```bash
cd apps/dashboard && pnpm type-check
```

Expected: zero errors.

**Step 3: Cloudflare build**

```bash
cd apps/dashboard && pnpm cf:build
```

Expected: build succeeds. (Don't deploy yet — that happens after codex review.)

---

### Task E2: Codex review

**Step 1: Run codex review on the branch diff**

```bash
git fetch origin main
codex review --base main -c 'model_reasoning_effort="high"' --enable web_search_cached
```

Read the verdict. Treat `[P1]` as blocking; fix and re-run before merging. `[P2]` is judgment call.

**Step 2: Fix any [P1] findings, commit fixes, re-run review until clean.**

---

### Task E3: Open PR

**Step 1: Push branch**

```bash
git push -u origin HEAD
```

**Step 2: Open PR with summary**

```bash
gh pr create --title "feat(ops): /ops operator cockpit replaces /queue in nav" --body "$(cat <<'EOF'
## Summary

- New `/ops` page consolidating Needs Attention (pending proposals, missing keys, failed connectors, admin DLQ) + System Snapshot (queue, memory, providers, ingest)
- Replaces `/queue` in primary nav (308-equivalent redirect from /queue → /ops)
- Demotes `/library/diagnostics` to admin deep-link (still accessible, no longer surfaced)
- No new backend lifecycle; reads existing tables only (`queue_items`, `memory_files`, `external_accounts`, `tenant_connectors`, `webhook_dead_letters`)
- Honest empty states throughout; ingest section explicitly tells users that connector install lands in Phase K (no fake reconnect buttons)

Closes the "disorienting" gap flagged in the v1.8 pre-launch audit. Design doc: `docs/plans/2026-05-17-ops-page-design.md`.

## Test plan

- [ ] Sign in as admin on 8azi tenant → /ops renders without errors
- [ ] System Snapshot rows show real counts and timestamps from the tenant
- [ ] If queue_items has pending rows: top 5 render with accept/reject inline
- [ ] Reject a test proposal → row disappears on refresh
- [ ] Missing provider keys row appears if a bound provider has no API key in /settings/keys
- [ ] Ingest row says "no connectors connected yet — install lands in Phase K" on a tenant with zero tenant_connectors rows
- [ ] Admin sees DLQ row (if dead_letters exist); operator does NOT
- [ ] Visiting /queue lands on /ops
- [ ] /queue/[id] still works for per-proposal detail
- [ ] Member role still redirects /ops → /brain (no regression)
- [ ] `pnpm test` passes (801+ tests, 7 new)
- [ ] `pnpm type-check` clean
- [ ] `pnpm cf:build` clean

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Risks and known limitations (call out in PR description)

1. **`canAccept` simplification.** Inline accept buttons on /ops pass `canAccept={true}` instead of computing manager-review approval state per-proposal. The "view all →" link routes operators to /queue/[id] for the full manager-review flow when needed. Revisit after dogfooding.
2. **No file-mode banner on /ops.** The audit-trail banner ("Accept and Reject shell out to bash scripts") only appears on the dedicated detail page now. If file-mode operators dogfood and find this confusing, surface it.
3. **`expectedProviders` definition.** Currently treats any provider with a `bindings.yaml` entry as "expected." If the user wants a more curated list (e.g., only LLM providers, not DB providers), refactor `getExpectedProviders` accordingly.
4. **Ingest section is honest-but-empty for 8azi until Phase K.** This is intentional — the alternative is faking it. The copy makes it explicit.
5. **No new tests for the page component itself.** Reader is fully tested. Page tests would require a Next.js test harness we don't currently have for server components. Manual smoke covers the page; reader coverage covers the data.
