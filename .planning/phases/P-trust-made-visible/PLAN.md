# Phase P Step 1 — Template Gallery + Plan-Before-Run (marketing) — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make a flat, searchable, role-faceted template gallery the app's home screen (Part A), and prove the "plan-before-run" confirmation step end-to-end in the marketing studio (Part B).

**Architecture:** Additive, two parts. **Part A (Gallery)** adds an optional `facets` field to each role's template contract, a server-side `lib/studio/gallery.ts` aggregator that unifies all 8 role registries, a client-safe `lib/studio/gallery-filter.ts` pure filter, a new `/gallery` route, and a root-redirect change so operators/members land on the gallery. **Part B (Plan-before-run, marketing only)** adds a `previewPlan` server action and a `plan-confirming` stage to the marketing StudioClient, plus a shared `PlanConfirmStage` component.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript, vitest (colocated `*.test.ts(x)`, jsdom via `// @vitest-environment jsdom` pragma), Supabase, Tailwind.

---

## CRITICAL CONTEXT — read before starting

This plan was reviewed by codex against the real codebase. The findings that shape it:

1. **The 8 studios are NOT uniform.** Marketing is task-first (`idle → proposing → picking → configuring → running → reviewing`, server action `runWorkflow`, registry getter `getTemplate`, client type `ClientTemplate`). Engineering — and per codex the other 6 — are **template-first**: stage machine `idle → configuring → running → reviewing → error`, a `selected` state, **no** propose/pick, server actions named `run<Role>Workflow` (`runEngineeringWorkflow`, `runFounderWorkflow`, …), registry getters `get<Role>Template`, and **their own** `Client<Role>Template` types. **Therefore Part B covers marketing ONLY.** Rolling plan-before-run out to the other 7 is bespoke per studio, not a copy-paste — it's deferred to **Step 1b** (needs its own plan; see the note at the end).

2. **Each role's templates live in its own directory with its own `types.ts` and its own `Client<Role>Template` type.** Marketing: `lib/studio/templates/` (`ClientTemplate`). Others: `lib/studio/<role>-templates/` (`ClientEngTemplate`, etc.). `facets` must be added to each one. The gallery aggregator must treat them by their **structural common shape**, not assume a single shared type.

3. **`listClient*Templates` is exported from each registry's `registry.ts`, not its `index.ts`.** `lib/studio/templates/index.ts` does not re-export `listClientTemplates`.

4. **Deep-linking gallery cards into a specific template (`?template=`) is deferred to Step 1b** — it's entangled with the per-studio flow divergence above.

Run commands from `apps/dashboard/`. Test pattern: `pnpm --filter @bbc/dashboard exec vitest run <path>`. All paths below are repo-root-relative.

---

## PART A — TEMPLATE GALLERY

### Task A1: Add `facets` to every role's template contract

Cross-listing: a template is *owned* by its id-prefix role but may declare extra roles to appear under in the gallery.

**Files (8 template `types.ts` + 8 registries):**
- Modify: `apps/dashboard/src/lib/studio/templates/types.ts` and `apps/dashboard/src/lib/studio/<role>-templates/types.ts` (×7) — the `Template` interface in each.
- Modify: `apps/dashboard/src/lib/studio/templates/registry.ts` and `apps/dashboard/src/lib/studio/<role>-templates/registry.ts` (×7) — each `Client<Role>Template` type + each `listClient<Role>Templates` function.

**Step 1: Confirm the file set**

Run: `ls apps/dashboard/src/lib/studio/*-templates/types.ts apps/dashboard/src/lib/studio/templates/types.ts`
Run: `grep -rn "listClient.*Templates\|getEngTemplate\|ClientEngTemplate" apps/dashboard/src/lib/studio` — note each registry's exact type name and list-function name. You'll need all 8.

**Step 2: Add the `facets` field to each `Template` interface**

In every `types.ts` (all 8), add the import and field. `StudioRole` comes from the shared `template-id.ts` (no circular import — `template-id.ts` imports nothing from the template dirs):

```typescript
import type { StudioRole } from "@/lib/studio/template-id";
```
```typescript
  // Additional roles to cross-list this template under in the gallery. The
  // OWNING role is always derived from the id prefix; `facets` is purely
  // additive surfacing. Optional — most templates omit it.
  facets?: StudioRole[];
```

**Step 3: Thread `facets` through each `Client<Role>Template` type and list function**

In every `registry.ts` (all 8): add `facets?: StudioRole[]` (or `facets?: Template["facets"]`) to the `Client<Role>Template` type, and add `facets: t.facets` to the object returned by `listClient<Role>Templates()`.

**Step 4: Verify**

