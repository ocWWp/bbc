# Phase P Step 1b — "One Way In" — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Collapse the 8 studio client components into one shared `TemplateFirstStudioClient`, roll plan-before-run to all 8 studios, add `?template=`/`?task=` deep-linking, add an "Ask BBC" router on `/gallery`, and retire the redundant `/studio` index.

**Architecture:** Additive and consolidating. A server-only cross-registry template resolver underpins one shared `previewPlan` server action. One shared `TemplateFirstStudioClient` (plan-confirm built in) replaces 8 near-duplicate clients via a config object — per-role divergence (`run<Role>Workflow`, overrides, legal's triage chip, copy, review style) becomes config, not copy-paste. Marketing's task-first propose/pick logic lifts up into a new "Ask BBC" router on `/gallery`. The `/studio` index is deleted once every inbound link is rewritten.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript, vitest (colocated `*.test.ts(x)`, jsdom opt-in via `// @vitest-environment jsdom` pragma), Supabase, Tailwind, Anthropic SDK.

---

## CRITICAL CONTEXT — read before starting

This plan was shaped by a codex design review (verdict on the first draft: BLOCKED) and a full facts-gathering pass. The findings that shape it:

1. **The sequence is load-bearing.** Plan-before-run is built into the shared client *from day one* (Step 2), not bolted on later. Marketing folds in **last** (Step 4) because it touches PR #9's shipped flow. Deep-linking (Step 5) needs the shared initial-state contract first. The router (Step 6) needs deep-linking first. `/studio` is retired **last** (Step 7), only after every inbound link is rewritten.

2. **The 8 studios share ONE `Template` interface.** It is single-source in `lib/studio/templates/types.ts` (the other 7 `types.ts` re-export it). `facets?: StudioRole[]` is on all 8. Each role has its own registry with its own getter (`getTemplate`, `getEngTemplate`, …) and its own `Client<Role>Template` type — but the client types are **structurally identical** except **legal**, whose `ClientLegalTemplate` adds `triageLevel: TriageLevel` and `triageNote: string`.

3. **`previewPlan`, `proposeWorkflows`, and `acceptStudioRun`/`rejectStudioRun`/`editStudioRun` exist ONLY in `app/studio/marketing/actions.ts`.** The other 7 studios have none. The 7 do their accept/reject on the separate `/studio/runs/[id]` page.

4. **Founder has NO override actions** (`app/studio/founder/actions.ts` ends after `runFounderWorkflow`). The other 6 non-marketing roles each have 4 override actions named `propose<Role>Override` / `save<Role>StudioTemplateOverride` / `listActive<Role>Overrides` / `deactivate<Role>StudioOverride`.

5. **Task max lengths differ by role:** marketing **500**, founder **800**, designer **800**, eng/support/finance/legal/hr **600**. `MIN_TASK_LEN` is **8** everywhere. Constant names: `MAX_TASK_LEN` / `MIN_TASK_LEN` in each `actions.ts`.

6. **The 6 clients eng/designer/support/finance/hr/legal are near-identical** (same `Stage` union, `pickTemplate`/`run`/`reset`, `EditWorkflowChat` + `ActiveOverridesPill` + inner `ReviewView`). Differences to fold into config: legal renders a `TriageChip` (3 places) + a `triageNote` callout in configure; support has an empty-state guard + renders `<select>` for select-kind inputs; founder lacks the override wiring; copy/char-limits vary. Marketing's `StudioClient` is the genuinely divergent one (task-first: `proposing`/`picking` stages).

Run commands from the repo root unless noted. Test command: `pnpm --filter @bbc/dashboard exec vitest run <path>`. Type-check: `pnpm --filter @bbc/dashboard type-check`. Build: `pnpm --filter @bbc/dashboard build`. Full suite: `pnpm --filter @bbc/dashboard test`. All paths below are under `apps/dashboard/src/` unless absolute.

---

## STEP 1 — Shared template resolver + shared `previewPlan`

No UI changes. Build the server-side substrate the shared client will sit on, fully tested across all 8 roles.

### Task 1.1: Centralize task-length AND input-length limits

The shared `previewPlan` must validate **like `run<Role>Workflow`**. The run actions cap both task length AND per-input length, and both differ by role — so both go in one shared map, and the 8 run actions repoint to it (preventing drift).

**Files:**
- Create: `apps/dashboard/src/lib/studio/task-limits.ts`
- Modify: all 8 `apps/dashboard/src/app/studio/<role>/actions.ts` (replace local `MIN_TASK_LEN`/`MAX_TASK_LEN` consts AND the per-value `.max(...)` in each `inputsRecordSchema`)

**Step 1: Create the shared maps**

```typescript
// apps/dashboard/src/lib/studio/task-limits.ts
// Single source of truth for studio input length bounds. Both the per-role run
// actions and the shared previewPlan read from here, so a plan can never be
// previewed under looser bounds than the run will enforce. Values verified
// against the current run actions — do not change without checking each.
import type { StudioRole } from "@/lib/studio/template-id";

export const TASK_MIN_LEN = 8;

export const TASK_MAX_LEN: Record<StudioRole, number> = {
  marketing: 500,
  engineering: 600,
  founder: 800,
  designer: 800,
  support: 600,
  finance: 600,
  legal: 600,
  hr: 600,
};

// Per-value cap on each firstUseInput string, per role. Matches the current
// `inputsRecordSchema` z.string().max(...) in each run action.
export const INPUT_MAX_LEN: Record<StudioRole, number> = {
  marketing: 2000,
  engineering: 3000,
  founder: 3000,
  support: 3000,
  designer: 5000,
  finance: 5000,
  legal: 5000,
  hr: 5000,
};
```

**Step 2: Repoint each `actions.ts`**

In each of the 8 `app/studio/<role>/actions.ts`:
- delete the local `const MIN_TASK_LEN = 8;` and `const MAX_TASK_LEN = <n>;` lines,
- add `import { TASK_MIN_LEN, TASK_MAX_LEN, INPUT_MAX_LEN } from "@/lib/studio/task-limits";`,
- replace usages: `MIN_TASK_LEN` → `TASK_MIN_LEN`, `MAX_TASK_LEN` → `TASK_MAX_LEN.<role>` (e.g. `TASK_MAX_LEN.engineering`),
- replace the per-value cap in that file's `inputsRecordSchema` (`z.record(z.string(), z.string().max(<n>))`) with `z.string().max(INPUT_MAX_LEN.<role>)`.
- Use the `StudioRole` key, not the route slug — note `engineering` (not `eng`).

Before editing, run `rg -n "inputsRecordSchema|MAX_TASK_LEN|MIN_TASK_LEN" apps/dashboard/src/app/studio/*/actions.ts` and confirm the current `.max(...)` value in each file matches `INPUT_MAX_LEN` above. If any differs, **the file is the source of truth** — fix the map, not the file.

**Step 3: Verify**

Run: `pnpm --filter @bbc/dashboard type-check`
Expected: PASS. Then `pnpm --filter @bbc/dashboard exec vitest run src/app/studio/marketing/preview-plan.test.ts` — expect PASS (marketing's existing previewPlan test still green).

**Step 4: Commit**

```bash
git add apps/dashboard/src/lib/studio/task-limits.ts apps/dashboard/src/app/studio/*/actions.ts
git commit -m "refactor(studio): centralize task + input length limits in one shared map"
```

---

### Task 1.2: Cross-registry template resolver

A `server-only` module that resolves any `templateId` to its owning role + full `Template`, dispatching across all 8 registries.

**Files:**
- Create: `apps/dashboard/src/lib/studio/resolve-template.ts`
- Test: `apps/dashboard/src/lib/studio/resolve-template.test.ts`

**Step 1: Write the failing test** (node env — exercises the real registries, like `gallery.test.ts`)

```typescript
// apps/dashboard/src/lib/studio/resolve-template.test.ts
import { describe, it, expect } from "vitest";
import { resolveTemplate } from "./resolve-template";
import { buildGallery } from "./gallery";

describe("resolveTemplate", () => {
  it("resolves a template from every role registry", () => {
    const gallery = buildGallery();
    const seenRoles = new Set<string>();
    for (const t of gallery) {
      const r = resolveTemplate(t.id);
      expect(r, `expected to resolve ${t.id}`).not.toBeNull();
      expect(r!.role).toBe(t.owningRole);
      expect(r!.template.id).toBe(t.id);
      seenRoles.add(r!.role);
    }
    expect(seenRoles.size).toBe(8);
  });

  it("returns null for an unknown id", () => {
    expect(resolveTemplate("marketing:does-not-exist")).toBeNull();
    expect(resolveTemplate("eng:nope")).toBeNull();
  });

  it("returns null for an unprefixed / unroutable id", () => {
    expect(resolveTemplate("garbage")).toBeNull();
  });
});
```

**Step 2: Run it — expect FAIL** (`resolve-template.ts` does not exist).

Run: `pnpm --filter @bbc/dashboard exec vitest run src/lib/studio/resolve-template.test.ts`

**Step 3: Implement `resolve-template.ts`**

```typescript
// apps/dashboard/src/lib/studio/resolve-template.ts
import "server-only";
// Resolves any templateId to its owning role + full Template, across all 8 role
// registries. SERVER-ONLY: side-effect-imports every registry's registration
// graph. roleForTemplateId only maps the id PREFIX; the actual lookup still
// needs the owning registry's getter, so both are used here.

import { roleForTemplateId, type StudioRole } from "@/lib/studio/template-id";
import type { Template } from "@/lib/studio/templates/types";

// Side-effect imports: register every role's templates.
import "@/lib/studio/templates";
import "@/lib/studio/eng-templates";
import "@/lib/studio/founder-templates";
import "@/lib/studio/designer-templates";
import "@/lib/studio/support-templates";
import "@/lib/studio/finance-templates";
import "@/lib/studio/legal-templates";
import "@/lib/studio/hr-templates";

import { getTemplate } from "@/lib/studio/templates/registry";
import { getEngTemplate } from "@/lib/studio/eng-templates/registry";
import { getFounderTemplate } from "@/lib/studio/founder-templates/registry";
import { getDesignerTemplate } from "@/lib/studio/designer-templates/registry";
import { getSupportTemplate } from "@/lib/studio/support-templates/registry";
import { getFinanceTemplate } from "@/lib/studio/finance-templates/registry";
import { getLegalTemplate } from "@/lib/studio/legal-templates/registry";
import { getHrTemplate } from "@/lib/studio/hr-templates/registry";

const GETTERS: Record<StudioRole, (id: string) => Template | undefined> = {
  marketing: getTemplate,
  engineering: getEngTemplate,
  founder: getFounderTemplate,
  designer: getDesignerTemplate,
  support: getSupportTemplate,
  finance: getFinanceTemplate,
  legal: getLegalTemplate,
  hr: getHrTemplate,
};

export type ResolvedTemplate = { role: StudioRole; template: Template };

export function resolveTemplate(templateId: string): ResolvedTemplate | null {
  const role = roleForTemplateId(templateId);
  if (!role) return null;
  const template = GETTERS[role](templateId);
  if (!template) return null;
  return { role, template };
}
```

> Confirm the getter export names against the registries as you go (the facts pack lists them; the Task 1.1 work will have just exercised these files). If `import "server-only"` trips vitest, note `vitest.config.ts` already aliases it to a stub.

**Step 4: Run the test — expect PASS.**

**Step 5: Commit**

```bash
git add apps/dashboard/src/lib/studio/resolve-template.ts apps/dashboard/src/lib/studio/resolve-template.test.ts
git commit -m "feat(studio): add server-only cross-registry template resolver"
```

---

### Task 1.3: Shared `previewPlan` server action

One `previewPlan` for all 8 roles. It must validate **like `run<Role>Workflow`** — task bounds AND required `firstUseInputs` — so a user can never confirm a plan that predictably fails at run time.

**Files:**
- Create: `apps/dashboard/src/lib/studio/preview-plan-action.ts`
- Test: `apps/dashboard/src/lib/studio/preview-plan-action.test.ts`

**Step 1: Read the reference**

- `app/studio/marketing/actions.ts` `previewPlan` (lines ~288-354) — the candidate-memory + always-on-context assembly to mirror.
- `app/studio/marketing/actions.ts` `runWorkflow` guards (lines ~356-392) — the required-input check to replicate (`for (const fi of template.firstUseInputs) if (fi.required && !inputs[fi.id]?.trim()) → error`).
- `lib/studio/plan-preview.ts` — the `PlanPreview` shape (do not change it).
- `app/studio/marketing/preview-plan.test.ts` — the mocking pattern to copy (mock `@/lib/auth/require-user`, `@/lib/supabase/server`; dynamic `await import()` inside each `it`).

**Step 2: Pick test fixtures from the real registries**

Before writing the test, run `rg -n "id:|firstUseInputs|required: true" apps/dashboard/src/lib/studio/eng-templates apps/dashboard/src/lib/studio/legal-templates` and pick, by reading the actual template files:
- `NO_REQ_ID` — a real template id whose `firstUseInputs` has **no** `required: true` entry (so `previewPlan(id, task, {})` is expected to succeed). Could be from any role.
- `REQ_ID` — a real template id that **does** have at least one `required: true` firstUseInput (so `previewPlan(id, task, {})` is expected to be rejected).
Substitute these into the test below. **Do not assume `eng:adr-draft` has no required inputs — it does.**

**Step 3: Write the failing test**

```typescript
// apps/dashboard/src/lib/studio/preview-plan-action.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const requireActorMock = vi.fn();
vi.mock("@/lib/auth/require-user", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth/require-user")>()),
  requireActor: () => requireActorMock(),
}));

// loadBrainSummary chain: .from().select().eq().eq().order().limit() -> { data }.
// This mock MUST match brain-summary.ts exactly or it throws before assertions.
vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServerClient: async () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            order: () => ({ limit: async () => ({ data: [], error: null }) }),
          }),
        }),
      }),
    }),
  }),
}));

function memberActor() {
  return { ok: true as const, actor: { user_id: "u1", tenant_id: "t1", role: "member", identifier: "u@x.com" } };
}

// Substitute real ids picked in Step 2:
const NO_REQ_ID = "<template id with no required firstUseInputs>";
const REQ_ID = "<template id with a required firstUseInput>";

beforeEach(() => {
  requireActorMock.mockReset();
  requireActorMock.mockResolvedValue(memberActor());
});

describe("previewPlan (shared)", () => {
  it("resolves a template with no required inputs and returns a plan", async () => {
    const { previewPlan } = await import("./preview-plan-action");
    const res = await previewPlan(NO_REQ_ID, "decide whether to keep Vercel or move", {});
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.plan.templateId).toBe(NO_REQ_ID);
      expect(res.plan.templateLabel).toBeTruthy();
      expect(Array.isArray(res.plan.candidateMemories)).toBe(true);
      expect(Array.isArray(res.plan.alwaysOnContext)).toBe(true);
    }
  });

  it("rejects an unknown template id", async () => {
    const { previewPlan } = await import("./preview-plan-action");
    expect((await previewPlan("eng:nope", "a valid length task", {})).ok).toBe(false);
  });

  it("rejects a too-short task", async () => {
    const { previewPlan } = await import("./preview-plan-action");
    expect((await previewPlan(NO_REQ_ID, "hi", {})).ok).toBe(false);
  });

  it("rejects when a required first-use input is missing", async () => {
    const { previewPlan } = await import("./preview-plan-action");
    expect((await previewPlan(REQ_ID, "a valid length task here", {})).ok).toBe(false);
  });

  it("rejects an unauthorized actor", async () => {
    requireActorMock.mockResolvedValueOnce({ ok: false, output: "nope" });
    const { previewPlan } = await import("./preview-plan-action");
    expect((await previewPlan(NO_REQ_ID, "a valid length task", {})).ok).toBe(false);
  });
});
```

> If no template anywhere has a `required: true` firstUseInput, drop the "required input missing" test and note it in the commit. (Confirm by grepping; one almost certainly exists.)

**Step 4: Run — expect FAIL.**

**Step 5: Implement `preview-plan-action.ts`**

The candidate-memory assembly and the `planSummary` copy are **lifted verbatim from the current `app/studio/marketing/actions.ts` `previewPlan`** (the version corrected in PR #9, commit `e7de654`) — do NOT paraphrase the trust copy. The only changes vs. marketing's version: `getTemplate` → `resolveTemplate` (cross-registry), and per-role `TASK_MAX_LEN`/`INPUT_MAX_LEN`.

```typescript
// apps/dashboard/src/lib/studio/preview-plan-action.ts
"use server";
// Shared plan-before-run preview for ALL 8 studios. Does NOT call the LLM.
// Validates like run<Role>Workflow (task bounds + per-role input caps + required
// first-use inputs) so a previewed plan can never be confirmed into a run that
// predictably fails. Candidate-memory + planSummary copy lifted verbatim from
// marketing/actions.ts previewPlan (PR #9 / e7de654) — keep the trust copy exact.

import { z } from "zod";
import { requireActor, requireRole } from "@/lib/auth/require-user";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { loadBrainSummary } from "@/lib/studio/brain-summary";
import { resolveTemplate } from "@/lib/studio/resolve-template";
import { TASK_MIN_LEN, TASK_MAX_LEN, INPUT_MAX_LEN } from "@/lib/studio/task-limits";
import type { PlanPreview } from "@/lib/studio/plan-preview";

export type PreviewPlanResult =
  | { ok: true; plan: PlanPreview }
  | { ok: false; error: string };

export async function previewPlan(
  templateId: string,
  task: string,
  inputs: Record<string, string>,
): Promise<PreviewPlanResult> {
  const a = await requireActor();
  if (!a.ok) return { ok: false, error: a.output };
  const r = requireRole(a.actor, "member");
  if (!r.ok) return { ok: false, error: r.output };

  const resolved = resolveTemplate(templateId);
  if (!resolved) return { ok: false, error: `Unknown template: ${templateId}` };
  const { role, template } = resolved;

  const trimmed = (task ?? "").trim();
  if (trimmed.length < TASK_MIN_LEN) {
    return { ok: false, error: `Describe the task in at least ${TASK_MIN_LEN} characters.` };
  }
  if (trimmed.length > TASK_MAX_LEN[role]) {
    return { ok: false, error: `Task too long -- keep it under ${TASK_MAX_LEN[role]} characters.` };
  }

  // Per-role input cap — matches the run action's inputsRecordSchema for `role`.
  const parsedInputs = z.record(z.string(), z.string().max(INPUT_MAX_LEN[role])).safeParse(inputs ?? {});
  if (!parsedInputs.success) return { ok: false, error: "Invalid inputs." };
  for (const fi of template.firstUseInputs) {
    if (fi.required && !(parsedInputs.data[fi.id] ?? "").trim()) {
      return { ok: false, error: `Missing required input: ${fi.label}` };
    }
  }

  const supabase = await getSupabaseServerClient();
  const brain = await loadBrainSummary(supabase, a.actor.tenant_id);

  // Candidate memory = every id-bearing brain type. metrics/comp_bands are
  // forward-wired (loadBrainSummary does not populate them yet) but are included
  // so finance/HR plans surface them automatically once that memory type lands.
  const candidateMemories: PlanPreview["candidateMemories"] = [
    ...brain.recent_decisions.map((d) => ({ id: d.id, kind: "decision", label: d.title })),
    ...brain.vendors.map((v) => ({ id: v.id, kind: "vendor", label: `${v.name} (${v.role})` })),
    ...brain.team.map((t) => ({ id: t.id, kind: "team", label: `${t.name} (${t.role})` })),
    ...(brain.glossary?.terms ?? []).map((g) => ({ id: g.id, kind: "glossary", label: g.term })),
    ...(brain.metrics ?? []).map((m) => ({ id: m.id, kind: "metric", label: `${m.label}: ${m.value}` })),
    ...(brain.comp_bands ?? []).map((c) => ({ id: c.id, kind: "comp_band", label: `${c.label}: ${c.range}` })),
  ];

  // voice + product feed every template's prompt but carry no id -- always-on
  // context, surfaced separately so a voice-only tenant never sees "nothing matched".
  const alwaysOnContext: string[] = [];
  if (brain.voice) alwaysOnContext.push("Voice");
  if (brain.product) alwaysOnContext.push("Product positioning");

  // planSummary — VERBATIM from marketing/actions.ts previewPlan (e7de654).
  const n = candidateMemories.length;
  const docKind = template.kind.replace(/_/g, " ");
  const grounding =
    n > 0
      ? `grounded in ${n} ${n === 1 ? "piece" : "pieces"} of your company memory` +
        (alwaysOnContext.length > 0 ? " plus your always-on voice and product context" : "")
      : alwaysOnContext.length > 0
        ? "drawing on your always-on voice and product context"
        : "based only on the task and inputs you typed";
  const planSummary =
    `Generate a ${docKind} using the "${template.label}" template, ${grounding}. ` +
    `The draft goes to your review queue -- nothing is sent, published, or written ` +
    `back to memory until you approve it.`;

  return {
    ok: true,
    plan: { templateId, templateLabel: template.label, task: trimmed, inputs: parsedInputs.data, planSummary, candidateMemories, alwaysOnContext },
  };
}
```

> Open `app/studio/marketing/actions.ts` `previewPlan` (lines ~288-354) and diff your `grounding`/`planSummary` against it — they must be character-identical. Confirm `requireRole`'s signature and `a.output` on the not-ok branch.

**Step 6: Run the test — expect PASS.**

**Step 7: Commit**

```bash
git add apps/dashboard/src/lib/studio/preview-plan-action.ts apps/dashboard/src/lib/studio/preview-plan-action.test.ts
git commit -m "feat(studio): add shared cross-registry previewPlan server action"
```

---

## STEP 2 — `TemplateFirstStudioClient` + migrate engineering

Build the shared client with the `plan-confirming` stage and the initial-seed contract built in from day one. Prove it on engineering (the representative 6-role shape).

### Task 2.1: Define the config + seed contract

**Files:**
- Create: `apps/dashboard/src/components/studio/template-first-config.ts`

**Step 1: Write the config types**

```typescript
// apps/dashboard/src/components/studio/template-first-config.ts
// The per-role configuration TemplateFirstStudioClient is parameterized by.
// Everything that genuinely diverges between the 8 studios lives here; the
// client component itself has zero role-specific branching.
import type { ReactNode } from "react";
import type { StudioRole } from "@/lib/studio/template-id";
import type { OutputBlock } from "@/lib/studio/output-blocks";
import type { CitedMemory } from "@/components/studio/OutputBlocks";

// Structural shape every Client<Role>Template satisfies (legal adds more).
export type StudioClientTemplate = {
  id: string;
  label: string;
  hint: string;
  kind: string;
  firstUseInputs: Array<{
    id: string; label: string; hint: string; required: boolean;
    kind: "text" | "select" | "tone"; options?: string[]; default?: string;
  }>;
};

export type RunWorkflowResult =
  | { ok: true; runId: string; blocks: OutputBlock[]; citedMemories: Array<{ id: string; title: string; type: string | null }> }
  | { ok: false; error: string };

// Override feature wiring (EditWorkflowChat + ActiveOverridesPill). Omitted by
// founder, which has no override flow.
export type OverridesConfig = {
  proposeAction: Parameters<typeof import("@/components/studio/EditWorkflowChat")["EditWorkflowChat"]>[0]["proposeAction"];
  saveAction: Parameters<typeof import("@/components/studio/EditWorkflowChat")["EditWorkflowChat"]>[0]["saveAction"];
  listAction: Parameters<typeof import("@/components/studio/ActiveOverridesPill")["ActiveOverridesPill"]>[0]["listAction"];
  deactivateAction: Parameters<typeof import("@/components/studio/ActiveOverridesPill")["ActiveOverridesPill"]>[0]["deactivateAction"];
};

// Review-stage style. "light" = edit-chat + "New run" (the 7). "full" = inline
// Approve/Reject + author hint (marketing only). Preserves current per-role
// behavior — see STEP-1B-DESIGN.md "Decisions locked".
export type ReviewConfig =
  | { kind: "light" }
  | {
      kind: "full";
      acceptAction: (runId: string) => Promise<{ ok: true } | { ok: false; error: string }>;
      rejectAction: (runId: string) => Promise<{ ok: true } | { ok: false; error: string }>;
      authorHint?: { name?: string; handle?: string; productName?: string; role?: string };
    };

export type TemplateFirstConfig<T extends StudioClientTemplate> = {
  role: StudioRole;
  templates: T[];
  runWorkflow: (templateId: string, task: string, inputs: Record<string, string>) => Promise<RunWorkflowResult>;
  overrides?: OverridesConfig;
  review: ReviewConfig;
  // Optional per-template adornments. Legal supplies both (triage chip + note).
  templateBadge?: (t: T) => ReactNode;
  templateConfigureNote?: (t: T) => ReactNode;
  copy: {
    taskLabel: string;       // "What are you working on?" etc.
    taskPlaceholder: string;
    generateLabel: string;   // "Generate" / "Generate draft"
  };
};

// Boot state — lets a page wrapper drop the client straight into `configuring`.
// Marketing's ?rerun= path and Step 5's ?template=&task= deep-link both produce
// this shape.
export type StudioSeed = {
  templateId: string;
  task: string;
  inputs: Record<string, string>;
};
```

> When implementing, confirm `OverridesConfig`'s action types against the real `EditWorkflowChat`/`ActiveOverridesPill` prop types — if the `Parameters<...>` indirection is awkward, import the exported action-result types directly (`ProposeOverrideResult`, `SaveOverrideResult`, `ActiveOverrideSummary` are exported from those components or the role `actions.ts`). `CitedMemory` and `OutputBlock` import paths: confirm against `components/studio/OutputBlocks.tsx` and `lib/studio/output-blocks.ts`.

**Step 2: Verify** — `pnpm --filter @bbc/dashboard type-check` — expect PASS (types only).

**Step 3: Commit**

```bash
git add apps/dashboard/src/components/studio/template-first-config.ts
git commit -m "feat(studio): add TemplateFirstStudioClient config contract"
```

---

### Task 2.2: Build `TemplateFirstStudioClient`

The shared client. Port the 6-role pattern (open `EngStudioClient.tsx` as the reference), and **add** the `plan-confirming` stage and the `initialSeed` boot path.

**Files:**
- Create: `apps/dashboard/src/components/studio/TemplateFirstStudioClient.tsx`
- Test: `apps/dashboard/src/components/studio/TemplateFirstStudioClient.test.tsx`

**Step 1: Write the failing test** (`// @vitest-environment jsdom`)

```tsx
// apps/dashboard/src/components/studio/TemplateFirstStudioClient.test.tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import TemplateFirstStudioClient from "./TemplateFirstStudioClient";
import type { TemplateFirstConfig, StudioClientTemplate } from "./template-first-config";

const previewPlan = vi.fn();
vi.mock("@/lib/studio/preview-plan-action", () => ({ previewPlan: (...a: unknown[]) => previewPlan(...a) }));

const TPL: StudioClientTemplate = {
  id: "eng:adr-draft", label: "Draft an ADR", hint: "decision record", kind: "plain",
  firstUseInputs: [],
};

function baseConfig(over: Partial<TemplateFirstConfig<StudioClientTemplate>> = {}): TemplateFirstConfig<StudioClientTemplate> {
  return {
    role: "engineering", templates: [TPL],
    runWorkflow: vi.fn(async () => ({ ok: true, runId: "r1", blocks: [], citedMemories: [] })),
    review: { kind: "light" },
    copy: { taskLabel: "What are you working on?", taskPlaceholder: "e.g. ...", generateLabel: "Generate" },
    ...over,
  };
}

beforeEach(() => {
  previewPlan.mockReset();
  previewPlan.mockResolvedValue({ ok: true, plan: {
    templateId: "eng:adr-draft", templateLabel: "Draft an ADR", task: "decide on hosting",
    inputs: {}, planSummary: "Generate a plain doc...", candidateMemories: [], alwaysOnContext: [],
  }});
});
afterEach(cleanup);

describe("TemplateFirstStudioClient", () => {
  it("renders the task input and template grid", () => {
    render(<TemplateFirstStudioClient config={baseConfig()} />);
    expect(screen.getByText("What are you working on?")).toBeTruthy();
    expect(screen.getByText("Draft an ADR")).toBeTruthy();
  });

  it("configuring -> submit calls previewPlan, NOT runWorkflow, and shows the plan", async () => {
    const config = baseConfig();
    render(<TemplateFirstStudioClient config={config} />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "decide on hosting provider" } });
    fireEvent.click(screen.getByText("Draft an ADR"));            // -> configuring
    fireEvent.click(screen.getByText("Generate"));                 // -> previewPlan
    await waitFor(() => expect(previewPlan).toHaveBeenCalledTimes(1));
    expect(config.runWorkflow).not.toHaveBeenCalled();
    expect(screen.getByText(/Generate a plain doc/)).toBeTruthy(); // plan summary visible
  });

  it("confirming the plan calls runWorkflow and advances to review", async () => {
    const config = baseConfig();
    render(<TemplateFirstStudioClient config={config} />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "decide on hosting provider" } });
    fireEvent.click(screen.getByText("Draft an ADR"));
    fireEvent.click(screen.getByText("Generate"));
    await waitFor(() => expect(screen.getByText(/Confirm/)).toBeTruthy());
    fireEvent.click(screen.getByText(/Confirm/));
    await waitFor(() => expect(config.runWorkflow).toHaveBeenCalledTimes(1));
  });

  it("boots straight into configuring from initialSeed", () => {
    render(<TemplateFirstStudioClient config={baseConfig()} initialSeed={{ templateId: "eng:adr-draft", task: "seeded task", inputs: {} }} />);
    // configuring stage shows the picked template + the seeded task
    expect(screen.getByDisplayValue("seeded task")).toBeTruthy();
  });
});
```

**Step 2: Run — expect FAIL.**

**Step 3: Implement `TemplateFirstStudioClient.tsx`**

Port `EngStudioClient.tsx`'s structure. Concretely:

- `"use client"`. Props: `{ config: TemplateFirstConfig<T>; initialSeed?: StudioSeed }`, generic `<T extends StudioClientTemplate>`.
- `Stage` union — the 6-role union **plus** `plan-confirming`:
  ```ts
  type Stage<T> =
    | { kind: "idle" }
    | { kind: "configuring"; template: T; task: string; inputs: Record<string,string> }
    | { kind: "plan-confirming"; template: T; task: string; inputs: Record<string,string>; plan: PlanPreview }
    | { kind: "running"; template: T; task: string }
    | { kind: "reviewing"; template: T; task: string; blocks: OutputBlock[]; cited: ...; runId: string }
    | { kind: "error"; message: string };
  ```
- Initial state: if `initialSeed` and `config.templates.find(t => t.id === initialSeed.templateId)` → `{ kind: "configuring", template, task: initialSeed.task, inputs: initialSeed.inputs }`; else `{ kind: "idle" }`. (Use a lazy `useState` initializer, like marketing's `StudioClient`.)
- `useTransition` for pending. A `stageRef` (useRef + useEffect) so async callbacks read fresh stage — copy marketing's pattern.
- Handlers:
  - `pickTemplate(t)` — idle → configuring, seed `inputs` from `firstUseInput.default`s (copy `EngStudioClient.pickTemplate`).
  - `requestPlan(inputs)` — configuring → calls the **imported** shared `previewPlan(template.id, task, inputs)` → on ok, → `plan-confirming`; on error, `setError`. (Mirror marketing's `handleRequestPlan`.)
  - `confirmPlan()` — plan-confirming → `running` → calls `config.runWorkflow(...)` → on ok → `reviewing`; on error → back to `configuring` + setError. (Mirror marketing's `handleConfirmPlan`.)
  - `backToConfigure()` — plan-confirming → configuring.
  - `reset()` — → idle, clear task/inputs, **and clear deep-link params** (see below).
- **Deep-link URL cleanup:** the client may boot from `initialSeed` (a `?template=&task=` deep link). Once the user diverges from that seed — picks a *different* template, or `reset()` — strip the stale params so a refresh/back doesn't resurrect them. Import `useRouter` + `usePathname` from `next/navigation`; in `pickTemplate` (when `t.id !== initialSeed?.templateId`) and in `reset()`, call `router.replace(pathname)`. Editing the task in place does **not** need a URL rewrite (the seed task is only read on mount). Keep it to those two call sites — do not over-engineer a sync.
- Render: task textarea (`config.copy.taskLabel` / `taskPlaceholder`, char counter against `TASK_MAX_LEN[config.role]` from `@/lib/studio/task-limits`), template grid (each card shows `config.templateBadge?.(t)` if provided), configuring section (inputs form — render `<select>` for `select`/`tone` kinds and `<textarea>` for `text`, like marketing's `FirstUseInputField`; show `config.templateConfigureNote?.(template)` if provided; `ActiveOverridesPill` if `config.overrides`), the `plan-confirming` branch (`<PlanConfirmStage plan={stage.plan} onConfirm={confirmPlan} onBack={backToConfigure} disabled={pending} />`), running skeleton, and `ReviewView`.
- `ReviewView`: renders `<OutputBlocks>`. If `config.overrides` → render `<EditWorkflowChat>` with `config.overrides.proposeAction`/`saveAction`. If `config.review.kind === "full"` → render Approve/Reject buttons wired to `config.review.acceptAction`/`rejectAction` + pass `config.review.authorHint` to `<OutputBlocks>`; else render the light "New run" button.
- Empty-state guard: if `config.templates.length === 0`, render the support-style empty section.
- Import `previewPlan` from `@/lib/studio/preview-plan-action`, `PlanConfirmStage` from `@/components/studio/PlanConfirmStage`, `PlanPreview` from `@/lib/studio/plan-preview`.

> This is a port, not net-new logic. Keep the existing Tailwind classes from `EngStudioClient.tsx` so the visual output is unchanged for the 7. Mobile fix (Task 2.3 territory) is the sidebar order, handled at the page-shell level — not here.

**Step 4: Run the test — expect PASS.**

**Step 5: Commit**

```bash
git add apps/dashboard/src/components/studio/TemplateFirstStudioClient.tsx apps/dashboard/src/components/studio/TemplateFirstStudioClient.test.tsx
git commit -m "feat(studio): add shared TemplateFirstStudioClient with plan-before-run"
```

---

### Task 2.3: Migrate engineering onto the shared client

**Files:**
- Modify (rewrite): `apps/dashboard/src/app/studio/engineering/EngStudioClient.tsx`
- Check: `apps/dashboard/src/app/studio/engineering/page.tsx` (likely unchanged)

**Step 1:** Rewrite `EngStudioClient.tsx` as a thin wrapper:

```tsx
"use client";
import TemplateFirstStudioClient from "@/components/studio/TemplateFirstStudioClient";
import type { ClientEngTemplate } from "@/lib/studio/eng-templates/registry";
import {
  deactivateEngStudioOverride, listActiveEngOverrides, proposeEngOverride,
  runEngineeringWorkflow, saveEngStudioTemplateOverride,
} from "./actions";

type Props = { templates: ClientEngTemplate[] };

export default function EngStudioClient({ templates }: Props) {
  return (
    <TemplateFirstStudioClient
      config={{
        role: "engineering",
        templates,
        runWorkflow: runEngineeringWorkflow,
        overrides: {
          proposeAction: proposeEngOverride,
          saveAction: saveEngStudioTemplateOverride,
          listAction: listActiveEngOverrides,
          deactivateAction: deactivateEngStudioOverride,
        },
        review: { kind: "light" },
        copy: {
          taskLabel: "What are you working on?",
          taskPlaceholder: "e.g. We're deciding whether to keep Vercel or move to Cloudflare Workers for the dashboard.",
          generateLabel: "Generate",
        },
      }}
    />
  );
}
```

> Confirm the `runEngineeringWorkflow` result type structurally matches `RunWorkflowResult` in the config — if the field names differ (e.g. `cited` vs `citedMemories`), adapt the config type or add a tiny adapter. The facts pack says all 8 run results share `{ ok; runId; blocks; citedMemories; ... }` — verify.

**Step 2:** `pnpm --filter @bbc/dashboard type-check` — expect PASS.

**Step 3 (manual):** dev server → sign in → `/studio/engineering` → type a task → pick a workflow → confirm the plan-confirm stage now appears → confirm → run → review. The override pill + edit-chat still work.

**Step 4: Commit**

```bash
git add apps/dashboard/src/app/studio/engineering/EngStudioClient.tsx
git commit -m "refactor(studio): migrate engineering onto TemplateFirstStudioClient"
```

---

## STEP 3 — Migrate the other 6 non-marketing roles

Each role: rewrite `*StudioClient.tsx` as a thin wrapper. One commit per role. `page.tsx` files stay as-is (they still pass `templates`).

### Task 3.1: founder

`overrides` is **omitted** (founder has no override actions). `review: { kind: "light" }`. Copy: task label/placeholder from the current `FounderStudioClient.tsx`, `generateLabel: "Generate"`. Commit: `refactor(studio): migrate founder onto TemplateFirstStudioClient`.

### Task 3.2: designer

Full `overrides` block (`proposeDesignerOverride` etc.). `review: { kind: "light" }`. Copy from the current `DesignerStudioClient.tsx`. Note designer's task max is **800** — already handled by `TASK_MAX_LEN.designer`. Commit per role.

### Task 3.3: support

Full `overrides` block. `review: { kind: "light" }`. The empty-state guard and `<select>` rendering are now in the shared client — nothing extra needed. Commit per role.

### Task 3.4: finance

Full `overrides` block. `review: { kind: "light" }`. Commit per role.

### Task 3.5: hr

Full `overrides` block. `review: { kind: "light" }`. `generateLabel: "Generate draft"`. Commit per role.

### Task 3.6: legal

Full `overrides` block. `review: { kind: "light" }`. `generateLabel: "Generate draft"`. **Plus the triage adornments:**
- `templateBadge: (t) => <TriageChip level={t.triageLevel} />`
- `templateConfigureNote: (t) => t.triageNote ? <callout>{t.triageNote}</callout> : null`

Move `TriageChip` + `TRIAGE_STYLE` out of the old `LegalStudioClient.tsx` into the new wrapper (or a small `legal/TriageChip.tsx`). `ClientLegalTemplate` carries `triageLevel`/`triageNote` — `TemplateFirstConfig<ClientLegalTemplate>` types through fine since `T extends StudioClientTemplate`. The `legal/page.tsx` wrapper (`<LegalDisclaimerBanner /> + <LegalStudioClient />`) stays. Commit: `refactor(studio): migrate legal onto TemplateFirstStudioClient`.

**After all 6:** `pnpm --filter @bbc/dashboard type-check && pnpm --filter @bbc/dashboard test` — expect PASS. Manual smoke each role's studio (plan-confirm appears, overrides work where expected, founder has no override pill, legal shows triage chip + note).

---

## STEP 4 — Fold marketing in (last)

Marketing's `StudioClient` becomes a wrapper over `TemplateFirstStudioClient`. It **loses** the bespoke `proposing`/`picking` task-first stages (that logic relocates to the router in Step 6) and **keeps**, via config: `plan-confirm`, overrides, the **full** review (Approve/Reject + author hint), and `?rerun=` boot.

> **Intermediate-state / deploy note:** between the Step 4 commit and the Step 6 commit, marketing is template-first with no in-app task-first shortcut (it still works — it has the `custom` template for free-form work — but the "type a task, get suggestions" entry is gone until the router lands). This is fine **as long as Steps 4–6 are not deployed independently.** The whole arc is one branch → one PR (as Step 1 was PR #9); the Step 4–6 commits land together and the router restores task-first for all 8 before merge. **Do not cut a release between the Step 4 and Step 6 commits.**

### Task 4.1: Rewrite marketing's `StudioClient.tsx` as a wrapper

**Files:**
- Modify (rewrite): `apps/dashboard/src/app/studio/marketing/StudioClient.tsx` — keep the `RerunSeed` export (page.tsx imports it) re-typed as `StudioSeed`, or re-export `StudioSeed` as `RerunSeed`.
- Modify: `apps/dashboard/src/app/studio/marketing/page.tsx` — `rerunSeed` → pass as `initialSeed`.
- Modify: `apps/dashboard/src/app/studio/marketing/StudioClient.test.tsx` — rewrite for the wrapper (it currently drives the bespoke flow; now it just asserts the wrapper passes config + seed through). Most coverage moves to `TemplateFirstStudioClient.test.tsx`.

**Step 1:** Rewrite `StudioClient.tsx`:

```tsx
"use client";
import TemplateFirstStudioClient from "@/components/studio/TemplateFirstStudioClient";
import type { StudioSeed } from "@/components/studio/template-first-config";
import type { ClientTemplate } from "@/lib/studio/templates/registry";
import {
  acceptStudioRun, deactivateStudioOverride, listActiveOverrides,
  proposeOverride, rejectStudioRun, runWorkflow, saveStudioTemplateOverride,
} from "./actions";

export type RerunSeed = StudioSeed; // page.tsx imports this name
type AuthorHint = { name?: string; handle?: string; productName?: string; role?: string };
type Props = { templates: ClientTemplate[]; authorHint?: AuthorHint; rerunSeed?: RerunSeed };

export default function StudioClient({ templates, authorHint, rerunSeed }: Props) {
  return (
    <TemplateFirstStudioClient
      initialSeed={rerunSeed}
      config={{
        role: "marketing",
        templates,
        runWorkflow,
        overrides: {
          proposeAction: proposeOverride, saveAction: saveStudioTemplateOverride,
          listAction: listActiveOverrides, deactivateAction: deactivateStudioOverride,
        },
        review: { kind: "full", acceptAction: acceptStudioRun, rejectAction: rejectStudioRun, authorHint },
        copy: {
          taskLabel: "What do you want to make?",
          taskPlaceholder: "Draft a launch tweet for our v1.0 announcement",
          generateLabel: "Generate",
        },
      }}
    />
  );
}
```

**Step 2:** Fix `marketing/page.tsx` for the new seed shape. It currently builds `rerunSeed = { templateId, label, task, inputs }`, but `StudioSeed` (and therefore the re-typed `RerunSeed`) has **no `label`** — the shared client resolves the label from the template by id. So in `marketing/page.tsx`: **drop `label` from the object it builds** (`{ templateId: r.template_id, task: r.task, inputs: r.inputs ?? {} }`), and drop the now-unused `templates.find(...).label` lookup if it was only feeding `label`. Keep the `templates.find(...)` existence check (a rerun whose template no longer exists must still be ignored). `type-check` will catch it if `label` is left in.

**Step 3:** Rewrite `StudioClient.test.tsx` — `// @vitest-environment jsdom`, mock `./actions` wholesale (as today) and `@/lib/studio/preview-plan-action`. Assert: renders the template grid; `initialSeed`/`rerunSeed` boots into configuring; the full review path (Approve/Reject) is wired. Delete assertions about `proposing`/`picking` (those stages no longer exist here).

**Step 4:** Delete now-dead marketing code: in `marketing/actions.ts` remove `previewPlan` + `PreviewPlanResult` + the `export type { PlanPreview }` line (the shared `previewPlan` replaces it; the shared client imports `PlanPreview` from `lib/studio/plan-preview` directly). **Leave `proposeWorkflows` + `PROPOSE_TOOL` + `PROPOSE_MODEL` + `listTemplateSummaries` in place** — Step 6 relocates them. Delete `marketing/preview-plan.test.ts` (superseded by `preview-plan-action.test.ts`).

**Step 5:** `pnpm --filter @bbc/dashboard type-check && pnpm --filter @bbc/dashboard exec vitest run src/app/studio/marketing/` — expect PASS.

**Step 6 (manual — this touches PR #9):** `/studio/marketing` → pick a template → configure → **plan-confirm appears** → confirm → run → **Approve/Reject still present** → author hint renders in output → `?rerun=<id>` still boots into configuring. Regression-check carefully.

**Step 7: Commit**

```bash
git add apps/dashboard/src/app/studio/marketing/
git commit -m "refactor(studio): fold marketing onto TemplateFirstStudioClient"
```

---

## STEP 5 — Deep-linking

All 8 `page.tsx` wrappers learn to read `?template=<id>` (+ optional `?task=`) and produce an `initialSeed`. Gallery cards link to the specific template.

### Task 5.1: Shared studio-entry resolver

**Files:**
- Create: `apps/dashboard/src/lib/studio/resolve-studio-entry.ts`
- Test: `apps/dashboard/src/lib/studio/resolve-studio-entry.test.ts`

**Step 1: Write the failing test** (node env)

```typescript
// apps/dashboard/src/lib/studio/resolve-studio-entry.test.ts
import { describe, it, expect } from "vitest";
import { resolveStudioEntry } from "./resolve-studio-entry";

describe("resolveStudioEntry", () => {
  it("returns a seed when ?template= matches the page role", () => {
    const seed = resolveStudioEntry("engineering", { template: "eng:adr-draft", task: "decide hosting" });
    expect(seed).toEqual({ templateId: "eng:adr-draft", task: "decide hosting", inputs: {} });
  });
  it("returns undefined for an unknown template id", () => {
    expect(resolveStudioEntry("engineering", { template: "eng:nope" })).toBeUndefined();
  });
  it("returns undefined when the template's owning role != the page role", () => {
    expect(resolveStudioEntry("legal", { template: "eng:adr-draft" })).toBeUndefined();
  });
  it("allows an empty task", () => {
    const seed = resolveStudioEntry("engineering", { template: "eng:adr-draft" });
    expect(seed).toEqual({ templateId: "eng:adr-draft", task: "", inputs: {} });
  });
  it("trims task to the role max length", () => {
    const long = "x".repeat(5000);
    const seed = resolveStudioEntry("engineering", { template: "eng:adr-draft", task: long });
    expect(seed!.task.length).toBe(600); // TASK_MAX_LEN.engineering
  });
  it("returns undefined when no template param is present", () => {
    expect(resolveStudioEntry("engineering", {})).toBeUndefined();
  });
  it("normalizes repeated search params (string[]) to the first value", () => {
    const seed = resolveStudioEntry("engineering", {
      template: ["eng:adr-draft", "eng:rfc-draft"],
      task: ["first", "second"],
    });
    expect(seed).toEqual({ templateId: "eng:adr-draft", task: "first", inputs: {} });
  });
});
```

**Step 2: Run — expect FAIL.**

**Step 3: Implement**

Next.js search params can arrive as `string | string[] | undefined` (repeated keys) — normalize before use.

```typescript
// apps/dashboard/src/lib/studio/resolve-studio-entry.ts
import "server-only";
// Resolves a studio page's ?template=&task= search params into a StudioSeed,
// validating the template exists AND its owning role matches the page. Used by
// all 8 studio page.tsx wrappers. Bad/foreign ids -> undefined (page boots idle).
import { resolveTemplate } from "@/lib/studio/resolve-template";
import { TASK_MAX_LEN } from "@/lib/studio/task-limits";
import type { StudioRole } from "@/lib/studio/template-id";
import type { StudioSeed } from "@/components/studio/template-first-config";

type RawParam = string | string[] | undefined;
const first = (p: RawParam): string | undefined => (Array.isArray(p) ? p[0] : p);

export function resolveStudioEntry(
  pageRole: StudioRole,
  params: { template?: RawParam; task?: RawParam },
): StudioSeed | undefined {
  const templateId = first(params.template);
  if (!templateId) return undefined;
  const resolved = resolveTemplate(templateId);
  if (!resolved || resolved.role !== pageRole) return undefined;
  const task = (first(params.task) ?? "").slice(0, TASK_MAX_LEN[pageRole]);
  return { templateId, task, inputs: {} };
}
```

**Step 4: Run — expect PASS.**

**Step 5: Commit**

```bash
git add apps/dashboard/src/lib/studio/resolve-studio-entry.ts apps/dashboard/src/lib/studio/resolve-studio-entry.test.ts
git commit -m "feat(studio): add shared studio deep-link entry resolver"
```

---

### Task 5.2: Wire `?template=&task=` into all 8 `page.tsx`

**Files:** all 8 `apps/dashboard/src/app/studio/<role>/page.tsx`.

**Step 1:** For each of the 7 non-marketing pages: add `searchParams: Promise<{ template?: string; task?: string }>` to the page props, `await` it, call `resolveStudioEntry("<role>", sp)`, pass the result as `initialSeed` to the client wrapper. The wrapper passes it through to `TemplateFirstStudioClient`.

> The 7 wrappers currently take only `{ templates }`. Add an `initialSeed?: StudioSeed` prop to each wrapper and thread it into the `<TemplateFirstStudioClient initialSeed={...} />`.

**Step 2:** For `marketing/page.tsx`: it already reads `searchParams` for `?rerun=`. Extend the type to `{ rerun?: string; template?: string; task?: string }`. **Precedence:** if `?rerun=` resolves to a seed, use it; else fall back to `resolveStudioEntry("marketing", sp)`. Pass whichever as `rerunSeed`/`initialSeed`.

**Step 3:** `pnpm --filter @bbc/dashboard type-check` — expect PASS.

**Step 4 (manual):** visit `/studio/engineering?template=eng:adr-draft&task=decide%20hosting` → boots into configuring with that template + task. Visit `/studio/legal?template=eng:adr-draft` → boots idle (foreign id ignored). Visit `/studio/marketing?rerun=<valid-run-id>` → rerun still works.

**Step 5: Commit**

```bash
git add apps/dashboard/src/app/studio/*/page.tsx
git commit -m "feat(studio): accept ?template= and ?task= deep links in all 8 studios"
```

---

### Task 5.3: Point gallery cards at the specific template

**Files:**
- Modify: `apps/dashboard/src/app/gallery/GalleryClient.tsx` — `TemplateCard` `<Link>` href.
- Test: `apps/dashboard/src/app/gallery/GalleryClient.test.tsx` (if it asserts hrefs) — update.

**Step 1:** In `TemplateCard`, change `href={`/studio/${tpl.owningRole}`}` → `href={`/studio/${tpl.owningRole}?template=${encodeURIComponent(tpl.id)}`}`.

**Step 2:** If `GalleryClient.test.tsx` asserts the old href, update it.

**Step 3:** `pnpm --filter @bbc/dashboard exec vitest run src/app/gallery/` — expect PASS.

**Step 4: Commit**

```bash
git add apps/dashboard/src/app/gallery/
git commit -m "feat(gallery): deep-link template cards to their specific template"
```

---

## STEP 6 — "Ask BBC" router

Generalize marketing's `proposeWorkflows` into a cross-registry router, and surface it as an "Ask BBC" box atop `/gallery`.

### Task 6.1: `routeTask` server action

**Files:**
- Create: `apps/dashboard/src/lib/studio/route-task-action.ts`
- Test: `apps/dashboard/src/lib/studio/route-task-action.test.ts`

**Step 1: Read the reference** — `app/studio/marketing/actions.ts` `proposeWorkflows` (the Haiku call, `PROPOSE_TOOL` schema, `proposeToolSchema` zod, the rate limiter, the id-filtering loop). The router is that logic, generalized over `buildGallery()` instead of `listTemplateSummaries()`.

**Step 2: Write the failing test** (node env) — mock `@/lib/auth/require-user`, `@/lib/supabase/server`, and `@/lib/secrets/anthropic-client` (stub `getAnthropicClient` to return a client whose `messages.create` returns a fixed `tool_use` block with 2 candidates). Assert: `routeTask` returns `ok: true` with candidates carrying `owningRole`; every returned `templateId` exists in `buildGallery()` and its `owningRole` is correct; an unknown id from the LLM is filtered out; a too-short task is rejected.

**Step 3: Implement `route-task-action.ts`**

`"use server"`. Export `RoutedTemplate = { templateId: string; owningRole: StudioRole; label: string; rationale: string }` and `RouteTaskResult = { ok: true; candidates: RoutedTemplate[] } | { ok: false; error: string }`. The action:
- `requireActor` → `requireRole("member")` → rate-limit (copy marketing's `proposeRateLimited`, max 10/60s).
- trim task, reject `< TASK_MIN_LEN`; cap the input at a generous length (e.g. 500).
- `const gallery = buildGallery();` → build `templateLines` from `gallery` (`- ${t.id} (${t.label}) [${t.roleLabel}]: ${t.hint}`).
- Haiku call with a generalized `PROPOSE_TOOL` (rename intent: "pick 2-4 templates across ALL studios that fit the task"). Same `tool_choice` forcing.
- Parse with the zod schema; filter to ids present in the gallery; for each kept id derive `owningRole` via the gallery entry (or `roleForTemplateId`); dedupe; cap 4; require ≥2.
- Carry over the cost-attribution `console.info` log.

**Step 4: Run the test — expect PASS.**

**Step 5: Commit**

```bash
git add apps/dashboard/src/lib/studio/route-task-action.ts apps/dashboard/src/lib/studio/route-task-action.test.ts
git commit -m "feat(studio): add cross-registry routeTask server action"
```

---

### Task 6.2: The "Ask BBC" box on `/gallery`

> **CLAUDE DESIGN:** This is the one new visual surface. Build it design-agnostic (semantic structure + `VISUAL:` comments) — the maintainer generates a mockup in parallel (prompt at the end of this plan). Keep the structure: a command input → submit → candidate cards → click navigates.

**Files:**
- Create: `apps/dashboard/src/app/gallery/AskBbc.tsx` (client component)
- Test: `apps/dashboard/src/app/gallery/AskBbc.test.tsx`
- Modify: `apps/dashboard/src/app/gallery/GalleryClient.tsx` — render `<AskBbc />` above the search.

**Step 1: Write the failing test** (`// @vitest-environment jsdom`) — mock `@/lib/studio/route-task-action` and `next/navigation`'s `useRouter`. Assert: typing + submit calls `routeTask`; candidate cards render (label + rationale + role badge); clicking a candidate calls `router.push("/studio/<owningRole>?template=<id>&task=<encoded>")`.

**Step 2: Run — expect FAIL.**

**Step 3: Implement `AskBbc.tsx`** — minimal, design-agnostic:

```tsx
// apps/dashboard/src/app/gallery/AskBbc.tsx
"use client";
// "Ask BBC" — the task-first router that sits atop the gallery. Type what you
// need; it routes to candidate templates across all 8 studios and deep-links
// into the structured plan-before-run flow. It NEVER generates directly.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { routeTask, type RoutedTemplate } from "@/lib/studio/route-task-action";

export default function AskBbc() {
  const router = useRouter();
  const [task, setTask] = useState("");
  const [candidates, setCandidates] = useState<RoutedTemplate[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const submit = () => {
    const t = task.trim();
    if (t.length < 8) { setError("Describe what you need in a few more words."); return; }
    setError(null);
    start(async () => {
      const res = await routeTask(t);
      if (!res.ok) { setError(res.error); setCandidates(null); return; }
      setCandidates(res.candidates);
    });
  };

  const open = (c: RoutedTemplate) =>
    router.push(`/studio/${c.owningRole}?template=${encodeURIComponent(c.templateId)}&task=${encodeURIComponent(task.trim())}`);

  return (
    <section aria-label="Ask BBC">
      {/* VISUAL: restyle from mockup. Structure must stay: input + submit, then candidate list. */}
      <label htmlFor="ask-bbc">Tell BBC what you need</label>
      <textarea id="ask-bbc" value={task} onChange={(e) => setTask(e.target.value)}
        placeholder="e.g. follow up with a customer who churned" />
      <button type="button" onClick={submit} disabled={pending || task.trim().length < 8}>
        {pending ? "Thinking…" : "Ask BBC"}
      </button>
      {error ? <p role="alert">{error}</p> : null}
      {candidates ? (
        <ul aria-label="Suggested workflows">
          {candidates.map((c) => (
            <li key={c.templateId}>
              <button type="button" onClick={() => open(c)}>
                <span>{c.label}</span>
                <span>{c.owningRole}</span>
                <span>{c.rationale}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
```

**Step 4:** In `GalleryClient.tsx`, render `<AskBbc />` above the `.gal-search` block.

**Step 5:** Run the test — expect PASS.

**Step 6: Commit**

```bash
git add apps/dashboard/src/app/gallery/AskBbc.tsx apps/dashboard/src/app/gallery/AskBbc.test.tsx apps/dashboard/src/app/gallery/GalleryClient.tsx
git commit -m "feat(gallery): add Ask BBC router box atop the gallery"
```

---

### Task 6.3: Remove the superseded marketing `proposeWorkflows`

**Files:**
- Modify: `apps/dashboard/src/app/studio/marketing/actions.ts`

**Step 1:** Now that the router exists and marketing no longer has propose/pick stages, delete from `marketing/actions.ts`: `proposeWorkflows`, `ProposeWorkflowsResult`, `TemplateProposal`, `PROPOSE_TOOL`, `proposeToolSchema`, `PROPOSE_MODEL`, `proposeRateLimits`/`proposeRateLimited`, and the now-unused `listTemplateSummaries` import. Grep for any remaining importers first: `rg "proposeWorkflows|TemplateProposal" apps/dashboard/src` — expect none after Step 4.

**Step 2:** `pnpm --filter @bbc/dashboard type-check` — expect PASS.

**Step 3: Commit**

```bash
git add apps/dashboard/src/app/studio/marketing/actions.ts
git commit -m "refactor(studio): remove superseded marketing proposeWorkflows"
```

---

## STEP 7 — Retire the `/studio` index

Only after every inbound link is rewritten. Move the cross-studio recent-runs to the gallery footer.

### Task 7.1: Move cross-studio recent runs to the gallery footer

**Files:**
- Modify: `apps/dashboard/src/app/gallery/page.tsx` — add the recent-runs query.
- Modify: `apps/dashboard/src/app/gallery/GalleryClient.tsx` — render a recent-runs footer.

**Step 1:** In `gallery/page.tsx`, after `requireActor()`, run the cross-studio query (copy verbatim from `app/studio/page.tsx` lines ~139-152) and pass `recentRuns` to `<GalleryClient templates={buildGallery()} recentRuns={recentRuns} />`.

**Step 2:** In `GalleryClient.tsx`, add `recentRuns` to `Props`, and render a footer section below the grid: the recent-runs list (copy the JSX + `relTime` helper from `app/studio/page.tsx` lines ~118-130, ~217-252), each row a `<Link href={`/studio/runs/${r.id}`}>`. Gate on `recentRuns.length > 0`.

**Step 3:** `pnpm --filter @bbc/dashboard exec vitest run src/app/gallery/` + `type-check` — expect PASS.

**Step 4: Commit**

```bash
git add apps/dashboard/src/app/gallery/
git commit -m "feat(gallery): show cross-studio recent runs in the gallery footer"
```

---

### Task 7.2: Rewrite every inbound `/studio` link, then delete the page

**Files:**
- Modify: `apps/dashboard/src/components/studio/StudioShell.tsx:52` — breadcrumb `href="/studio"` → `href="/gallery"`.
- Modify: `apps/dashboard/src/components/studio/RoleSwitcher.tsx:27` — the "← all" pill `href="/studio"` → `href="/gallery"` (and reconsider the "← all" label — "← gallery" is more accurate; keep minimal, label change optional).
- Modify: `apps/dashboard/src/app/studio/runs/[id]/page.tsx` (~line 139) — the run-detail breadcrumb links to `/studio`; repoint to `/gallery`.
- Modify: `apps/dashboard/src/app/gallery/GalleryClient.tsx` — remove the `<Link href="/studio">browse by studio</Link>` (the gallery *is* the browse surface now; the department chips are "by studio").
- Modify: `apps/dashboard/src/components/AppNav.tsx` — in `ADMIN_ROUTES`, replace `STUDIO_ROUTE` with `GALLERY_ROUTE`; in `OPERATOR_ROUTES`, remove `STUDIO_ROUTE` (`GALLERY_ROUTE` is already there). Leave `memberRoutes()` alone (it already uses a per-member `/studio/<slug>` link, not the index).
- Delete: `apps/dashboard/src/app/studio/page.tsx`.
- Tests: `apps/dashboard/test/nav-role-visibility.test.tsx` and `apps/dashboard/test/role-aware-root.test.ts` — update any assertions that expect a "Studio" index entry for admin/operator.

**Step 1:** Make all the link rewrites + the AppNav route-list edits. Before starting, run `rg -n "[\"\\\`]/studio[\"\\\`]|href=\"/studio\"" apps/dashboard/src` to get the authoritative current list of bare-`/studio` references — the four files above should be the complete set, but trust the grep over this list.

**Step 2:** Update the nav tests first (they should now expect Gallery, not the Studio index, for admin/operator). Run them — expect FAIL until Step 3.

**Step 3:** Delete `app/studio/page.tsx`.

**Step 4:** `rg "\"/studio\"|'/studio'|href=\"/studio\"|/studio[^/]" apps/dashboard/src` — confirm **zero** remaining references to the bare `/studio` index (only `/studio/<role>` and `/studio/runs/` should remain).

**Step 5:** `pnpm --filter @bbc/dashboard exec vitest run test/nav-role-visibility.test.tsx test/role-aware-root.test.ts` — expect PASS. Then `pnpm --filter @bbc/dashboard type-check && pnpm --filter @bbc/dashboard build` — build must succeed with no `/studio` route in the manifest.

**Step 6: Commit**

```bash
git add apps/dashboard/src/components/studio/StudioShell.tsx apps/dashboard/src/components/studio/RoleSwitcher.tsx apps/dashboard/src/components/AppNav.tsx apps/dashboard/src/app/gallery/GalleryClient.tsx apps/dashboard/test/
git rm apps/dashboard/src/app/studio/page.tsx
git commit -m "refactor(studio): retire the redundant /studio index page"
```

---

## FINAL VERIFICATION

**Step 1:** `pnpm --filter @bbc/dashboard type-check` — expect PASS.
**Step 2:** `pnpm --filter @bbc/dashboard test` — expect PASS (existing baseline + the new resolver, previewPlan, TemplateFirstStudioClient, resolve-studio-entry, routeTask, AskBbc tests; minus deleted marketing preview-plan test).
**Step 3:** `pnpm --filter @bbc/dashboard build` — clean compile; `/gallery` present, `/studio` (index) absent from the route manifest; the 8 `/studio/<role>` routes present.
**Step 4 (manual / browse handoff):** sign in → land on `/gallery` → "Ask BBC" box routes a typed task to candidates → click a candidate → deep-links into a studio → plan-confirm → run → review. Spot-check 3 studios incl. marketing (full review + rerun), founder (no override pill), legal (triage chip + note). Confirm no dead `/studio` links from breadcrumb / role-switcher / nav.
**Step 5:** Run `/codex review` on the branch diff; fix any `[P1]` before opening the PR. (Per [[feedback_codex_review_decisions]].)

---

## CLAUDE DESIGN PROMPT (for Task 6.2 — the "Ask BBC" surface)

Hand this to Claude Design in parallel; the plan ships Task 6.2 design-agnostic so nothing blocks on it:

> Design the "Ask BBC" command surface that sits at the top of BBC's template gallery
> (`/gallery`). BBC is an editorial, paper-palette web app — warm off-white background,
> serif-italic accent words in headers, supertag color dots, calm card primitives. The
> gallery below it is a dense searchable grid of ~48 template cards with department filter
> chips. "Ask BBC" is a single command input where a non-technical small-business user types
> what they need ("follow up with a customer who churned", "draft an NDA for a contractor")
> and gets 2-4 suggested workflow cards back — each with a label, a one-line rationale, and a
> department/role badge — that deep-link into a structured plan-before-run flow. It must feel
> like the calm, obvious front door, not a chatbot: it never generates content itself, it
> routes. Show three states: empty (just the input, inviting), thinking (loading), and results
> (the candidate cards). It must not visually overwhelm the search + chips + grid directly
> below it. Mobile matters — the gallery is an extremely long scroll on mobile, so this box is
> the fast path.

---

## DEFERRED (named, not in this arc)

- Gallery-card "reads from:" trust row — needs a `reads` field on the `Template` contract + authoring across ~48 templates. Its own follow-up.
- Normalizing the review stage across all 8 (inline accept/reject everywhere) — this arc preserves per-role review behavior via the `review` config.
- Cookie-banner overlap on page content — pre-existing, unrelated.
- Deduping the per-role run-action input caps / `MAX_OUTPUT_TOKENS` — only `MAX_TASK_LEN`/`MIN_TASK_LEN` were centralized here.
- Loop 2 / Loop 3, connectors, Studio Playbooks, the trust surface — later Phase P steps.
