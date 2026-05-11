# Phase J — Marketing Studio v1 implementation plan

> **For Claude:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task.

**Goal:** Ship the hero feature described in design doc §6. Founder describes a marketing task in one textarea; BBC proposes 2-4 candidate workflows from a hand-authored library of 10; founder picks one; a mini-onboarding card collects the inputs the picked workflow needs; BBC runs the workflow against the brain; the output renders as the actual platform's card (X post / LinkedIn card / etc.) inside a canvas; the run lands as a queue item for approve/reject/edit.

**Output:** After Phase J, `/studio/marketing` works end-to-end against a real brain. A founder pastes "draft a launch tweet announcing our v1.0" → sees 2-4 cards (Single X post · Tweet thread · Cross-platform · …) → picks Single X post → fills 1-2 inputs (audience? tone override?) → sees a live X-card preview citing the `product` + `voice` memories that informed it → can approve / reject / edit. Recent runs appear as quick-launch chips. Conversational editing ("this always misses our product taglines — fix it") materializes a tenant-scoped template override.

**Non-goals (deferred):**
- Visual canvas editor for workflows (v1.1+ per §6)
- Per-platform actual posting / OAuth out (just generates content; copy-to-clipboard or download)
- Image generation (text only in v1)
- Multi-language outputs (English only in v1)
- `/studio/<other>` routes — only `/marketing` ships in Phase J

**Architecture:**
- **Templates: code files** (decided 2026-05-11 — option recommended in plan kickoff). `src/lib/studio/templates/` holds 10 hand-authored `.ts` files, each exporting a `Template` object: `{ id, kind, label, hint, firstUseInputs[], prompt(ctx), outputBlocks(): PreviewBlockKind[] }`. Registry index loads them via side-effect imports.
- **Schema:** 2 new tables. `studio_runs` (one row per execution: task, template_id, inputs jsonb, output_blocks jsonb, cited_memory_ids uuid[], status, created_at). `studio_template_overrides` (tenant-scoped customizations to a template: template_id, override_kind, override_value, source_run_id — created via conversational editing).
- **Pipeline:** `proposeWorkflows(task)` → LLM gets brain summary + task → returns 2-4 `{templateId, rationale}` pairs. `runWorkflow(templateId, task, inputs)` → loads template + tenant overrides + brain context → LLM generates output_blocks + cited memory_ids → inserts a `studio_runs` row → revalidates `/studio/marketing`.
- **Preview cards:** React components in `src/components/studio/previews/` — `<XPostCard />`, `<LinkedInCard />`, `<ThreadsCard />`, `<BlogDraftCard />`, `<ScriptCard />`. Each takes structured props (text, hashtags, image_alt, etc.) and renders the platform's visual style. Hand-rolled, no 3rd-party social-card library.
- **Citations:** Each output block can carry `cited_memory_ids: string[]`; the renderer turns them into inline superscripts that scroll/highlight when clicked. Standard React link to `/memory/[id]`.
- **Conversational editing:** A chat overlay sends the user's correction message to an LLM with the current template prompt as context. LLM proposes a structured override (e.g. `{ kind: "add_constraint", value: "Always include product taglines from voice.do_words" }`). User approves → row in `studio_template_overrides`. Future runs of that template merge overrides into the prompt.

**Working directory:** repo root.
**Branch:** `phase-j-marketing-studio`
**Commit cadence:** One per task. Groups 1-2 land schema + templates. Group 3 ships the propose/run server actions. Group 4 ships preview cards. Group 5 ships the UI route. Group 6 adds conversational editing. Group 7 verifies.

---

## Group 1 — Schema + governance (3 tasks)

### Task J.1: Migration — `studio_runs` table
Create `apps/dashboard/supabase/migrations/0023_studio_runs.sql`:
- Table: `id uuid pk`, `tenant_id uuid fk tenants`, `created_by uuid fk auth.users`, `template_id text`, `task text`, `inputs jsonb default '{}'`, `output_blocks jsonb default '[]'`, `cited_memory_ids uuid[] default '{}'`, `status text` (one of `running`, `pending_review`, `accepted`, `rejected`), `created_at timestamptz default now()`, `completed_at timestamptz`
- Index: `(tenant_id, created_at desc)` for the Recent list
- Index: `(tenant_id, template_id, created_at desc)` for the per-template "run again" chip
- RLS: `studio_runs_member_read` via `is_member_of(tenant_id)`; `studio_runs_member_insert` (own row only); `studio_runs_member_update` (own row only)
- No FK to `cited_memory_ids[]` — they're soft refs (memory might be deleted between run and review; UI handles dangling)

**Commit:** `Phase J.1: migration — studio_runs table`