Run: `pnpm --filter @bbc/dashboard type-check`
Expected: PASS — pure type + passthrough addition, exercised by Task A2.

**Step 5: Commit**

```bash
git add apps/dashboard/src/lib/studio/templates apps/dashboard/src/lib/studio/*-templates
git commit -m "feat(gallery): add optional facets field to every role template contract"
```

---

### Task A2: Gallery aggregator (server) + pure filter (client-safe)

Two modules, deliberately split so client code never imports the registry side-effect graph:
- `lib/studio/gallery.ts` — **server-only**: side-effect-imports all 8 registries, exports `buildGallery()` and the `GalleryTemplate` type.
- `lib/studio/gallery-filter.ts` — **pure, client-safe**: exports `filterGallery()` and the `GalleryFilter` type. No registry imports.

**Files:**
- Create: `apps/dashboard/src/lib/studio/gallery-filter.ts`
- Create: `apps/dashboard/src/lib/studio/gallery.ts`
- Test: `apps/dashboard/src/lib/studio/gallery.test.ts`

**Step 1: Write the failing test**

```typescript
// apps/dashboard/src/lib/studio/gallery.test.ts
import { describe, it, expect } from "vitest";
import { buildGallery } from "./gallery";
import { filterGallery } from "./gallery-filter";

describe("buildGallery", () => {
  it("aggregates templates from all 8 role registries", () => {
    const all = buildGallery();
    expect(all.length).toBeGreaterThan(30);
    expect(new Set(all.map((t) => t.owningRole)).size).toBe(8);
  });

  it("derives owningRole from the id prefix and resolves role presentation", () => {
    const all = buildGallery();
    const m = all.find((t) => t.id.startsWith("marketing:"));
    expect(m?.owningRole).toBe("marketing");
    expect(m?.roleLabel).toBeTruthy();
    expect(m?.accentColor).toBeTruthy();
  });

  it("includes the owning role plus any facets in `roles`", () => {
    for (const t of buildGallery()) expect(t.roles).toContain(t.owningRole);
  });
});

describe("filterGallery", () => {
  it("matches query against label and hint, case-insensitive", () => {
    const all = buildGallery();
    const sample = all[0];
    expect(filterGallery(all, { query: sample.label.toLowerCase() }).some((t) => t.id === sample.id)).toBe(true);
  });
  it("filters by role, matching owning role OR a facet", () => {
    const all = buildGallery();
    const finance = filterGallery(all, { role: "finance" });
    expect(finance.length).toBeGreaterThan(0);
    expect(finance.every((t) => t.roles.includes("finance"))).toBe(true);
  });
  it("returns all templates when no filters are given", () => {
    const all = buildGallery();
    expect(filterGallery(all, {}).length).toBe(all.length);
  });
});
```

**Step 2: Run it — expect FAIL** (`gallery.ts` / `gallery-filter.ts` do not exist).

Run: `pnpm --filter @bbc/dashboard exec vitest run src/lib/studio/gallery.test.ts`

**Step 3: Implement `gallery-filter.ts` (pure, client-safe — NO registry imports)**

```typescript
// apps/dashboard/src/lib/studio/gallery-filter.ts
// Pure filtering for the gallery. Client-safe: imports no registry/side-effect
// modules, so "use client" components can import it freely.
import type { StudioRole } from "@/lib/studio/template-id";

// Structural shape the filter needs — kept minimal and decoupled from
// GalleryTemplate so this module has zero registry coupling.
export type FilterableTemplate = {
  label: string;
  hint: string;
  roles: StudioRole[];
};

export type GalleryFilter = { query?: string; role?: StudioRole };

export function filterGallery<T extends FilterableTemplate>(
  templates: T[],
  filter: GalleryFilter,
): T[] {
  const q = filter.query?.trim().toLowerCase();
  return templates.filter((t) => {
    if (filter.role && !t.roles.includes(filter.role)) return false;
    if (q && !`${t.label} ${t.hint}`.toLowerCase().includes(q)) return false;
    return true;
  });
}
```

**Step 4: Implement `gallery.ts` (server-only aggregator)**

