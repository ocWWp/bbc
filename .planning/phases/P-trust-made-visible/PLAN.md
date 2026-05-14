# Phase P Step 1 — Template Gallery + Plan-Before-Run — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make a flat, searchable, role-faceted template gallery the app's home screen, and insert a "plan-before-run" confirmation step between picking a template and generating output.

**Architecture:** Additive, in two parts. **Part A (Gallery)** adds an optional `facets` field to the template contract, a new `lib/studio/gallery.ts` aggregator that unifies all 8 role registries into one searchable list, a new `/gallery` route, and a root-redirect change so operators/members land on the gallery. **Part B (Plan-before-run)** adds a `previewPlan` server action (mirrors `runWorkflow` but stops before the LLM call), a new `plan-confirming` stage in each StudioClient state machine, and a shared `PlanConfirmStage` component. Part B is proven on marketing first, then rolled out to the other 7. Visual layout is intentionally minimal — final styling comes from Claude Design mockups (see `DESIGN.md`).

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript, vitest (colocated `*.test.ts(x)`, jsdom via `// @vitest-environment jsdom` pragma), Supabase, Tailwind.

**Context the executor needs:**
- Read `.planning/phases/P-trust-made-visible/DESIGN.md` first — it has the thesis and the corrections baked in (esp: plan preview ≠ accept/reject; "candidate sources" not "final citations").
- Each studio role has its own registry under `apps/dashboard/src/lib/studio/{role}-templates/` (marketing is the exception: `apps/dashboard/src/lib/studio/templates/`). Each registry exports a `listClient<Role>Templates()` function — names vary; `grep -rn "listClient" apps/dashboard/src/lib/studio` to confirm each.
- There are 8 separate `*StudioClient.tsx` files, each with a duplicated `Stage` state machine. This duplication is known tech debt (see memory `project_v16_studio_redesign`). Step 1 does **not** refactor it into a shared abstraction — that's out of scope. Part B touches all 8.
- All paths below are relative to repo root. Run commands from `apps/dashboard/` unless noted. Test command pattern: `pnpm --filter @bbc/dashboard exec vitest run <path>`.

---

## PART A — TEMPLATE GALLERY

### Task A1: Add `facets` to the template contract

Cross-listing: a template is *owned* by its id-prefix role, but may declare additional roles it should also appear under in the gallery.

**Files:**
- Modify: `apps/dashboard/src/lib/studio/templates/types.ts` (the `Template` interface, ~line 72)
- Modify: `apps/dashboard/src/lib/studio/templates/registry.ts` (the `ClientTemplate` type ~line 37, and `listClientTemplates` ~line 45)

**Step 1: Add the type field**

In `types.ts`, add an import at the top and a field to `Template`:

```typescript
import type { StudioRole } from "@/lib/studio/template-id";
```

```typescript
export interface Template {
  id: string;
  label: string;
  hint: string;
  kind: PreviewKind;
  firstUseInputs: FirstUseInput[];
  // Additional roles this template should be cross-listed under in the gallery.
  // The OWNING role is always derived from the id prefix (roleForTemplateId);
  // `facets` is purely additive surfacing. Optional — most templates omit it.
  facets?: StudioRole[];
  buildPrompt(args: BuildPromptArgs): string;
}
```

(Confirm no circular import: `template-id.ts` imports nothing from `templates/`, so this is safe.)

**Step 2: Thread it through `ClientTemplate`**

In `registry.ts`, extend the `ClientTemplate` type and `listClientTemplates`:

```typescript
export type ClientTemplate = {
  id: string;
  label: string;
  hint: string;
  kind: Template["kind"];
  firstUseInputs: Template["firstUseInputs"];
  facets?: Template["facets"];
};

export function listClientTemplates(): ClientTemplate[] {
  return [...registry.values()].map((t) => ({
    id: t.id,
    label: t.label,
    hint: t.hint,
    kind: t.kind,
    firstUseInputs: t.firstUseInputs,
    facets: t.facets,
  }));
}
```

**Step 3: Mirror the `facets` passthrough in the other 7 registries**

Each role registry has its own `listClient<Role>Templates()`. For each (`eng-templates`, `founder-templates`, `designer-templates`, `support-templates`, `finance-templates`, `legal-templates`, `hr-templates`), add `facets: t.facets` to the mapped object, exactly as Step 2. If a registry re-uses the shared `ClientTemplate` type, only the function body needs the line.

**Step 4: Verify**

