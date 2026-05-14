# Phase P Step 1b — "One Way In" — Design Doc

> Design doc from brainstorming, 2026-05-14. Next step: implementation plan (`STEP-1B-PLAN.md`).
> Provenance: deferred from `PLAN.md`'s "DEFERRED TO STEP 1b" section. The maintainer asked whether
> the 8 studios should collapse into a single "unified BBC chat." Decision shaped by 5 research
> streams (web UX landscape, codex architecture consult, play.fast deep-dive, company-brain
> competitor landscape, a Perplexity adoption-evidence pass), a live UI/UX audit of the running app
> (8 surfaces, desktop + mobile), and a codex design review (verdict: BLOCKED on the first arc;
> this doc is the corrected version).

## Thesis

Step 1 made the gallery the home and proved plan-before-run in marketing. Step 1b finishes the
job: **one consistent way into every studio, and one place to start when you don't know which
studio you need.** It does this by *removing* surfaces and *collapsing* duplication, not by adding
a parallel product.

## The decision: additive router, not a teardown

The maintainer's question — collapse the 8 studios into a unified chat — was researched hard.
All five research streams converged **against** collapsing:

- Every major multi-purpose AI product (ChatGPT, Claude, Copilot, Gemini) runs chat **and** a
  structured gallery, in a hierarchy. Anthropic's Claude for Small Business (launched 2026-05-13,
  BBC's closest competitor) is gallery-first — 15 named workflows — and Anthropic's own framing is
  that the market is "moving away from general-purpose chat toward software focused on daily work."
- NN/G's "articulation barrier" research: a blank chat box *hurts* non-technical users — it forces
  recall over recognition. NN/G's 2026 study found users didn't even notice site chat boxes.
- Brynjolfsson/Li/Raymond (QJE, 5,172 agents): AI embedded *in a structured workflow* gave the
  lowest-skill quintile a 36% productivity gain and the highest-skill quintile 0%. Structured
  workflows are exactly what helps non-technical users.
- Codex: a unified chat is natural *only as a router*. BBC's moat is downstream of the box —
  `buildPrompt`, citations, `validateRun`, the accept/reject queue. Chat must feed that scaffold,
  never bypass it. ADR-0008 (three-loop architecture) says Loop 2 is role-scoped agents, not one
  amorphous assistant.

**Conclusion:** keep the 8 studios and the gallery. Add **"Ask BBC"** as an *additive* router that
recommends → pre-fills → explains → routes *into* the existing structured machinery. The router is
not new architecture: marketing's `proposeWorkflows` → `previewPlan` → `PlanConfirmStage` is
already the prototype. Step 1b generalizes it across all 8 registries and lifts it above the
gallery.

## What the live UI/UX audit changed

A browse-tool audit of the running app (gallery, `/studio` index, marketing studio, engineering
studio, home, queue; desktop + mobile) found three IA problems that reshaped the arc:

1. **Three redundant studio-nav surfaces** — the `/gallery` chips, the `/studio` "pick a studio"
   index, and an in-studio role-switcher chip row. Three parallel navigations for one job.
2. **Marketing is task-first *inside the studio*; the other 7 are template-first** — same chrome,
   different interaction model. Switching studios via the role-switcher silently changes how the
   product works.
3. **The gallery doesn't scale** — 48 cards, and on mobile it is an ~11,600px scroll. The "Ask BBC"
   box at the top is what makes the gallery usable, not a nice-to-have. (Mobile also stacks the
   brain sidebar *above* the task input — a separate layout bug, fixed in passing in Step 1.)

## Decisions locked

- **Don't collapse.** Additive "Ask BBC" router, inline on `/gallery` (not a new `/ask` route — a
  third entry surface is the over-complication to avoid). See [[feedback_simplify_whole_app_ux]].
- **Fold marketing into the shared client too.** All 8 studios become consistently template-first
  and share one client. Marketing's task-first propose/pick logic moves *up* into the "Ask BBC"
  router (same code, relocated — not duplicated). Marketing keeps its templates, its
  `plan-confirm` stage, its overrides, its accept/reject/edit review, and its author hint.
- **Review stage: preserve per-role behavior, don't normalize.** The shared client's review stage
  is a configurable slot. Marketing passes its accept/reject actions + author hint; the other 7
  keep their lighter review (edit-workflow chat + "New run"; accept/reject stays on
  `/studio/runs/[id]`). No behavior change, no scope expansion.
- **Retire the `/studio` index; keep the in-studio role-switcher.** The gallery + chips + the
  "Ask BBC" box replace the index. The role-switcher stays as a quick-switch once you're working.
