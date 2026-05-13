---
id: decision_0010_retrieval-forward-only
type: decision
scope: org
layer: main
owning_layer: main
created: 2026-05-12T00:00:00Z
updated: 2026-05-12T00:00:00Z
status: accepted
tags: [adr, retrieval, skill-md, brain-summary, forward-compat]
supersedes: []
superseded_by: []
---

# ADR-0010: Retrieval is forward-declared only in v1.5

## Status

**Accepted.** Lands W1 of the v1.5 launch plan (`docs/plans/2026-05-12-bbc-launch-plan.md` §5). Implementation in `apps/dashboard/src/lib/studio/brain-summary.ts` (unchanged) and the SKILL.md-BBC parser (W2-2).

## Context

The SKILL.md-BBC manifest (ADR-0011 forthcoming) requires a `metadata.bbc.retrieval` block on every imported skill:

```yaml
retrieval:
  required_types: [decision, voice]
  contextual_types:
    top_k: 12
    types: [glossary, vendor, team]
```

This block tells BBC which supertag rows the skill needs in its context window. The natural reading is: "BBC honors `required_types` as a hard floor and uses `contextual_types.top_k` to retrieve additional rows via hybrid lexical+vector search."

That is **not** what v1.5 does.

In v1.5, every Studio run uses the existing `buildBrainSummary()` slice at `apps/dashboard/src/lib/studio/brain-summary.ts` — a fixed type-bucketed top-200 (1 voice · 1 product · 5 decisions · 8 vendors · 8 team · 12 glossary, plus open slots). It is hand-tuned, deterministic, and budget-predictable. There is no vector index in v1.5; there is no hybrid retrieval engine.

If we shipped a `retrieval` field that did nothing, skill authors would write manifests against a behavior that didn't exist and would get bug reports the first time the slice didn't contain what `required_types` declared. If we shipped a `retrieval` field that worked, we'd need vector infra by launch — which we don't have time to build, validate, and budget-cap before 2026-07-14.

## Decision

v1.5 **stores `retrieval` declarations in the manifest** but **does not honor them at inference time.** The brain-summary slice is the universal context. Skill authors declare retrieval intent; BBC reads but does not yet act.

Forward-compat staircase:

| Version | `retrieval` behavior |
|---|---|
| **v1.5** | Stored on import; surfaced read-only in the skill detail drawer; not consulted by `buildBrainSummary()`. |
| **v1.5.1** | `required_types` honored — if a skill declares `required_types: [voice]` and the default slice omitted voice, voice rows are appended. Still no vector retrieval; no `top_k`. |
| **v1.6** | Hybrid retrieval engine ships. `contextual_types.top_k` activates. Per-skill custom slices replace the universal `buildBrainSummary()`. |

This staircase is the contract. Skill authors writing v1.5 manifests can trust that `required_types: [X]` becomes load-bearing in v1.5.1 without re-authoring; `top_k` becomes load-bearing in v1.6 without re-authoring.

## Consequences

**Good:**
- v1.5 launch is not blocked on vector infra.
- Manifest schema is stable from v1.5 onward — no breaking changes for authors who write to the spec today.
- Token budgets stay predictable at launch (the slice is fixed-size). No surprise context blow-outs from new imports.
- The detail drawer can render the declared `retrieval` block to set author expectations even while behavior is deferred.

**Bad:**
- Skill authors who don't read this ADR may assume `required_types` is enforced and ship skills that silently rely on rows the default slice doesn't contain. The SKILL.md-BBC spec doc must call this out explicitly with a "honored in v1.5.1" callout.
- Two minor versions of forward-compat staircase risk drift — if v1.5.1 slips, authors lose trust.
- The detail drawer showing a "retrieval" block that doesn't do anything yet is a small honesty cost; we mitigate with a "(declared; activated in v1.5.1)" annotation.

## Governance

- Schema change in `metadata.bbc.retrieval` requires a new ADR.
- Activation in v1.5.1 (`required_types` honored) does not require a new ADR — it's the staircase this one defines.
- Activation in v1.6 (`top_k` honored) does require a new ADR documenting the retrieval engine choice (hybrid backend, embedding model, budget caps).

## Related

- [ADR-0008](0008-three-loop-architecture.md) — three-loop architecture; this ADR scopes Loop 2 retrieval behavior at launch.
- ADR-0011 (forthcoming) — SKILL.md-BBC spec; defines the `retrieval` block being deferred here.
- `apps/dashboard/src/lib/studio/brain-summary.ts` — the unchanged top-200 slice.
- `docs/plans/2026-05-12-bbc-launch-plan.md` §5 — launch plan tying this ADR to W1.