Run: `pnpm --filter @bbc/dashboard type-check`
Expected: PASS (no behavior change yet; this is a pure type+passthrough addition, exercised by Task A2).

**Step 5: Commit**

```bash
git add apps/dashboard/src/lib/studio/templates/types.ts apps/dashboard/src/lib/studio/templates/registry.ts apps/dashboard/src/lib/studio/*-templates/registry.ts
git commit -m "feat(gallery): add optional facets field to template contract"
```

---

### Task A2: Gallery aggregation module + filter

The single source of truth for the gallery: unifies all 8 registries, resolves each template's owning role + facets + role presentation data, and exposes a pure filter function.

**Files:**
- Create: `apps/dashboard/src/lib/studio/gallery.ts`
- Test: `apps/dashboard/src/lib/studio/gallery.test.ts`

**Step 1: Write the failing test**

```typescript
// apps/dashboard/src/lib/studio/gallery.test.ts
import { describe, it, expect } from "vitest";
import { buildGallery, filterGallery } from "./gallery";

describe("buildGallery", () => {
  it("aggregates templates from all 8 role registries", () => {
    const all = buildGallery();
    expect(all.length).toBeGreaterThan(30); // 8 roles, ~5+ templates each
    const roles = new Set(all.map((t) => t.owningRole));
    expect(roles.size).toBe(8);
  });

  it("derives owningRole from the id prefix and resolves role presentation", () => {
    const all = buildGallery();
    const marketing = all.find((t) => t.id.startsWith("marketing:"));
    expect(marketing?.owningRole).toBe("marketing");
    expect(marketing?.roleLabel).toBeTruthy();
    expect(marketing?.accentColor).toBeTruthy();
  });

  it("includes the owning role plus any facets in `roles`", () => {
    const all = buildGallery();
    for (const t of all) {
      expect(t.roles).toContain(t.owningRole);
    }
  });
});

describe("filterGallery", () => {
  it("matches query against label and hint, case-insensitive", () => {
    const all = buildGallery();
    const sample = all[0];
    const hit = filterGallery(all, { query: sample.label.toLowerCase() });
    expect(hit.some((t) => t.id === sample.id)).toBe(true);
  });

  it("filters by role, matching owning role OR a facet", () => {
    const all = buildGallery();
    const finance = filterGallery(all, { role: "finance" });
    expect(finance.every((t) => t.roles.includes("finance"))).toBe(true);
    expect(finance.length).toBeGreaterThan(0);
  });

  it("returns all templates when no filters are given", () => {
    const all = buildGallery();
    expect(filterGallery(all, {}).length).toBe(all.length);
  });
});
```

**Step 2: Run it to verify it fails**

Run: `pnpm --filter @bbc/dashboard exec vitest run src/lib/studio/gallery.test.ts`
Expected: FAIL — `gallery.ts` does not exist.

**Step 3: Implement `gallery.ts`**

```typescript
// apps/dashboard/src/lib/studio/gallery.ts
// Unified, searchable view over all 8 role template registries.
// The gallery is the app's home screen (Phase P Step 1).

import { ROLE_SHAPES } from "@/lib/studio/role-shapes";
import { roleForTemplateId, type StudioRole } from "@/lib/studio/template-id";
import type { ClientTemplate } from "@/lib/studio/templates/registry";

// Side-effect imports: register every role's templates into its registry.
// Mirrors the pattern in src/app/studio/page.tsx.
import "@/lib/studio/templates";
import "@/lib/studio/eng-templates";
import "@/lib/studio/founder-templates";
import "@/lib/studio/designer-templates";
import "@/lib/studio/support-templates";
import "@/lib/studio/finance-templates";
import "@/lib/studio/legal-templates";
import "@/lib/studio/hr-templates";

import { listClientTemplates } from "@/lib/studio/templates";
import { listClientEngTemplates } from "@/lib/studio/eng-templates";
import { listClientFounderTemplates } from "@/lib/studio/founder-templates";
import { listClientDesignerTemplates } from "@/lib/studio/designer-templates";
import { listClientSupportTemplates } from "@/lib/studio/support-templates";
import { listClientFinanceTemplates } from "@/lib/studio/finance-templates";
import { listClientLegalTemplates } from "@/lib/studio/legal-templates";
import { listClientHrTemplates } from "@/lib/studio/hr-templates";

// NOTE: confirm each export name with `grep -rn "listClient" apps/dashboard/src/lib/studio`
// before relying on the imports above — adjust if any differ.

export type GalleryTemplate = ClientTemplate & {
  owningRole: StudioRole;
  // Owning role + any declared facets. The set of roles this card appears under.
  roles: StudioRole[];
  roleLabel: string;
  accentColor: string;
};

const REGISTRY_LISTS: ReadonlyArray<() => ClientTemplate[]> = [
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
      if (!owningRole) continue; // unprefixed template — skip, not gallery-eligible
      const shape = ROLE_SHAPES[owningRole];
      const roles = Array.from(new Set<StudioRole>([owningRole, ...(t.facets ?? [])]));
      out.push({
        ...t,
        owningRole,
        roles,
        roleLabel: shape.label,
        accentColor: shape.accentColor,
      });
    }
  }
  return out.sort((a, b) => a.label.localeCompare(b.label));
}

export type GalleryFilter = {
  query?: string;
  role?: StudioRole;
};

export function filterGallery(
  templates: GalleryTemplate[],
  filter: GalleryFilter,
): GalleryTemplate[] {
  const q = filter.query?.trim().toLowerCase();
  return templates.filter((t) => {
    if (filter.role && !t.roles.includes(filter.role)) return false;
    if (q) {
      const haystack = `${t.label} ${t.hint}`.toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });
}
```

