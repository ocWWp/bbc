# Support Studio — consolidated build plan

Synthesized from 5 deep-research JSONs in `./results/`. Decision-grade.
Last research run: 2026-05-12.

## TL;DR

Ship **all 5 templates in v1**. Total estimated build is **~1,100–1,300 LOC**
(comparable to Engineering Studio at ~800 LOC for 3 templates, scaled to 5).
No new `OutputBlock` kinds needed — every template emits a single `plain`
markdown block. One new BrainSummary field needed: `glossary`.

## Ship order (consensus from all 3 agents)

| # | Template | Anchor | LOC | What it proves |
|---|---|---|---|---|
| 1 | customer-reply | marketing/`single-x-post` | ~165 | Voice grounding works |
| 2 | churn-save | engineering/`adr-draft` | ~180 | Decisions memory pays off (the "we don't discount" rule) |
| 3 | feature-request-triage | engineering/`adr-draft` | ~160 | The three-loop flywheel — 3-way writeback |
| 4 | bug-ack | marketing/`single-x-post` + conditional injection | ~190 | Pattern matching against vendors/decisions memory |
| 5 | incident-status | engineering/`adr-draft` | ~160 | Voice-register override (calm tone even for playful brands) |

Rationale: customer-reply de-risks voice plumbing for the whole studio.
churn-save layers in required-decisions context. feature-request-triage
shows BBC's unique writeback story. bug-ack and incident-status consolidate.

## Shared infrastructure to build first

Two new files under `apps/dashboard/src/lib/studio/support-templates/`:

- **`types.ts`** (~40 LOC) — `glossaryClause`, support-specific context
  formatters. Mirrors `eng-templates/types.ts` shape with new helpers.
- **`retrieval.ts`** (~65 LOC) — substring/tag matching over `brain.product`
  and `brain.decisions`. Used by churn-save, bug-ack, feature-request-triage
  for the retrieval-then-generation pattern. Amortizes across 3 templates.

Plus one BrainSummary extension:

- Add `glossary: { terms: { term: string; definition: string }[] }` to
  `BrainSummary` and `loadBrainSummary`. Marketing's voice register +
  product positioning already cover most reply context, but glossary is
  what lets the studio say "labels" when the customer said "tags."

## OutputBlock decision

**Stay with `plain` for all 5 templates in v1.** A typed `email_reply`
kind (with subject + body fields) was considered for customer-reply and
feature-request-triage but rejected: replies live inside existing email
threads (no subject needed), and a non-email reply (X, Discord, in-app)
breaks the typed shape. Revisit in v1.1 if usage data shows >70% of
replies are pasted into email.

## Brain memory consumption (matrix)

| Template | voice | product | glossary | decisions | vendor | team |
|---|---|---|---|---|---|---|
| customer-reply | **required** | **required** | **required** | optional | — | — |
| churn-save | **required** (dampened) | **required** | required | **required** | — | — |
| incident-status | vocab only (register overridden) | **required** | required | optional | optional | — |
| bug-ack | **required** | **required** | required | optional | optional | — |
| feature-request-triage | **required** | **required** (roadmap_status + similar_shipped) | required | **required** (wont-build subset) | optional (workarounds) | optional (v1.1) |

**No new memory types needed for v1.** Every input maps onto existing
brain types. (Some agents suggested a future `support/known-bugs.md`
glossary subkind for writebacks — that's a write-path concern, not an
ingest schema change.)

## Memory write-back proposals (the BBC flywheel)

Every template should propose a write-back when the user accepts a run.
These are the v1 writeback paths each template produces:

| Template | Writeback target | Trigger |
|---|---|---|
| customer-reply | `support/common-replies.md` glossary entry; phrase-mine `voice.example_phrases` from accepted edits | When the founder edits a phrase before accepting |
| churn-save | `support/objection-patterns.md` glossary entry; possibly propose new decision if recurring | When the founder accepts a reply that uses a brand-new objection-pattern |
| incident-status | New `source_artifact` memory for the incident | On accept; the incident becomes searchable history |
| bug-ack | `support/known-bugs.md` glossary entry | When the studio recognizes a recurring symptom |
| feature-request-triage | **3-way**: (1) append to `product/feature-request-log.md`; (2) propose new ADR when verdict=wont-build AND no covering decision exists; (3) propose `roadmap_status` correction if founder reveals "already shipped" against stale memory | On accept |