```typescript
// apps/dashboard/src/lib/studio/gallery.ts
import "server-only";
// Unified, searchable view over all 8 role template registries. The gallery is
// the app's home screen. SERVER-ONLY: pulls in every registry's side-effect
// graph (template registration + buildPrompt). Client code must import
// filterGallery from ./gallery-filter, never from here.

import { ROLE_SHAPES } from "@/lib/studio/role-shapes";
import { roleForTemplateId, type StudioRole } from "@/lib/studio/template-id";
import type { FirstUseInput, PreviewKind } from "@/lib/studio/templates/types";

// Import each registry's client-template list function FROM ITS registry.ts.
// Confirm exact export names with the Task A1 Step 1 grep before relying on
// these — the marketing one is `listClientTemplates`, the rest are
// `listClient<Role>Templates`.
import { listClientTemplates } from "@/lib/studio/templates/registry";
import { listClientEngTemplates } from "@/lib/studio/eng-templates/registry";
import { listClientFounderTemplates } from "@/lib/studio/founder-templates/registry";
import { listClientDesignerTemplates } from "@/lib/studio/designer-templates/registry";
import { listClientSupportTemplates } from "@/lib/studio/support-templates/registry";
import { listClientFinanceTemplates } from "@/lib/studio/finance-templates/registry";
import { listClientLegalTemplates } from "@/lib/studio/legal-templates/registry";
import { listClientHrTemplates } from "@/lib/studio/hr-templates/registry";

// Structural common shape across all 8 Client<Role>Template types. They each
// carry at least these fields; we read them structurally rather than importing
// 8 different named types.
type AnyClientTemplate = {
  id: string;
  label: string;
  hint: string;
  kind: PreviewKind;
  firstUseInputs: FirstUseInput[];
  facets?: StudioRole[];
};

export type GalleryTemplate = AnyClientTemplate & {
  owningRole: StudioRole;
  roles: StudioRole[]; // owning role + facets
  roleLabel: string;
  accentColor: string;
};

const REGISTRY_LISTS: ReadonlyArray<() => AnyClientTemplate[]> = [
  listClientTemplates,
  listClientEngTemplates,
  listClientFounderTemplates,
  listClientDesignerTemplates,
  listClientSupportTemplates,
  listClientFinanceTemplates,
  listClientLegalTemplates,
  listClientHrTemplates,
];

export function buildGallery(): GalleryTemplate[] {
  const out: GalleryTemplate[] = [];
  for (const list of REGISTRY_LISTS) {
    for (const t of list()) {
      const owningRole = roleForTemplateId(t.id);
      if (!owningRole) continue; // unprefixed — not gallery-eligible
      const shape = ROLE_SHAPES[owningRole];
      const roles = Array.from(new Set<StudioRole>([owningRole, ...(t.facets ?? [])]));
      out.push({ ...t, owningRole, roles, roleLabel: shape.label, accentColor: shape.accentColor });
    }
  }
  return out.sort((a, b) => a.label.localeCompare(b.label));
}
```

> If `import "server-only"` causes a vitest failure, note that `vitest.config.ts` already aliases `server-only` to a test stub — it should resolve fine.

**Step 5: Run the test — expect PASS.** If `length > 30` fails, Task A5 (curated depth) isn't done yet — note and continue; A5 satisfies it.

**Step 6: Commit**

```bash
git add apps/dashboard/src/lib/studio/gallery.ts apps/dashboard/src/lib/studio/gallery-filter.ts apps/dashboard/src/lib/studio/gallery.test.ts
git commit -m "feat(gallery): add server aggregator and client-safe filter"
```

---

### Task A3: The `/gallery` route

**Files:**
- Create: `apps/dashboard/src/app/gallery/page.tsx` (server)
- Create: `apps/dashboard/src/app/gallery/GalleryClient.tsx` (client)
- Test: `apps/dashboard/src/app/gallery/GalleryClient.test.tsx`

**Step 1: Write the failing component test**

```tsx
// apps/dashboard/src/app/gallery/GalleryClient.test.tsx
// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import GalleryClient from "./GalleryClient";
import type { GalleryTemplate } from "@/lib/studio/gallery";

const FIXTURES: GalleryTemplate[] = [
  { id: "marketing:tweet", label: "Tweet thread", hint: "short posts", kind: "x_thread",
    firstUseInputs: [], owningRole: "marketing", roles: ["marketing"],
    roleLabel: "Marketing Studio", accentColor: "#f59e0b" },
  { id: "finance:runway", label: "Runway analysis", hint: "cash forecast", kind: "doc",
    firstUseInputs: [], owningRole: "finance", roles: ["finance", "founder"],
    roleLabel: "Finance Studio", accentColor: "#0d9488" },
];

describe("GalleryClient", () => {
  it("renders every template by default", () => {
    render(<GalleryClient templates={FIXTURES} />);
    expect(screen.getByText("Tweet thread")).toBeTruthy();
    expect(screen.getByText("Runway analysis")).toBeTruthy();
  });
  it("filters by search query", () => {
    render(<GalleryClient templates={FIXTURES} />);
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "runway" } });
    expect(screen.queryByText("Tweet thread")).toBeNull();
    expect(screen.getByText("Runway analysis")).toBeTruthy();
  });
  it("filters by role chip, matching facets too", () => {
    render(<GalleryClient templates={FIXTURES} />);
    fireEvent.click(screen.getByRole("button", { name: /founder/i }));
    expect(screen.getByText("Runway analysis")).toBeTruthy(); // founder is a facet
    expect(screen.queryByText("Tweet thread")).toBeNull();
  });
});
```