**Step 4: Run the test to verify it passes**

Run: `pnpm --filter @bbc/dashboard exec vitest run src/lib/studio/gallery.test.ts`
Expected: PASS. If the `length > 30` assertion fails, the thin studios still need Task A5 — note it and continue; A5 will satisfy it.

**Step 5: Commit**

```bash
git add apps/dashboard/src/lib/studio/gallery.ts apps/dashboard/src/lib/studio/gallery.test.ts
git commit -m "feat(gallery): add cross-role template aggregator and filter"
```

---

### Task A3: The `/gallery` route

**Files:**
- Create: `apps/dashboard/src/app/gallery/page.tsx` (server component)
- Create: `apps/dashboard/src/app/gallery/GalleryClient.tsx` (client component)
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
    // finance:runway has founder as a facet -> stays; marketing:tweet -> hidden
    expect(screen.getByText("Runway analysis")).toBeTruthy();
    expect(screen.queryByText("Tweet thread")).toBeNull();
  });
});
```

**Step 2: Run to verify it fails**

Run: `pnpm --filter @bbc/dashboard exec vitest run src/app/gallery/GalleryClient.test.tsx`
Expected: FAIL — `GalleryClient` does not exist.

**Step 3: Implement `GalleryClient.tsx`**

Minimal, design-agnostic layout. Final visual styling comes from the Claude Design mockups — keep structure clean and semantic so restyling is a CSS pass, not a rewrite.

```tsx
// apps/dashboard/src/app/gallery/GalleryClient.tsx
"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { filterGallery, type GalleryTemplate } from "@/lib/studio/gallery";
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
      {/* VISUAL: replace with mockup styling. Structure must stay: search + chips + grid. */}
      <input
        type="search"
        role="searchbox"
        aria-label="Search templates"
        placeholder="Search templates..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />

      <div role="group" aria-label="Filter by role">
        <button type="button" aria-pressed={role === null} onClick={() => setRole(null)}>
          All
        </button>
        {STUDIO_ROLES.map((r) => (
          <button
            key={r}
            type="button"
            aria-pressed={role === r}
            onClick={() => setRole(role === r ? null : r)}
          >
            {ROLE_SHAPES[r].label}
          </button>
        ))}
      </div>

      <ul>
        {visible.map((t) => (
          <li key={t.id}>
            <Link href={`/studio/${t.owningRole}?template=${encodeURIComponent(t.id)}`}>
              <span>{t.label}</span>
              <span>{t.hint}</span>
              <span>{t.kind}</span>
              <span>{t.roleLabel}</span>
            </Link>
          </li>
        ))}
      </ul>

      {visible.length === 0 ? <p>No templates match.</p> : null}
    </div>
  );
}
```

**Step 4: Run the test to verify it passes**

Run: `pnpm --filter @bbc/dashboard exec vitest run src/app/gallery/GalleryClient.test.tsx`
Expected: PASS.

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

  const templates = buildGallery();
  return <GalleryClient templates={templates} />;
}
```

**Step 6: Verify the route compiles**

Run: `pnpm --filter @bbc/dashboard type-check`
Expected: PASS.

**Step 7: Commit**

```bash
git add apps/dashboard/src/app/gallery/
git commit -m "feat(gallery): add /gallery route with search and role faceting"
```

---

### Task A4: Make the gallery the home screen

