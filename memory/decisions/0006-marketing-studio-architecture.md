---
id: mem_2026-05-11_adr-0006-marketing-studio-architecture
type: decision
scope: org
layer: main
source: human:oscar
created: 2026-05-11T00:00:00Z
updated: 2026-05-11T00:00:00Z
owning_layer: main
tags: [adr, bbc, studio, marketing, architecture]
status: accepted
---

# ADR-0006: Marketing Studio v1 — architecture

## Context

Phase J ships the Marketing Studio, the hero feature in design doc §6. Task-first onboarding: one textarea, founder describes the marketing thing they need, BBC proposes 2-4 candidate workflows from a library of 10, founder picks, fills 1-2 inputs, sees a live platform-card preview citing their brain memories. Then approve / reject / edit. Conversational ("this always misses our taglines — fix it") edits materialize as tenant-scoped overrides.

Three architectural forks needed answering before implementation:

1. **Where do the 10 templates live?** Code files, memory_files, or hybrid.
2. **Where do runs (the generated drafts) live?** memory_files, a new table, or the proposal queue.
3. **How are tenant overrides stored?** JSON column on each run, a column on a tenant_templates table, or a dedicated overrides table.

## Decision

**Five decisions, locked.**

1. **Templates live as code files** in `apps/dashboard/src/lib/studio/templates/`. Each template is a `.ts` file exporting a `Template` object with `id`, `label`, `hint`, `kind`, `firstUseInputs`, `buildPrompt(ctx)`. Registry index loads them via side-effect imports, same pattern as the I.20 ingestion adapters.

   *Rejected: memory_files (`type: skill`).* Would let users edit templates via `/memory`, but the design doc explicitly says users never see the library as a menu — they're plumbing, not content. Storing in memory_files would conflate prompt-engineering with brain knowledge. The plumbing/content boundary is real and worth preserving.

2. **Runs live in a dedicated `studio_runs` table**, NOT memory_files. Output is generated content (a draft tweet, a draft blog post), not durable memory. Storing in memory_files would pollute the brain with every draft the user ever generated, including the rejected ones. Run rows can be deleted without losing memory.

3. **Overrides live in `studio_template_overrides`**, NOT as a JSON blob on runs. A dedicated table makes the per-tenant active set queryable and lets us cap at 10 active overrides per template before LLM context pressure becomes a problem. Each row is one targeted rule (`add_constraint`, `replace_section`, `add_example`, `forbid_pattern`) with `active` boolean for soft-delete.

4. **Memory citations are soft references**, not real FKs. `studio_runs.cited_memory_ids uuid[]` can point at a `memory_files` row that's later deleted; the UI handles dangling chips gracefully. Real FKs would either cascade-null (losing context) or block the memory edit (annoying). Soft refs match the half-life of run rows — drafts age out faster than memory.

5. **Mini-onboarding is template-declared, not template-modal.** Each template declares its `firstUseInputs` in its definition file. The UI renders the inputs inline below the picked candidate card, not in a modal. No per-template UI code — just the schema. Keeps the surface area of "edit a template" small (just edit the .ts file).

## Rippable vs durable

- **Durable:** the studio_runs / studio_template_overrides schema, the `Template` interface shape, the soft-reference citation model, the in-code template library convention.
- **Rippable:** specific prompt text in each template, the 5 preview card visuals (X / LinkedIn / Threads will redesign before we do), the LLM model choice, the override-merging strategy, the choice of which 10 templates ship in v1.

If we ever swap from in-code templates to user-authored, the schema doesn't move — the registry just gets a second loader. Soft refs mean we can flip to graph-style relations later (Phase K's `memory_relations`) without a schema migration.

## Consequences

**Schema:** 2 new tables in migrations `0023` and `0024`, both member-scoped via `is_member_of(tenant_id)`. No changes to `memory_files`.

**Governance:** Lock matrix in `CLAUDE.md` gains two new rows. Both tables are member-writable on own rows (insert + status updates by `created_by`). No cross-tenant write paths.

**Operational:** Conversational override creation is a new write path that lives entirely server-side — user sends a message, LLM proposes a structured override, user approves, server inserts. No client-side write to `studio_template_overrides`. The "did the LLM hallucinate a useful override" question stays in the user-review loop, not in trust-the-model.

**Deferred risks:**
- **Conflicting overrides** — 5 `add_constraint` rules on one template, two of which contradict. v1 cap is 10 active per template per tenant; the LLM is warned about contradictions in the merged prompt. Real conflict-resolution UI is v1.1+.
- **Template drift over time** — if we change a template's `buildPrompt` in a code update, overrides written against the old prompt may stop applying cleanly. Mitigation: version the template prompt, attach the version to each override at creation time, warn when running with stale overrides.
- **Preview card decay** — X / LinkedIn / Threads will redesign before we update our mocks. Acceptable: the goal is "visual = trustworthy", not pixel-perfect mimicry.

**Build sequence:** Phase J runs ~2 weeks per design doc §12. After J ships, Phase K (marketplace + MCP writes + Stripe) wires up paywall triggers that gate Studio runs by tier.