**Step 2: Run — expect FAIL.**

**Step 3: Implement `GalleryClient.tsx`** (minimal, design-agnostic — final styling comes from Claude Design mockups; keep structure semantic)

```tsx
// apps/dashboard/src/app/gallery/GalleryClient.tsx
"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { GalleryTemplate } from "@/lib/studio/gallery";
import { filterGallery } from "@/lib/studio/gallery-filter";
import { STUDIO_ROLES, type StudioRole } from "@/lib/studio/template-id";
import { ROLE_SHAPES } from "@/lib/studio/role-shapes";

type Props = { templates: GalleryTemplate[] };

export default function GalleryClient({ templates }: Props) {
  const [query, setQuery] = useState("");
  const [role, setRole] = useState<StudioRole | null>(null);

  const visible = useMemo(
    () => filterGallery(templates, { query, role: role ?? undefined }),
    [templates, query, role],
  );

  return (
    <div>
      {/* VISUAL: restyle from mockups. Structure must stay: search + chips + grid. */}
      <input
        type="search" role="searchbox" aria-label="Search templates"
        placeholder="Search templates..."
        value={query} onChange={(e) => setQuery(e.target.value)}
      />
      <div role="group" aria-label="Filter by role">
        <button type="button" aria-pressed={role === null} onClick={() => setRole(null)}>All</button>
        {STUDIO_ROLES.map((r) => (
          <button key={r} type="button" aria-pressed={role === r}
            onClick={() => setRole(role === r ? null : r)}>
            {ROLE_SHAPES[r].label}
          </button>
        ))}
      </div>
      <ul>
        {visible.map((t) => (
          <li key={t.id}>
            {/* Step 1b will deep-link to a specific template; for now, link to the studio. */}
            <Link href={`/studio/${t.owningRole}`}>
              <span>{t.label}</span>
              <span>{t.hint}</span>
              <span>{t.kind}</span>
              <span>{t.roleLabel}</span>
            </Link>
          </li>
        ))}
      </ul>
      {visible.length === 0 ? <p>No templates match that.</p> : null}
    </div>
  );
}
```

> `ROLE_SHAPES` is presentational-only data — confirm it's safe to import in a client component (it has no server imports). If it isn't, pass `{ role, label }` pairs in from the server `page.tsx` instead.

**Step 4: Run the component test — expect PASS.**

**Step 5: Implement `page.tsx`**

```tsx
// apps/dashboard/src/app/gallery/page.tsx
import { redirect } from "next/navigation";
import { requireActor } from "@/lib/auth/require-user";
import { buildGallery } from "@/lib/studio/gallery";
import GalleryClient from "./GalleryClient";

export const dynamic = "force-dynamic";

export default async function GalleryPage() {
  const a = await requireActor();
  if (!a.ok) redirect("/auth/signin?callbackUrl=/gallery");
  return <GalleryClient templates={buildGallery()} />;
}
```

> Confirm `requireActor` and its `.ok` shape against `apps/dashboard/src/lib/auth/require-user.ts` and the usage in `apps/dashboard/src/app/page.tsx` — mirror exactly.

**Step 6: `pnpm --filter @bbc/dashboard type-check` — expect PASS.**

**Step 7: Commit**

```bash
git add apps/dashboard/src/app/gallery/
git commit -m "feat(gallery): add /gallery route with search and role faceting"
```

---

### Task A4: Make the gallery the home screen

**Files:**
- Modify: `apps/dashboard/src/app/page.tsx` (root redirect, ~lines 29-30)
- Modify: `apps/dashboard/src/components/AppNav.tsx` (route lists)
- Test: `apps/dashboard/test/role-aware-root.test.ts`, `apps/dashboard/test/nav-role-visibility.test.tsx`

**Step 1: Update the failing tests first**

In `test/role-aware-root.test.ts`: operators and members now redirect to `/gallery` (not `/studio/<slug>`). Admin → `/home`; unauth → `/queue`; empty brain → `/welcome` unchanged. In `test/nav-role-visibility.test.tsx`: if it asserts an exact route list, add "Gallery" for operator + member.

**Step 2: Run — expect FAIL.**

Run: `pnpm --filter @bbc/dashboard exec vitest run test/role-aware-root.test.ts test/nav-role-visibility.test.tsx`

**Step 3: Change the root redirect**

In `apps/dashboard/src/app/page.tsx`, replace the operator/member branch (the `templateSlug` lookup + `redirect(\`/studio/${slug}\`)`) with:

```typescript
  // Operators and members land on the gallery (Phase P) — the browse-first home
  // screen. Role studios are still reachable from the nav.
  redirect("/gallery");
```

(Remove the now-unused `templateSlug` line.)

**Step 4: Add the gallery to nav**

In `components/AppNav.tsx`, add a route constant. NOTE: the `Route` type requires a `key` field (see `AppNav.tsx:9` — `{ key, label, href, match, badge? }`):

```typescript
const GALLERY_ROUTE: Route = {
  key: "gallery",
  label: "Gallery",
  href: "/gallery",
  match: (p) => p === "/gallery" || p.startsWith("/gallery/"),
};
```

Include `GALLERY_ROUTE` first in `OPERATOR_ROUTES` and in `memberRoutes()`. Leave `ADMIN_ROUTES` unless the design says otherwise.

**Step 5: Run tests — expect PASS.**

**Step 6: Commit**

```bash
git add apps/dashboard/src/app/page.tsx apps/dashboard/src/components/AppNav.tsx apps/dashboard/test/role-aware-root.test.ts apps/dashboard/test/nav-role-visibility.test.tsx
git commit -m "feat(gallery): make the gallery the home screen for operators and members"
```

---

### Task A5: Curated-depth pass for thin studios

The gallery must feel capable on first load (DESIGN.md: curated depth, not breadth). Engineering, Founder, Designer have ~3 templates each; bring each to **≥5**. Content authoring, no new mechanism. Can run in parallel with Part B.

**Per thin role (example: engineering):**
- Create: `apps/dashboard/src/lib/studio/eng-templates/<new-template>.ts` (×2)
- Modify: `apps/dashboard/src/lib/studio/eng-templates/index.ts` (side-effect import each new file)

**Step 1: Author each template** following the existing pattern — open a current template in the same dir as the reference. `id` MUST start with the role prefix (`eng:`, `founder:`, `design:`). Export a `Template` with `label`, `hint`, `kind`, `firstUseInputs`, `buildPrompt()` using the shared clauses; lead cited lines with `[${id}]`. Set `facets` if genuinely cross-role. Suggested (adjust for quality, not filler): Engineering `eng:incident-retro`, `eng:rfc-draft`; Founder `founder:investor-update`, `founder:hiring-plan`; Designer `design:design-review-notes`, `design:component-spec`.

**Step 2: Register** each new file in the role's `index.ts`.

**Step 3: Run** `pnpm --filter @bbc/dashboard exec vitest run src/lib/studio/role-shapes.test.ts src/lib/studio/gallery.test.ts` — expect PASS (including `buildGallery().length > 30`). `role-shapes.test.ts` and `gallery.test.ts` are the validation here — there are no per-role-registry test files.

**Step 4: Commit per role.**

```bash
git add apps/dashboard/src/lib/studio/eng-templates/
git commit -m "feat(gallery): add 2 engineering templates for curated gallery depth"
```

---

## PART B — PLAN-BEFORE-RUN (MARKETING ONLY)

> Marketing only. The other 7 studios have divergent state machines and action names (see CRITICAL CONTEXT) — rolling plan-before-run out to them is Step 1b. Reminder from DESIGN.md: the plan step previews **intent + candidate memory before generation** — it is NOT the accept/reject queue, and it does NOT show final citations.

### Task B1: `previewPlan` server action (marketing)

A new action in the marketing `actions.ts`. It loads the brain and reports the candidate memory the run could draw on — it does **not** call the LLM and does **not** need `buildPrompt` (the prompt is only needed for the actual generation in `runWorkflow`).

**Files:**
- Modify: `apps/dashboard/src/app/studio/marketing/actions.ts`
- Test: `apps/dashboard/src/app/studio/marketing/preview-plan.test.ts`

**Step 1: Read the reference code first**

- `runWorkflow` in `actions.ts` (around line 273) — see how it: resolves the actor + RBAC, validates the task, resolves the template via `getTemplate`, and loads the brain via `loadBrainSummary`. `previewPlan` reuses the resolve + validate + load-brain portion and stops there.
- `apps/dashboard/src/lib/studio/brain-summary.ts` — `loadBrainSummary` shape. NOTE: `BrainSummary.recent_decisions / vendors / team / glossary.terms` carry `id`s; `voice` and `product` do NOT. Candidate-memory listing covers the id-bearing types only.
- For the test harness (mocking supabase + auth), copy the pattern from a real existing server-action test: `apps/dashboard/src/app/memory/actions.rbac.test.ts`. There are **no** existing `app/studio/**` test files to copy from.

**Step 2: Write the failing test**