**Files:**
- Modify: `apps/dashboard/src/app/page.tsx:30` (root redirect)
- Modify: `apps/dashboard/src/components/AppNav.tsx` (route lists)
- Test: `apps/dashboard/test/role-aware-root.test.ts` (extend)

**Step 1: Update the failing test first**

In `test/role-aware-root.test.ts`, update the operator/member expectation: after login, operators and members redirect to `/gallery` (not `/studio/<slug>`). Admin still → `/home`; unauth → `/queue`; empty brain → `/welcome`. Add/adjust the assertions.

**Step 2: Run to verify it fails**

Run: `pnpm --filter @bbc/dashboard exec vitest run test/role-aware-root.test.ts`
Expected: FAIL — root still redirects to `/studio/<slug>`.

**Step 3: Change the root redirect**

In `apps/dashboard/src/app/page.tsx`, replace lines 29-30:

```typescript
  // Operators and members land on the gallery (Phase P Step 1) — the
  // browse-first home screen. Role-specific studios are still reachable
  // from a gallery card or the nav.
  redirect("/gallery");
```

(The `templateSlug` lookup at line 29 is now unused — remove it.)

**Step 4: Add the gallery to nav**

In `components/AppNav.tsx`, add a `GALLERY` route constant near the other route consts:

```typescript
const GALLERY: Route = {
  label: "Gallery",
  href: "/gallery",
  match: (p) => p === "/gallery" || p.startsWith("/gallery/"),
};
```

Include `GALLERY` in `OPERATOR_ROUTES` and in `memberRoutes()` (members get the gallery in addition to their assigned studio). Place it first, as the home entry. Leave `ADMIN_ROUTES` as-is unless the design says otherwise.

**Step 5: Run tests**

Run: `pnpm --filter @bbc/dashboard exec vitest run test/role-aware-root.test.ts test/nav-role-visibility.test.tsx`
Expected: PASS. If `nav-role-visibility` asserts an exact route list, update it to include "Gallery".

**Step 6: Commit**

```bash
git add apps/dashboard/src/app/page.tsx apps/dashboard/src/components/AppNav.tsx apps/dashboard/test/role-aware-root.test.ts apps/dashboard/test/nav-role-visibility.test.tsx
git commit -m "feat(gallery): make the gallery the home screen for operators and members"
```

---

### Task A5: Curated-depth pass for thin studios

The gallery must feel capable on first load (DESIGN.md decision: curated depth, not breadth). Engineering, Founder, and Designer studios have only 3 templates each; bring each to **at least 5**. This is content authoring — no new mechanism.

> This task can run in parallel with Part B — it touches only `lib/studio/{eng,founder,designer}-templates/`.

**Files (per thin role — example: engineering):**
- Create: `apps/dashboard/src/lib/studio/eng-templates/<new-template>.ts` (×2)
- Modify: `apps/dashboard/src/lib/studio/eng-templates/index.ts` (add side-effect imports)
- Test: existing `role-shapes.test.ts` + the registry's own test will validate registration.

**Step 1: Author each new template**