### Task J.2: Migration — `studio_template_overrides`
Create `apps/dashboard/supabase/migrations/0024_studio_template_overrides.sql`:
- Table: `id uuid pk`, `tenant_id uuid fk tenants`, `template_id text not null`, `kind text not null` (`add_constraint`, `replace_section`, `add_example`, `forbid_pattern`), `value jsonb not null`, `source_run_id uuid fk studio_runs on delete set null`, `created_by uuid fk auth.users`, `created_at timestamptz default now()`, `active boolean default true`
- Index: `(tenant_id, template_id, active)` for the per-run merge
- RLS: member-scoped same as `studio_runs`

**Commit:** `Phase J.2: migration — studio_template_overrides`

### Task J.3: ADR-0006 + lock-matrix update
- Create `memory/decisions/0006-marketing-studio-architecture.md` — 5 decisions: templates in code (not memory_files), runs in DB (not memory_files), overrides via dedicated table (not editable JSON column), citations are soft refs, mini-onboarding is template-declared not template-modal
- Update `CLAUDE.md` lock matrix with two new rows: `studio_runs` (member writes own rows); `studio_template_overrides` (member writes own tenant)

**Commit:** `Phase J.3: ADR-0006 marketing studio architecture + lock matrix`

---

## Group 2 — Template library (2 tasks)

### Task J.4: Template interface + registry
Create `apps/dashboard/src/lib/studio/templates/types.ts` — `Template` type:
```ts
export type FirstUseInput = {
  id: string;
  label: string;
  hint: string;
  required: boolean;
  kind: "text" | "select" | "tone";
  options?: string[];
};
export type PreviewKind = "x_post" | "x_thread" | "threads_post" | "linkedin_post" | "blog_draft" | "script" | "plain";
export interface Template {
  id: string;
  label: string;          // user-facing chip text
  hint: string;           // when LLM should pick this
  kind: PreviewKind;
  firstUseInputs: FirstUseInput[];
  // Builds the actual prompt for the LLM given brain context + task + inputs.
  buildPrompt(args: { task: string; brain: BrainSummary; inputs: Record<string, string>; overrides: OverrideRule[] }): string;
}
```
Create `src/lib/studio/templates/index.ts` — side-effect imports + `getTemplate(id)` + `listTemplates()` registry, same pattern as the ingestion adapter registry.

**Commit:** `Phase J.4: Template interface + registry`

### Task J.5: Ten template files
Create one file each under `src/lib/studio/templates/`:
1. `single-x-post.ts` — `kind: "x_post"`, inputs: angle? tone-override?
2. `tweet-thread.ts` — `kind: "x_thread"`, inputs: post-count target, opening-hook style
3. `threads-post.ts` — `kind: "threads_post"`, inputs: angle
4. `linkedin-announcement.ts` — `kind: "linkedin_post"`, inputs: audience (B2B/founder/general), CTA
5. `cross-platform-campaign.ts` — multi-output (returns 3-4 platform variants), inputs: which platforms
6. `reel-script.ts` — `kind: "script"`, inputs: length-seconds, hook style
7. `blog-post-draft.ts` — `kind: "blog_draft"`, inputs: target word count, SEO keywords
8. `voice-consistency-check.ts` — `kind: "plain"`, no first-use inputs; takes raw text + lints against voice memory
9. `hashtag-strategy.ts` — `kind: "plain"`, inputs: platform mix, topic focus
10. `custom.ts` — `kind: "plain"`, free-chat fallback

Each `buildPrompt` includes: BBC voice memory (mandatory), product memory (if relevant to kind), recent decisions (if recency-sensitive kind), explicit "cite memory ids as <cite mem_id='…' />" instruction.

**Commit:** `Phase J.5: ten hand-authored marketing templates`

---

## Group 3 — Propose + run server actions (3 tasks)

### Task J.6: `proposeWorkflows` server action
Create `apps/dashboard/src/app/studio/marketing/actions.ts`:
- `proposeWorkflows(task: string)` — reads `requireActor()`, validates `task.length >= 8 && <= 500`, fetches a 1-line summary per memory_type for context (deterministic, no embedding), calls LLM with `{ task, brain_summary, templates: listTemplates().map(t => ({id, label, hint})) }` → LLM tool-uses `propose_templates` returning 2-4 `{ templateId, rationale }` pairs. Validates returned ids exist in registry. Returns `{ ok: true, candidates: TemplateProposal[] }` or `{ ok: false, error }`.

**Commit:** `Phase J.6: proposeWorkflows server action`

### Task J.7: `runWorkflow` server action
- `runWorkflow(templateId, task, inputs)` — loads template + active overrides for tenant + builds prompt → LLM tool-uses `emit_output_blocks` returning `{ blocks: OutputBlock[], cited_memory_ids: string[] }`. Each `OutputBlock` is `{ kind: PreviewKind, props: jsonb }`. Inserts `studio_runs` row with `status: 'pending_review'`. Returns `{ ok, runId, blocks, citedMemoryIds }`.
- Memory citations validated server-side: only memory_files belonging to the tenant pass; others stripped silently. Logs count of stripped citations.