`feature-request-triage` is the strongest demonstration of BBC's
three-loop architecture and should be the headline demo when this
studio launches.

## Safety constraints (shared across all 5)

Will go into the system prompt for the studio's `dispatchSupport()` call:

- Never commit to a specific ETA without explicit `eta_override` input.
- Never specify a refund amount (founder reviews).
- Never admit legal liability for outages.
- Cite real `mem_id` only; existing `CITATION_INSTRUCTION` + post-process
  `stripUnknownCitations` already covers this.
- For churn-save: never apologize-for-leaving; offer-instead-of-argue.
- For incident-status: short, factual, no marketing language, fixed-cadence
  update promise.

## Override flow

All 5 templates plug into the existing J.14/J.15 conversational override
flow (`add_constraint`, `replace_section`, `add_example`, `forbid_pattern`).
Engineering Studio already wired this in last session's commit (`617e339`).
Realistic founder overrides per template are captured in each result JSON's
`override_examples` field.

## What's uncertain across the 5 JSONs

- **`estimated_loc`** flagged uncertain on 4/5 templates. Real number lands
  ±25%. The shared retrieval.ts + types.ts files mean per-template LOC
  drops once the second template is built.
- **`memory_writeback_proposal`** flagged uncertain on all 5. The writeback
  *paths* are clear; what's not yet decided is the exact `source_artifact`
  subkind shape or whether `support/common-replies.md` is a new memory
  type or a glossary subkind. This is a schema-level decision for the
  build phase, not a research blocker.
- **`prior_art_examples`** flagged on churn-save only — the "4-sentence
  shape" claim synthesizes Baremetrics + Sequenzy + Outseta + patio11
  rather than quoting one canonical artifact.

## Build sequence proposal

1. **Scaffolding** (~150 LOC): `apps/dashboard/src/lib/studio/support-templates/{index.ts,registry.ts,types.ts}` + `apps/dashboard/src/app/studio/support/{page.tsx,actions.ts,SupportStudioClient.tsx}`. Mirror engineering studio's structure.
2. **BrainSummary `glossary` field** (~20 LOC across `brain-summary.ts` + the studio context types).
3. **customer-reply** + smoke test (~165 LOC). Voice grounding proven.
4. **churn-save** + smoke (~180 LOC). Decisions grounding proven.
5. **`support-templates/retrieval.ts` helper** (~65 LOC). Pattern matching helper.
6. **feature-request-triage** + smoke (~160 LOC, uses retrieval). Writeback flywheel proven.
7. **bug-ack** + smoke (~190 LOC, uses retrieval).
8. **incident-status** + smoke (~160 LOC).
9. **Studio index update** + Studio overview page wiring.
10. **Tests**: handler-level tests for the new dispatch path; the existing per-role MCP scope tests automatically cover support keys.

## Open decisions for the build phase (not research)

- Whether `support/common-replies.md` is a new memory type or a glossary
  subkind. (Recommend: glossary subkind for v1, promote to its own type
  if structure demands it.)
- Whether to add a new `support-writer` role to `ROLE_MEMORY_TYPES` in
  api-auth.ts so a support-bound API key sees a tailored slice. (Recommend:
  yes — types should be `[voice, product, glossary, vendor, decision, note]`
  for symmetry with the brain memory consumption matrix above.)
- Whether to ship the studio-overview page with the existing 4 cards
  immediately or in a follow-up commit.

## Files in this research bundle

- `outline.yaml` — items + execution config
- `fields.yaml` — field definitions
- `results/customer-reply.json` — full
- `results/churn-save.json` — full
- `results/incident-status.json` — full
- `results/bug-ack.json` — full
- `results/feature-request-triage.json` — full
- `SUMMARY.md` — this file