```typescript
// apps/dashboard/src/app/studio/marketing/preview-plan.test.ts
import { describe, it, expect, vi } from "vitest";

// Assert the LLM is never called. The real Anthropic client lives at
// @/lib/secrets/anthropic-client (export: getAnthropicClient). Confirm the
// exact export and mock it the way the existing actions code consumes it.
const llm = vi.fn();
vi.mock("@/lib/secrets/anthropic-client", () => ({
  getAnthropicClient: () => ({ messages: { create: (...a: unknown[]) => llm(...a) } }),
}));
// Mock supabase + auth following apps/dashboard/src/app/memory/actions.rbac.test.ts.

describe("previewPlan", () => {
  it("returns a plan preview without calling the LLM", async () => {
    const { previewPlan } = await import("./actions");
    const res = await previewPlan("marketing:single-x-post", "draft a launch tweet", {});
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.plan.planSummary).toBeTruthy();
      expect(Array.isArray(res.plan.candidateMemories)).toBe(true);
    }
    expect(llm).not.toHaveBeenCalled();
  });
  it("rejects an unknown template id", async () => {
    const { previewPlan } = await import("./actions");
    const res = await previewPlan("marketing:does-not-exist", "draft a launch tweet", {});
    expect(res.ok).toBe(false);
  });
  it("rejects a too-short task", async () => {
    const { previewPlan } = await import("./actions");
    const res = await previewPlan("marketing:single-x-post", "hi", {});
    expect(res.ok).toBe(false);
  });
});
```

**Step 3: Run — expect FAIL** (`previewPlan` not exported).

**Step 4: Implement `previewPlan`**

Add to `actions.ts`. The result type uses a nested `plan` object — the test above matches this shape exactly:

```typescript
export type PlanPreview = {
  templateId: string;
  templateLabel: string;
  task: string;
  inputs: Record<string, string>;
  planSummary: string; // plain-language, human-readable
  // Brain rows in scope for this run — intended retrieval scope, NOT final
  // citations. Covers the id-bearing memory types; voice/product are always-on
  // context and are not itemized here.
  candidateMemories: Array<{ id: string; kind: string; label: string }>;
};

export type PreviewPlanResult =
  | { ok: true; plan: PlanPreview }
  | { ok: false; error: string };

export async function previewPlan(
  templateId: string,
  task: string,
  inputs: Record<string, string>,
): Promise<PreviewPlanResult> {
  // Mirror runWorkflow's guards: actor + RBAC + task validation. Match the
  // exact calls runWorkflow uses (requireActor/requireRole, the task-length
  // check) — do not invent new ones.
  const a = await requireActor();
  if (!a.ok) return { ok: false, error: "Not authorized." };
  // requireRole(...) exactly as runWorkflow does it.

  const trimmed = task.trim();
  if (trimmed.length < 8) return { ok: false, error: "Describe the task in at least 8 characters." };

  const template = getTemplate(templateId);
  if (!template) return { ok: false, error: "Unknown template." };

  const supabase = await getSupabaseServerClient();
  const brain = await loadBrainSummary(supabase, a.actor.tenant_id);

  const candidateMemories: PlanPreview["candidateMemories"] = [
    ...brain.recent_decisions.map((d) => ({ id: d.id, kind: "decision", label: d.title })),
    ...brain.vendors.map((v) => ({ id: v.id, kind: "vendor", label: `${v.name} (${v.role})` })),
    ...brain.team.map((t) => ({ id: t.id, kind: "team", label: `${t.name} (${t.role})` })),
    ...(brain.glossary?.terms ?? []).map((g) => ({ id: g.id, kind: "glossary", label: g.term })),
  ];

  const n = candidateMemories.length;
  const planSummary =
    `Generate a ${template.kind.replace(/_/g, " ")} using the "${template.label}" template, ` +
    `grounded in ${n} ${n === 1 ? "piece" : "pieces"} of your company memory. ` +
    `Output goes to the review queue — nothing is saved or sent until you approve it.`;

  return {
    ok: true,
    plan: { templateId, templateLabel: template.label, task: trimmed, inputs, planSummary, candidateMemories },
  };
}
```

> Use the import names `actions.ts` already has (`requireActor`, `requireRole`, `getTemplate`, `getSupabaseServerClient`, `loadBrainSummary`) — all already imported by `runWorkflow`, so no new imports. Match `runWorkflow`'s exact RBAC call.

**Step 5: Run the test — expect PASS.**

**Step 6: Commit**

```bash
git add apps/dashboard/src/app/studio/marketing/actions.ts apps/dashboard/src/app/studio/marketing/preview-plan.test.ts
git commit -m "feat(plan-step): add previewPlan server action for marketing studio"
```

---