**Commit:** `Phase J.7: runWorkflow server action with citation validation`

### Task J.8: Accept / reject / edit server actions
- `acceptStudioRun(runId)` — flips status to `accepted`, sets `completed_at`. Does NOT create memory_files (output is content, not memory).
- `rejectStudioRun(runId)` — flips to `rejected`. Keeps the row for analytics.
- `editStudioRun(runId, newBlocks)` — for inline edits in the canvas (small fixups). Stores updated `output_blocks`, leaves status alone.
- All three guard tenant_id + created_by.

**Commit:** `Phase J.8: studio run accept/reject/edit actions`

---

## Group 4 — Preview cards (2 tasks)

### Task J.9: Five preview card components
Create `apps/dashboard/src/components/studio/previews/`:
- `XPostCard.tsx` — accepts `{ text, author_name, author_handle, avatar_seed, char_count }`. Renders X's actual card visual: avatar (deterministic seed → gradient), display name + @handle row, body text with `https://t.co/…` link styling, no engagement counts in v1.
- `XThreadCard.tsx` — vertical stack of `XPostCard` minis with connector line.
- `ThreadsPostCard.tsx` — Meta's threads visual.
- `LinkedInCard.tsx` — LinkedIn's actual card; supports article-style header.
- `BlogDraftCard.tsx` — Medium-ish reading view; renders markdown.
- `ScriptCard.tsx` — TikTok/Reel script format with timecode tray.

All five components must render light + dark. Pure CSS — no platform brand assets that would require attribution.

**Commit:** `Phase J.9: five platform preview card components`

### Task J.10: OutputBlock renderer + citation footnotes
Create `apps/dashboard/src/components/studio/OutputBlocks.tsx`:
- Switches over `block.kind` → renders the right card.
- A wrapper component renders inline citation superscripts: every `<cite mem_id="…" />` in the text becomes `<sup><a href="/memory/[id]">[1]</a></sup>` keyed by appearance order.
- Footer chip below the cards: "Cites 3 memories: voice, product, decision" — clicking opens a small dropdown listing the cited items.

**Commit:** `Phase J.10: OutputBlocks renderer with citation footnotes`

---

## Group 5 — `/studio/marketing` route (3 tasks)

### Task J.11: Task-entry page + candidate cards
Create `apps/dashboard/src/app/studio/marketing/page.tsx`:
- Header: "Marketing Studio" + breadcrumb to dashboard.
- Hero textarea: single-input "What do you want to make?" — placeholder rotates between 5 example tasks ("Draft a launch tweet for our v1.0", "LinkedIn announcement for our seed round", …).
- Submit → calls `proposeWorkflows(task)` → renders 2-4 candidate cards in a grid below. Each card: template label, rationale, "Pick →" button.
- Loading state: animated skeleton cards (3 in grid).
- Empty/error: clear copy + reset button.

**Commit:** `Phase J.11: task entry + workflow candidate cards`

### Task J.12: Mini-onboarding card + canvas
- Picking a candidate reveals a mini-onboarding card: renders `template.firstUseInputs` as form fields. "Run →" button at the bottom calls `runWorkflow`.
- Canvas (right column or below, depending on viewport): shows the `OutputBlocks` once the run resolves. Empty before first run.
- Action strip below canvas: Approve · Edit · Reject (calls the three server actions from J.8).
- Memory citation chips below the canvas.

**Commit:** `Phase J.12: mini-onboarding + canvas with run controls`

### Task J.13: Recent runs as quick-launch chips
- Below the hero textarea (above candidates), if `studio_runs` for the tenant is non-empty, render up to 5 chips: "Run again: <template label> · 3h ago".
- Clicking a chip pre-loads that template + last-used inputs, skipping the proposal step.

**Commit:** `Phase J.13: recent runs as quick-launch chips`

---

## Group 6 — Conversational workflow editing (2 tasks)

### Task J.14: Chat overlay + override extraction
Create `apps/dashboard/src/components/studio/EditWorkflowChat.tsx`:
- Floating button on the canvas: "Edit this workflow".
- Opens an overlay with a chat-style input. User types e.g. "this workflow always misses our product taglines".
- Server action `proposeOverride(templateId, runId, message)` calls LLM with current template prompt + user message → tool-uses `propose_override` returning `{ kind, value, summary }`.
- Overlay shows the proposed override + "Save for this workflow" button.

**Commit:** `Phase J.14: workflow chat overlay + override proposal`