Follow the existing pattern exactly — open a current template in the same directory (e.g. `eng-templates/adr-draft.ts`) as the reference. Each new template:
- `id` MUST start with the role prefix (`eng:`, `founder:`, `design:`).
- Exports a `Template` object with `label`, `hint`, `kind` (use `"doc"` unless there's a better `PreviewKind`), `firstUseInputs`, and a `buildPrompt()` that uses the shared clauses (`voiceClause`, `overridesClause`, `CITATION_INSTRUCTION`) and leads cited lines with `[${id}]` so citations resolve.
- Optionally set `facets` if the template is genuinely relevant to another role (e.g. a `founder:` fundraising-memo template might set `facets: ["finance"]`).

Suggested additions (the executor may adjust — the bar is "distinct, high-signal, not filler"):
- **Engineering:** `eng:incident-retro`, `eng:rfc-draft`
- **Founder:** `founder:investor-update`, `founder:hiring-plan`
- **Designer:** `design:design-review-notes`, `design:component-spec`

**Step 2: Register them**

In each role's `index.ts`, add the side-effect import line for each new file, matching the existing entries.

**Step 3: Run the registry + role-shapes tests**

Run: `pnpm --filter @bbc/dashboard exec vitest run src/lib/studio/role-shapes.test.ts src/lib/studio/gallery.test.ts`
Expected: PASS — including the `buildGallery().length > 30` assertion from A2.

**Step 4: Commit (one commit per role)**

```bash
git add apps/dashboard/src/lib/studio/eng-templates/
git commit -m "feat(gallery): add 2 engineering templates for curated gallery depth"
```

Repeat for founder and designer.

---

## PART B — PLAN-BEFORE-RUN

> Proven on marketing (B1–B3), then rolled out to the other 7 (B4). Reminder from DESIGN.md: the plan step shows **intended retrieval scope + candidate memories before generation** — it is NOT the accept/reject queue, and it does NOT show final citations (those only exist post-generation).

### Task B1: `previewPlan` server action (marketing)

Mirror `runWorkflow` (`apps/dashboard/src/app/studio/marketing/actions.ts:273`) up to — but not including — the LLM call.

**Files:**
- Modify: `apps/dashboard/src/app/studio/marketing/actions.ts`
- Test: `apps/dashboard/src/app/studio/marketing/preview-plan.test.ts`

**Step 1: Write the failing test**

```typescript
// apps/dashboard/src/app/studio/marketing/preview-plan.test.ts
import { describe, it, expect, vi } from "vitest";

// Mock the LLM client module so we can assert it is NEVER called.
const llmCall = vi.fn();
vi.mock("@/lib/anthropic/client", () => ({
  // adjust to the actual export(s) used by runWorkflow — grep actions.ts imports
  callModel: (...args: unknown[]) => llmCall(...args),
}));

// Mock supabase + auth following the pattern in the existing actions tests
// in this directory (open one to copy the harness).

describe("previewPlan", () => {
  it("returns a plan summary and candidate memories without calling the LLM", async () => {
    const { previewPlan } = await import("./actions");
    const res = await previewPlan("marketing:single-x-post", "draft a launch tweet", {});
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.planSummary).toBeTruthy();
      expect(Array.isArray(res.candidateMemories)).toBe(true);
    }
    expect(llmCall).not.toHaveBeenCalled();
  });

  it("rejects an unknown template id", async () => {
    const { previewPlan } = await import("./actions");
    const res = await previewPlan("marketing:does-not-exist", "x", {});
    expect(res.ok).toBe(false);
  });
});
```

> Before writing this, open an existing test in `app/studio/marketing/` (e.g. an actions test) to copy the exact supabase/auth mock harness and the real LLM client import path. Adjust the mock above to match.

**Step 2: Run to verify it fails**

Run: `pnpm --filter @bbc/dashboard exec vitest run src/app/studio/marketing/preview-plan.test.ts`
Expected: FAIL — `previewPlan` is not exported.

**Step 3: Implement `previewPlan`**

Read `runWorkflow` at `actions.ts:273` first. It: resolves the actor, `getTemplate(templateId)` (~:287), runs `loadBrainSummary(supabase, tenantId)` (~:319), calls `template.buildPrompt({...})` (~:324), then calls the LLM. `previewPlan` does everything up to `buildPrompt` and returns instead of calling the model.

Add to `actions.ts`:

```typescript
export type PlanPreview = {
  templateId: string;
  templateLabel: string;
  task: string;
  inputs: Record<string, string>;
  // Human-readable, plain-language summary of what the run will do.
  planSummary: string;
  // The brain rows that WILL be available to the run — intended retrieval
  // scope, NOT final citations. Final citations only exist post-generation.
  candidateMemories: Array<{ id: string; kind: string; label: string }>;
};

export type PreviewPlanResult =
  | { ok: true } & { plan: PlanPreview }
  | { ok: false; error: string };

export async function previewPlan(
  templateId: string,
  task: string,
  inputs: Record<string, string>,
): Promise<PreviewPlanResult> {
  const a = await requireActor();
  if (!a.ok) return { ok: false, error: "Not authorized." };

  const template = getTemplate(templateId);
  if (!template) return { ok: false, error: "Unknown template." };

  const supabase = await getSupabaseServerClient();
  const brain = await loadBrainSummary(supabase, a.actor.tenant_id);

  // Candidate memories = the brain rows this run can draw on. Flatten the
  // BrainSummary shape into a uniform list for the confirm UI.
  const candidateMemories: PlanPreview["candidateMemories"] = [
    ...brain.recent_decisions.map((d) => ({ id: d.id, kind: "decision", label: d.title })),
    ...brain.vendors.map((v) => ({ id: v.id, kind: "vendor", label: `${v.name} (${v.role})` })),
    ...brain.team.map((t) => ({ id: t.id, kind: "team", label: `${t.name} (${t.role})` })),
    ...(brain.glossary?.terms ?? []).map((g) => ({ id: g.id, kind: "glossary", label: g.term })),
  ];

  const planSummary =
    `Generate a ${template.kind.replace(/_/g, " ")} using the "${template.label}" template, ` +
    `grounded in ${candidateMemories.length} brain ${candidateMemories.length === 1 ? "memory" : "memories"}. ` +
    `Output goes to the review queue — nothing is sent or saved until you accept it.`;

  return {
    ok: true,
    plan: {
      templateId,
      templateLabel: template.label,
      task,
      inputs,
      planSummary,
      candidateMemories,
    },
  };
}
```

> Adjust import names (`requireActor`, `getSupabaseServerClient`, `getTemplate`, `loadBrainSummary`) to whatever `actions.ts` already imports — they're all already used by `runWorkflow`, so no new imports should be needed.

**Step 4: Run the test to verify it passes**

Run: `pnpm --filter @bbc/dashboard exec vitest run src/app/studio/marketing/preview-plan.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add apps/dashboard/src/app/studio/marketing/actions.ts apps/dashboard/src/app/studio/marketing/preview-plan.test.ts
git commit -m "feat(plan-step): add previewPlan server action for marketing studio"
```

---

### Task B2: `plan-confirming` stage in the marketing StudioClient

**Files:**
- Modify: `apps/dashboard/src/app/studio/marketing/StudioClient.tsx`
- Modify: `apps/dashboard/src/app/studio/marketing/page.tsx` (handle `?template=` deep-link from gallery cards)
- Test: `apps/dashboard/src/app/studio/marketing/StudioClient.test.tsx` (create if absent, else extend)

**Step 1: Write the failing test**

Test the new transition: from `configuring`, triggering the run now goes to `plan-confirming` (calls `previewPlan`), and from `plan-confirming`, confirming goes to `running` (calls `runWorkflow`). Mock both server actions. Copy the harness from any existing `*StudioClient.test.tsx` if one exists; otherwise model it on `GalleryClient.test.tsx` with `// @vitest-environment jsdom`.

Assertions:
- After filling inputs and submitting in `configuring`, `previewPlan` is called and `runWorkflow` is NOT yet called.
- The plan summary text renders.
- Clicking "Confirm & generate" calls `runWorkflow` and advances to the review stage.
- Clicking "Back" returns to `configuring` without calling `runWorkflow`.

**Step 2: Run to verify it fails**

Run: `pnpm --filter @bbc/dashboard exec vitest run src/app/studio/marketing/StudioClient.test.tsx`
Expected: FAIL.

**Step 3: Add the stage to the state machine**

In `StudioClient.tsx`:

1. Import `previewPlan` and `type PlanPreview` from `./actions`.
2. Add to the `Stage` union (after `configuring`, before `running`):

```typescript
  | {
      kind: "plan-confirming";
      task: string;
      candidate: TemplateProposal;
      inputs: Record<string, string>;
      plan: PlanPreview;
    }
```

3. Split `handleRun`. The current `handleRun` (line ~161) goes `configuring → running`. Replace with two callbacks:

```typescript
// configuring -> plan-confirming
const handleRequestPlan = useCallback((inputs: Record<string, string>) => {
  setError(null);
  const current = stageRef.current;
  if (current.kind !== "configuring") return;
  const { task: runTask, candidate } = current;
  startTransition(async () => {
    const res = await previewPlan(candidate.templateId, runTask, inputs);
    if (!res.ok) {
      setError(res.error);
      return;
    }
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
    setStage({
      kind: "reviewing", task: runTask, candidate, inputs,
      runId: res.runId, blocks: res.blocks, citedMemories: res.citedMemories, reviewed: null,
    });
  });
}, []);
```

4. Update `<ConfigureStage onRun={handleRequestPlan} ... />` (was `handleRun`).
5. Add the render branch (after the `configuring` branch, before `running`):

```tsx
{stage.kind === "plan-confirming" ? (
  <PlanConfirmStage
    plan={stage.plan}
    onConfirm={handleConfirmPlan}
    onBack={() =>
      setStage({ kind: "configuring", task: stage.task, candidate: stage.candidate, inputs: stage.inputs })
    }
    disabled={isPending}
  />
) : null}
```

(Import `PlanConfirmStage` from `@/components/studio/PlanConfirmStage` — built in Task B3.)

**Step 4: Handle the `?template=` deep-link**

In `marketing/page.tsx`, extend the existing `searchParams` handling (currently `{ rerun?: string }` at line 21). Add `template?: string`: when present and it resolves to a registered template, seed the client straight into `configuring` (reuse the `RerunSeed` shape with an empty `task` and default inputs, or add a parallel `templateSeed` prop — mirror how `rerun` is wired). Keep it minimal.

**Step 5: Run the test to verify it passes**

Run: `pnpm --filter @bbc/dashboard exec vitest run src/app/studio/marketing/StudioClient.test.tsx`
Expected: PASS (after B3 exists — if running B2 before B3, stub `PlanConfirmStage` minimally, then complete in B3).

**Step 6: Commit**

```bash
git add apps/dashboard/src/app/studio/marketing/StudioClient.tsx apps/dashboard/src/app/studio/marketing/page.tsx apps/dashboard/src/app/studio/marketing/StudioClient.test.tsx
git commit -m "feat(plan-step): insert plan-confirming stage into marketing StudioClient"
```

---

### Task B3: Shared `PlanConfirmStage` component

**Files:**
- Create: `apps/dashboard/src/components/studio/PlanConfirmStage.tsx`
- Test: `apps/dashboard/src/components/studio/PlanConfirmStage.test.tsx`

**Step 1: Write the failing test**

```tsx
// apps/dashboard/src/components/studio/PlanConfirmStage.test.tsx
// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PlanConfirmStage } from "./PlanConfirmStage";
import type { PlanPreview } from "@/app/studio/marketing/actions";

const PLAN: PlanPreview = {
  templateId: "marketing:single-x-post",
  templateLabel: "Single X post",
  task: "draft a launch tweet",
  inputs: {},
  planSummary: "Generate an x post grounded in 2 brain memories.",
  candidateMemories: [
    { id: "m1", kind: "decision", label: "Ship self-host first" },
    { id: "m2", kind: "voice", label: "direct, lowercase" },
  ],
};

describe("PlanConfirmStage", () => {
  it("shows the plan summary and candidate memories", () => {
    render(<PlanConfirmStage plan={PLAN} onConfirm={() => {}} onBack={() => {}} disabled={false} />);
    expect(screen.getByText(/grounded in 2 brain memories/i)).toBeTruthy();
    expect(screen.getByText("Ship self-host first")).toBeTruthy();
  });

  it("fires onConfirm and onBack", () => {
    const onConfirm = vi.fn();
    const onBack = vi.fn();
    render(<PlanConfirmStage plan={PLAN} onConfirm={onConfirm} onBack={onBack} disabled={false} />);
    fireEvent.click(screen.getByRole("button", { name: /confirm/i }));
    fireEvent.click(screen.getByRole("button", { name: /back/i }));
    expect(onConfirm).toHaveBeenCalledOnce();
    expect(onBack).toHaveBeenCalledOnce();
  });

  it("disables the confirm button when disabled", () => {
    render(<PlanConfirmStage plan={PLAN} onConfirm={() => {}} onBack={() => {}} disabled />);
    expect(screen.getByRole("button", { name: /confirm/i })).toHaveProperty("disabled", true);
  });
});
```

**Step 2: Run to verify it fails**

Run: `pnpm --filter @bbc/dashboard exec vitest run src/components/studio/PlanConfirmStage.test.tsx`
Expected: FAIL.

**Step 3: Implement the component**

Minimal, design-agnostic. Clean semantic structure for later restyling from mockups.

```tsx
// apps/dashboard/src/components/studio/PlanConfirmStage.tsx
"use client";

import { Button } from "@/components/ui/button";
import type { PlanPreview } from "@/app/studio/marketing/actions";

type Props = {
  plan: PlanPreview;
  onConfirm: () => void;
  onBack: () => void;
  disabled: boolean;
};

// Shown after the user configures a template, before generation runs.
// This previews INTENT (what will happen, which memory is in scope) — it is
// NOT the accept/reject review of produced output. See Phase P DESIGN.md.
export function PlanConfirmStage({ plan, onConfirm, onBack, disabled }: Props) {
  return (
    <div>
      {/* VISUAL: restyle from mockups. Structure must stay: summary, scope list, actions. */}
      <h2>Review your plan</h2>
      <p>{plan.planSummary}</p>

      <section aria-label="Memory in scope">
        <h3>What this draws on</h3>
        {plan.candidateMemories.length === 0 ? (
          <p>No brain memories matched — the draft will rely only on your task and inputs.</p>
        ) : (
          <ul>
            {plan.candidateMemories.map((m) => (
              <li key={m.id}>
                <span>{m.kind}</span>
                <span>{m.label}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div>
        <Button type="button" onClick={onBack} disabled={disabled} variant="ghost">
          Back
        </Button>
        <Button type="button" onClick={onConfirm} disabled={disabled}>
          Confirm &amp; generate
        </Button>
      </div>
    </div>
  );
}
```

> `PlanPreview` is exported from `marketing/actions.ts`. If importing a type from a route's `actions.ts` into `components/` feels wrong, lift `PlanPreview` into `apps/dashboard/src/lib/studio/plan-preview.ts` and re-export from `actions.ts` — do that lift here in B3 so B4's rollout imports cleanly.

**Step 4: Run the test to verify it passes**

Run: `pnpm --filter @bbc/dashboard exec vitest run src/components/studio/PlanConfirmStage.test.tsx`
Expected: PASS.

**Step 5: Commit**

```bash
git add apps/dashboard/src/components/studio/PlanConfirmStage.tsx apps/dashboard/src/components/studio/PlanConfirmStage.test.tsx apps/dashboard/src/lib/studio/plan-preview.ts
git commit -m "feat(plan-step): add shared PlanConfirmStage component"
```

---

### Task B4: Roll out plan-before-run to the other 7 studios

Repeat B1 + B2 for each of: `engineering`, `founder`, `designer`, `support`, `finance`, `legal`, `hr`. The shared `PlanConfirmStage` (B3) and the lifted `PlanPreview` type are reused as-is.

**Per role, the steps are mechanical:**
1. **`previewPlan` action** — add to `app/studio/<role>/actions.ts`, copying B1's implementation. Each role's `runWorkflow` already loads the brain the same way; mirror it. Write the matching `preview-plan.test.ts`.
2. **`plan-confirming` stage** — add to `app/studio/<role>/<Role>StudioClient.tsx`, exactly as B2 (the `Stage` union member, `handleRequestPlan`/`handleConfirmPlan` split, the render branch, the `ConfigureStage` `onRun` swap). Extend that role's client test.
3. **`?template=` deep-link** — extend `app/studio/<role>/page.tsx` `searchParams`, as B2 Step 4.
4. **Commit per role:** `git commit -m "feat(plan-step): add plan-confirming stage to <role> studio"`

**Watch for divergence:** the 8 StudioClients are duplicated but not identical (e.g. Legal has the `LegalDisclaimerBanner`, Designer/Support have the override-edit flow). Don't assume copy-paste works verbatim — diff each client against marketing's structure first and adapt. Where a role's `runWorkflow` differs, `previewPlan` must match *that role's* brain-loading.

> Known tech debt, explicitly out of scope: this rollout duplicates the same change across 8 files because the StudioClients were never unified (see memory `project_v16_studio_redesign`). A shared studio-client abstraction is a candidate for a later Phase P step or its own refactor — do NOT attempt it here.

---

## FINAL VERIFICATION

**Step 1: Full type-check**

Run: `pnpm --filter @bbc/dashboard type-check`
Expected: PASS, no errors.

**Step 2: Full test suite**

Run: `pnpm --filter @bbc/dashboard test`
Expected: PASS — all prior tests (547+ baseline) plus the new gallery, previewPlan, StudioClient, and PlanConfirmStage tests.

**Step 3: Production build**

Run: `pnpm --filter @bbc/dashboard build`
Expected: compiles clean; `/gallery` appears in the route manifest.

**Step 4: Manual smoke (if a dev environment is available)**

- Log in as an operator → land on `/gallery`.
- Search filters cards; role chips filter (including facet matches).
- Click a card → `/studio/<role>?template=<id>` boots into `configuring`.
- Fill inputs → submit → `plan-confirming` shows the plan summary + candidate memories.
- "Confirm & generate" → run completes → review stage. "Back" → returns to `configuring`.

> Authed Studio UI can't be headless-smoke-tested (invite-only auth, no browser cookies) — note this as a manual-only check, consistent with prior phases.

**Step 5: Codex review before opening the PR**

Per the maintainer's standing ask, run `/codex review` on the branch diff and fix any `[P1]` before the PR.

---

## NOTES FOR THE EXECUTOR

- **DRY / YAGNI:** Part B is deliberately repetitive across 8 files rather than abstracted — the abstraction is out of scope and would balloon the change. Resist refactoring the StudioClients.
- **Design-agnostic:** every component here has minimal markup with `VISUAL:` comments. Final styling lands separately from Claude Design mockups. Keep structure semantic so restyling is a CSS pass.
- **Commit cadence:** one commit per task (Part A) / per role (Part B), as marked.
- **Out of scope for Step 1** (later Phase P steps — see DESIGN.md): connectors, Studio Playbooks, the trust surface.