### Task B2: `plan-confirming` stage in the marketing StudioClient

**Files:**
- Modify: `apps/dashboard/src/app/studio/marketing/StudioClient.tsx`
- Test: `apps/dashboard/src/app/studio/marketing/StudioClient.test.tsx` (new)

**Step 1: Write the failing test** — `// @vitest-environment jsdom`. Mock `./actions` (`previewPlan`, `runWorkflow`, `proposeWorkflows`). Assert: from `configuring`, submitting calls `previewPlan` and NOT `runWorkflow`; the plan summary renders; "Confirm & generate" calls `runWorkflow` and advances to review; "Back" returns to `configuring` without calling `runWorkflow`.

**Step 2: Run — expect FAIL.**

**Step 3: Implement** in `StudioClient.tsx`:

1. Import `previewPlan` and `type PlanPreview` from `./actions`.
2. Add to the `Stage` union, after `configuring`, before `running`:

```typescript
  | { kind: "plan-confirming"; task: string; candidate: TemplateProposal; inputs: Record<string, string>; plan: PlanPreview }
```

3. Replace `handleRun` (currently `configuring → running`, ~line 161) with two callbacks:

```typescript
// configuring -> plan-confirming
const handleRequestPlan = useCallback((inputs: Record<string, string>) => {
  setError(null);
  const current = stageRef.current;
  if (current.kind !== "configuring") return;
  const { task: runTask, candidate } = current;
  startTransition(async () => {
    const res = await previewPlan(candidate.templateId, runTask, inputs);
    if (!res.ok) { setError(res.error); return; }
    setStage({ kind: "plan-confirming", task: runTask, candidate, inputs, plan: res.plan });
  });
}, []);

// plan-confirming -> running -> reviewing  (the old handleRun body)
const handleConfirmPlan = useCallback(() => {
  setError(null);
  const current = stageRef.current;
  if (current.kind !== "plan-confirming") return;
  const { task: runTask, candidate, inputs } = current;
  setStage({ kind: "running", task: runTask, candidate, inputs });
  startTransition(async () => {
    const res = await runWorkflow(candidate.templateId, runTask, inputs);
    if (!res.ok) {
      setError(res.error);
      setStage({ kind: "configuring", task: runTask, candidate, inputs });
      return;
    }
    setStage({ kind: "reviewing", task: runTask, candidate, inputs,
      runId: res.runId, blocks: res.blocks, citedMemories: res.citedMemories, reviewed: null });
  });
}, []);
```

4. Change `<ConfigureStage onRun={...} />` to use `handleRequestPlan` (was `handleRun`).
5. Add the render branch after the `configuring` branch:

```tsx
{stage.kind === "plan-confirming" ? (
  <PlanConfirmStage
    plan={stage.plan}
    onConfirm={handleConfirmPlan}
    onBack={() => setStage({ kind: "configuring", task: stage.task, candidate: stage.candidate, inputs: stage.inputs })}
    disabled={isPending}
  />
) : null}
```

Import `PlanConfirmStage` from `@/components/studio/PlanConfirmStage` (Task B3).

**Step 4: Run the test — expect PASS** (after B3 exists; if doing B2 first, stub `PlanConfirmStage` then complete in B3).

**Step 5: Commit**

```bash
git add apps/dashboard/src/app/studio/marketing/StudioClient.tsx apps/dashboard/src/app/studio/marketing/StudioClient.test.tsx
git commit -m "feat(plan-step): insert plan-confirming stage into marketing StudioClient"
```

---

### Task B3: Shared `PlanConfirmStage` component

**Files:**
- Create: `apps/dashboard/src/lib/studio/plan-preview.ts` (lift `PlanPreview` here so a client component doesn't import a route's `actions.ts`)
- Create: `apps/dashboard/src/components/studio/PlanConfirmStage.tsx`
- Test: `apps/dashboard/src/components/studio/PlanConfirmStage.test.tsx`

**Step 1: Lift the type.** Move the `PlanPreview` type definition into `lib/studio/plan-preview.ts` and have `marketing/actions.ts` re-export it (`export type { PlanPreview } from "@/lib/studio/plan-preview"`). Update the B2 import accordingly. This keeps the component free of route-`actions.ts` coupling.

**Step 2: Write the failing test** — `// @vitest-environment jsdom`. Render with a `PlanPreview` fixture; assert the summary + candidate-memory labels render; assert `onConfirm`/`onBack` fire; assert the confirm button is disabled when `disabled`.

**Step 3: Run — expect FAIL.**

**Step 4: Implement** (minimal, design-agnostic):