### Task J.15: Save + merge overrides at run time
- Server action `saveStudioTemplateOverride(input)` inserts the row.
- Update `runWorkflow` (J.7) to load active overrides for the template and merge them into the prompt before calling the LLM (already specced in J.7, this is the actual implementation).
- UI: a small "2 customizations" pill on the picked-template card showing the user has overrides active. Clicking shows them with a deactivate button.

**Commit:** `Phase J.15: persist + merge template overrides at run time`

---

## Group 7 — Verification (2 tasks)

### Task J.16: Type-check + production build

```bash
pnpm exec tsc --noEmit
pnpm --filter @bbc/dashboard build
```

Both must pass. Fix any failures before next task.

**Commit:** none (verification gate).

### Task J.17: Browser smoke test

`pnpm --filter @bbc/dashboard dev --port 3001` then visit `http://localhost:3001/studio/marketing` and verify:

1. **Task entry** — type "draft a launch tweet for our v1.0 announcement" → submit → 2-4 candidate cards appear.
2. **Pick + run** — pick Single X post → mini-onboarding card appears → fill inputs → Run → X-card preview renders in canvas.
3. **Citations** — output has superscript citations; clicking one navigates to `/memory/[id]`.
4. **Accept / reject** — clicking either disables the action strip and shows a confirmation toast.
5. **Recent chips** — refresh the page; the previous run shows as a "Run again" chip.
6. **Edit chat** — click "Edit this workflow" → type "always include our product taglines" → an override card appears → save → next run respects it.
7. **Cross-platform campaign** — picking this template emits multiple cards (X + LinkedIn + Threads) in the canvas.
8. **Light + dark** — toggle theme; all 5 preview cards remain legible.
9. **No-brain edge case** — empty `memory_files` for a fresh tenant → the run should still produce content but with no citations.
10. **LLM failure** — flip `ANTHROPIC_API_KEY` off → run should fail gracefully with a clear error.

Screenshot the task entry, candidate cards, X preview with citations, and the edit-chat overlay. Save under `/tmp`.

**Commit:** none (verification only).

---

## Summary

| Group | Tasks | What ships |
|---|---|---|
| 1. Schema + governance | J.1–J.3 | 2 migrations + ADR-0006 + lock-matrix |
| 2. Template library | J.4–J.5 | Template interface + 10 hand-authored templates |
| 3. Server actions | J.6–J.8 | propose / run / accept / reject / edit |
| 4. Preview cards | J.9–J.10 | 5 platform cards + citation renderer |
| 5. UI route | J.11–J.13 | `/studio/marketing` task entry + canvas + recents |
| 6. Conversational editing | J.14–J.15 | Chat overlay + override merging |
| 7. Verification | J.16–J.17 | Type-check, build, browser smoke |

**Total: 17 tasks, ~2 weeks of focused execution.**

**Risks:**
- **LLM-picked templates feel wrong** — if `proposeWorkflows` picks Custom for everything because the brain is sparse, UX collapses. Mitigation: cap brain summary length so the LLM can't latch onto one absent signal; add `voice_consistency_check` as a deterministic fallback when the task contains certain keywords.
- **Live previews drift from real platforms** — X redesigns, our card looks dated. Acceptable for v1 since the goal is "visual = trustworthy" not pixel-perfect mimicry.
- **Citation validation strips too much** — if the LLM cites memories from another tenant (shouldn't happen but defensive) the run looks empty. Mitigation: log strip count; if > 0, surface a debug-only banner.
- **Override merging gets out of hand** — 20 overrides on one template, all `add_constraint`, all conflict. Mitigation: cap at 10 active per template per tenant; LLM gets warned about contradictions in the merged prompt.

**Phase J is complete when:**
1. All 17 tasks committed atomically on `phase-j-marketing-studio`.
2. Type-check + build clean.
3. Smoke test in J.17 passes all 10 verifications.
4. A founder visits `/studio/marketing`, types a task, picks a workflow, sees a live platform-card preview citing their actual memories, can approve / reject / edit, and re-run via a quick-launch chip.
5. ADR-0006 + 2 migrations committed.
6. Lock matrix in CLAUDE.md updated.
7. Branch merged to `main`.

---

## After Phase J

Per design doc §12:
- **Phase K — Marketplace + MCP writes + Stripe** (1.5 weeks). `/marketplace` with role-filtered view, bind/unbind providers, credit metering, MCP write tools, Stripe checkout + paywall triggers.
- **Phase L — Landing + brain map + docs + polish** (1.5 weeks). Landing page, pricing page, `/memory/map` with Sigma.js + Louvain clustering, Mintlify docs, soft-launch checklist.

Phase J runs against `memory_files` which are now multi-source-attributed thanks to I.20. No new dependency on I.20 migrations being applied — Studio works against whatever memories exist in the brain.