- **Cross-studio "recent runs" moves to the gallery footer** — the gallery is the start-work
  surface; recent work belongs below the grid.
- **The "reads from:" trust row is OUT of this arc** — it needs a `reads` field on the `Template`
  contract plus authoring across ~48 templates. Separable; deferred to keep this arc focused.

## Build sequence (codex-corrected)

The first draft of this arc sequenced marketing's fold-in before plan-before-run, which would have
regressed PR #9's shipped marketing flow. Codex's review (GATE: BLOCKED) produced this corrected
order. **Each step is one or more commits; the order is load-bearing.**

### Step 1 — Shared template resolver + shared `previewPlan`

A **server-only** module that resolves a `templateId` to its owning role + template across all 8
registries (side-effect-imports every registry, then dispatches via the per-role getter — see
"Contract: cross-registry resolver" below). On top of it, a shared `previewPlan(templateId, task,
inputs)` server action.

Critical requirements (from codex findings #3, #4, #5):
- The resolver must guarantee the resolved template's owning role matches the requested
  role/deep-link; reject duplicate or unknown ids.
- Shared `previewPlan` must validate **like `run<Role>Workflow`**, not like today's marketing
  `previewPlan` — it must check required `firstUseInputs` and input shape, and enforce the correct
  per-role task max length (marketing 500, eng/legal/etc. 600, founder 800). Otherwise a user
  confirms a plan that predictably fails at run time.
- Plan content should be role-aware: finance/HR have forward-wired `metrics`/`comp_bands` in
  `BrainSummary`; the candidate-memory copy must not misrepresent what a given role reads.
- Tests across all 8 roles + the unknown-id and wrong-role-id cases.

No UI changes in this step.

### Step 2 — `TemplateFirstStudioClient` + migrate the first non-marketing role

New `components/studio/TemplateFirstStudioClient.tsx`, parameterized by a config object, with the
`plan-confirming` stage built in **from day one** (not bolted on later). Migrate **one**
non-marketing role (engineering — the representative shape) as the proving ground.

The config object must cover the *real* divergence the audit + codex review surfaced (finding #2):
- `templates` — the role's `Client<Role>Template[]`, read by structural shape.
- `runWorkflow` — the per-role `run<Role>Workflow` server action.
- `overrides?` — optional block: `EditWorkflowChat` + `ActiveOverridesPill` + the 4 override
  actions. **Founder omits this entirely.**
- `review` — configurable review-stage slot. Marketing will pass accept/reject actions + author
  hint; the 7 pass their lighter review (edit-chat + "New run"). Founder's `ReviewView` does not
  thread `runId` today — the contract must make `runId` availability explicit.
- `templateBadge?` — optional render slot for legal's `TriageChip`.
- `copy` — placeholder text, task char limit, "reading your brain" line.
- Initial-state contract — see Step 5.

Also fix the mobile sidebar stacking order (task input above brain sidebar) here — one fix, all 8.

### Step 3 — Migrate the remaining 6 non-marketing roles

founder, designer, support, finance, legal, hr → thin wrappers over `TemplateFirstStudioClient`.
Each is a ~15-line wrapper passing config. Per-role commit.

### Step 4 — Fold marketing in (last)

Marketing's `StudioClient` becomes a wrapper over `TemplateFirstStudioClient`. This is the
PR-#9-touching step, so it is **last** and gets the most care. It must preserve, verbatim:
- the `plan-confirm` stage,
- `?rerun=<runId>` support (see initial-state contract, Step 5),
- overrides,
- the accept/reject/edit review + author hint (via the `review` config slot),
- the writeback wiring.
The bespoke `proposing` / `picking` stages are *removed* from the client — that logic moves to the
router in Step 6. Marketing keeps the `custom` template for free-form work.

### Step 5 — Deep-linking

`TemplateFirstStudioClient` gets a defined **initial-state contract**, and **all 8 `page.tsx`
wrappers** are updated to read `searchParams` (today only marketing reads `?rerun=`). The contract
must define (codex findings #6, #7):
- precedence of `?rerun=<runId>` vs `?template=<id>&task=<encoded>`,
- bad/unknown id → graceful fallback (stay idle; do not crash),
- wrong-role id (e.g. `/studio/legal?template=eng:adr-draft`) → reject or redirect to owning role,
- empty/missing `task` → allowed (boot into `configuring` with the template, empty task),
- `task` max-length trimming/rejection per role,
- URL cleanup after the user changes template/task.
Then: gallery `TemplateCard` href → `/studio/${owningRole}?template=${id}`.

### Step 6 — "Ask BBC" router

A **new** server action/module (not a renamed `proposeWorkflows` — finding #8). It routes over
`buildGallery()` summaries across all 8 registries; `TemplateProposal` gains `owningRole`. Tests
must guarantee candidates never include invalid ids or wrong owning roles. Carry over marketing's
rate-limiting + Haiku-for-fan-out cost guard.

The "Ask BBC" box sits inline atop `/gallery`: type intent → candidate cards (label + rationale +
role badge) → click → deep-link `/studio/${owningRole}?template=${id}&task=${encoded}` → lands in
`configuring` → `plan-confirm` → run. This is where marketing's lifted propose/pick logic lives.

**This is the one surface that needs a Claude Design mockup** — written design-agnostic (semantic
structure + `VISUAL:` markers), the mockup generated in parallel, as in Step 1.

### Step 7 — Retire the `/studio` index

Only after every inbound link is rewritten (finding #9):
- delete `app/studio/page.tsx`,
- rewrite `StudioShell` breadcrumb (tenant name → `/studio`),
- rewrite `RoleSwitcher`'s "← all" link (→ `/studio`),
- rewrite `AppNav`'s Studio link,
- move the cross-studio "recent runs" query + UI to the `/gallery` footer (finding #10).

## Contract: cross-registry resolver

The original `PLAN.md` codex review already flagged this: each role's templates live in its own
registry with its own getter (`getTemplate`, `getEngTemplate`, …) and its own
`Client<Role>Template` type. `roleForTemplateId` only maps the id *prefix* — it does not do the
lookup. The shared resolver must:
- side-effect-import all 8 registries,
- map prefix → role via `roleForTemplateId`,
- dispatch to that role's getter,
- be `server-only`,
- return a normalized shape (the structural common shape, as `gallery.ts` already does),
- have tests for every role + unknown-id + duplicate-id.

## Scope

**In:**
- The 7-step sequence above.
- Minimal mobile fix: sidebar stacking order only (not a redesign).

**Out (named, not forgotten):**
- The gallery-card "reads from:" trust row — needs a `reads` field on the `Template` contract +
  authoring across ~48 templates. Its own follow-up.
- Cookie-banner overlap on page content — pre-existing, unrelated.
- Normalizing the review stage across all 8 (accept/reject everywhere) — deliberately deferred;
  preserve per-role behavior for this arc.
- Loop 2 / Loop 3, connectors, Studio Playbooks, the trust surface — later Phase P steps.

## Risks

1. **Marketing fold-in touches PR #9 code (Step 4).** Mitigation: it is sequenced last, after the
   shared client is proven on 7 roles; codex review before the PR; full regression test of
   marketing's plan-confirm / rerun / overrides / accept-reject-edit / author-hint / writeback.
2. **One shared client = single point of failure for 8 studios.** Mitigation: strong unit coverage
   of the state machine and every config permutation (overrides on/off, legal badge, the two
   review variants, deep-link boot, rerun boot).
3. **`previewPlan` validation drift.** If the shared `previewPlan` validates more loosely than
   `run<Role>Workflow`, users confirm plans that fail. Mitigation: Step 1 explicitly mirrors
   `runWorkflow`'s guards; tested per role.
4. **`/studio` retirement dead links.** Mitigation: Step 7 enumerates every inbound link; it ships
   only after all are rewritten and recent-runs has its new home.

## Open items for STEP-1B-PLAN.md

- Exact config-object type for `TemplateFirstStudioClient`, including the `review` slot shape and
  how `runId` availability is expressed in the contract.
- Exact initial-state contract (rerun vs template+task precedence, all edge cases from Step 5).
- Where the shared resolver + shared `previewPlan` live (`lib/studio/` module names).
- The new router server action's module location, prompt, and tool schema.
- Test file layout (the shared client has no existing per-role test files to copy; marketing's
  `StudioClient.test.tsx` and `app/memory/actions.rbac.test.ts` are the closest patterns).
- Whether the authed UI smoke test (now possible via the browse login-handoff path) is added to
  the verification steps, or kept manual as in prior phases.

## What needs Claude Design

Only **Step 6's "Ask BBC" surface** — the command box + candidate cards, sitting above the
existing search/chips on `/gallery` without making the page feel cluttered. Steps 1–5 and 7 are a
faithful port + plumbing + deletion: no redesign, no Claude Design prompt. The plan will include a
design-agnostic Step 6 and a Claude Design prompt to generate the mockup in parallel.