```tsx
// apps/dashboard/src/components/studio/PlanConfirmStage.tsx
"use client";

import { Button } from "@/components/ui/button";
import type { PlanPreview } from "@/lib/studio/plan-preview";

type Props = { plan: PlanPreview; onConfirm: () => void; onBack: () => void; disabled: boolean };

// Shown after configuring a template, before generation. Previews INTENT and
// the memory in scope — NOT the accept/reject review of produced output, and
// NOT final citations. See Phase P DESIGN.md.
export function PlanConfirmStage({ plan, onConfirm, onBack, disabled }: Props) {
  return (
    <div>
      {/* VISUAL: restyle from mockups. Structure must stay: summary, scope list, actions. */}
      <h2>Review your plan</h2>
      <p>{plan.planSummary}</p>
      <section aria-label="Memory in scope">
        <h3>What this draws on</h3>
        {plan.candidateMemories.length === 0 ? (
          <p>No company memory matched this task. The draft will be based only on what you typed.</p>
        ) : (
          <ul>
            {plan.candidateMemories.map((m) => (
              <li key={m.id}><span>{m.kind}</span><span>{m.label}</span></li>
            ))}
          </ul>
        )}
      </section>
      <div>
        <Button type="button" variant="ghost" onClick={onBack} disabled={disabled}>Back</Button>
        <Button type="button" onClick={onConfirm} disabled={disabled}>Confirm &amp; generate</Button>
      </div>
    </div>
  );
}
```

> Confirm `@/components/ui/button` exports `Button` and supports a `variant="ghost"` (check `apps/dashboard/src/components/ui/button.tsx` — codex flagged the variant set should be verified). If `ghost` isn't a variant, use whatever the secondary/quiet variant is, or omit `variant`.

**Step 5: Run the test — expect PASS.**

**Step 6: Commit**

```bash
git add apps/dashboard/src/lib/studio/plan-preview.ts apps/dashboard/src/components/studio/PlanConfirmStage.tsx apps/dashboard/src/components/studio/PlanConfirmStage.test.tsx apps/dashboard/src/app/studio/marketing/actions.ts
git commit -m "feat(plan-step): add shared PlanConfirmStage component"
```

---

## FINAL VERIFICATION

**Step 1:** `pnpm --filter @bbc/dashboard type-check` — expect PASS.
**Step 2:** `pnpm --filter @bbc/dashboard test` — expect PASS (547+ baseline plus the new gallery, previewPlan, StudioClient, PlanConfirmStage tests).
**Step 3:** `pnpm --filter @bbc/dashboard build` — expect clean compile; `/gallery` in the route manifest.
**Step 4 (manual, if a dev env is available):** log in as operator → land on `/gallery`; search + role chips filter (incl. facet matches); click a card → marketing studio; type a task → pick → configure → submit → `plan-confirming` shows summary + candidate memory; "Confirm & generate" → run → review; "Back" → returns to configure. (Authed Studio UI can't be headless-smoke-tested — invite-only auth, no browser cookies; manual-only, as in prior phases.)
**Step 5:** Run `/codex review` on the branch diff; fix any `[P1]` before opening the PR.

---

## DEFERRED TO STEP 1b (needs its own plan)

Codex's review of the first draft of this plan surfaced that the following are NOT mechanical and need their own planning pass:

- **Plan-before-run for the other 7 studios.** Engineering/founder/designer/support/finance/legal/hr each have a different state machine (template-first `idle → configuring → running → reviewing → error`, a `selected` state, no propose/pick), differently-named actions (`run<Role>Workflow`), differently-named registry getters (`get<Role>Template`), and their own `Client<Role>Template` types. Each needs a bespoke `previewPlan<Role>` + stage insertion. Reading all 7 is a prerequisite to planning it.
- **Gallery `?template=` deep-linking.** Linking a gallery card to a *specific* template inside a studio is entangled with the per-studio flow divergence above — marketing is task-first (a deep-linked template can't carry an empty task through the existing `stage.task`/`task` split), the others are template-first. Plan it alongside the rollout.
- **The 8-StudioClient duplication itself.** A shared studio-client abstraction would make both of the above trivial. It's the real fix; it's a larger refactor; it's flagged in memory `project_v16_studio_redesign`.

---

## NOTES FOR THE EXECUTOR

- **Verify before trusting.** This plan's code was reviewed once but the codebase shifts — confirm import names, type shapes, and line refs against the real files as you go. Where the plan says "confirm X", actually do it.
- **Design-agnostic:** components have minimal markup with `VISUAL:` comments. Final styling lands separately from Claude Design mockups. Keep structure semantic.
- **Commit cadence:** one commit per task (Part A) / per role (A5).
- **Out of scope for Step 1** (later Phase P steps — see DESIGN.md): connectors, Studio Playbooks, the trust surface.
