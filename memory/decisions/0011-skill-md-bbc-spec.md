---
id: decision_0011_skill-md-bbc-spec
type: decision
scope: org
layer: main
owning_layer: main
created: 2026-05-12T00:00:00Z
updated: 2026-05-12T00:00:00Z
status: accepted
tags: [adr, skill-md, manifest, import, validation]
supersedes: []
superseded_by: []
---

# ADR-0011: SKILL.md-BBC — the import contract

## Status

**Accepted.** Spec lands W2 of the v1.5 launch plan (`docs/plans/2026-05-12-bbc-launch-plan.md` §5). This ADR is the stub; full normative spec lives in `docs/skill-md-bbc-spec.md` (W2-1).

## Context

Anthropic's [SKILL.md](https://github.com/anthropics/skills) format is the emerging standard for portable skill packages — a markdown body with YAML frontmatter declaring what the skill is, how to invoke it, and what context it needs. The format is loose by design; it's a hint to a generic harness.

BBC needs more than a hint. To slot a third-party skill into the existing 5-studio Template registry safely, BBC must know:
- Which **role agent** owns the skill (marketing · founder · engineering · designer · support).
- What **typed memory** the skill reads and writes (decision, voice, glossary, etc.).
- What **citation contract** the skill commits to (e.g. every claim must cite a memory row).
- What **first-use inputs** the skill needs to collect from the user before the first run.
- What **kind of output** the skill produces (draft · checklist · structured-data · code).

A vanilla SKILL.md has none of this in a typed way. So v1.5 imports SKILL.md **only when it carries a `metadata.bbc.*` block** that fills in the BBC-specific fields. The strict validator rejects manifests missing any required `bbc.*` field with a clear error pointing at the field name.

This keeps the import surface **constrained, informed, verifiable, and correctable** (per [reference_harness_engineering](../../../.claude/projects/-Users-ocwwp-Desktop-BB-C/memory/reference_harness_engineering.md) design north-star) while still letting BBC accept any community-authored skill that meets the spec.

## Decision

### Required `metadata.bbc.*` fields

Every importable SKILL.md must include:

```yaml
metadata:
  bbc:
    role: marketing | founder | engineering | designer | support
    kind: skill | template | action
    label: "Short human name"
    hint: "One-sentence description shown in the Library card"
    first_use_inputs:
      - kind: text | url | file | brain-pick
        name: input_name
        label: "Prompt shown to user"
        required: true
    retrieval:
      required_types: [decision, voice, ...]
      contextual_types:
        top_k: 12
        types: [glossary, vendor, team]
    citation_contract: required | encouraged | none
    output_kind: draft | checklist | structured-data | code
```

Missing fields → reject with field name in the error. Unknown fields under `metadata.bbc.*` → preserved on the parsed `BbcSkill` as `manifest.unknown` (forward-compat).

### Role gating

Imported skills slot into the **declared role's** Template registry only. A skill with `role: marketing` shows on `/studio/marketing` and only there. No dynamic studio creation in v1.5 — the 5 role agents are fixed.

### Citation contract enforcement

`citation_contract: required` is enforced by the shared `validateRun()` helper (W2-5 of the launch plan, lifted from `apps/dashboard/src/app/studio/founder/actions.ts:163`). Imported skills that declare `required` and produce uncited claims fail with a clear message.

### Retrieval

The `retrieval` block is stored at import but **not honored at inference time in v1.5** — see [ADR-0010](0010-retrieval-forward-only.md). v1.5.1 activates `required_types`; v1.6 activates `contextual_types.top_k`.

### Source & security

- URL imports allowlisted to `github.com` + `raw.githubusercontent.com` (W2-3).
- Body cap 256KB.
- Prompt-injection sandbox wraps every imported skill's body in BBC-controlled framing (W2-4); the AT-PI-1..5 test set is the floor.
- `requireRole(actor, "admin")` gates all imports.

## Consequences

**Good:**
- Strict validation surfaces author mistakes at import time, not at run time.
- BBC can accept community skills without giving up the typed-memory contract that makes Studio runs cite-able.
- Forward-compat for fields BBC doesn't yet honor (preserved as `manifest.unknown`).
- Citation contract is the wedge — it's what differentiates a BBC skill from a generic LLM prompt.

**Bad:**
- The `bbc.*` block is BBC-specific and won't validate against a generic SKILL.md schema. Authors targeting both Anthropic's harness and BBC will write two manifests (or one with both blocks). We accept this — BBC's contract is stricter for good reason.
- Strict rejection (vs. lenient parsing) means a typo in `first_use_inputs` blocks the whole import. The error must be specific enough to fix in one pass.
- v1.5 stores fields it doesn't honor yet (`retrieval`); see ADR-0010 for the forward-compat staircase.

## Governance

- Adding a required field is a breaking change → new ADR superseding this one.
- Adding an optional field with a default is non-breaking → spec doc update only.
- Removing or renaming any field is breaking → new ADR.
- The `kind` and `output_kind` enums are closed-set v1.5; extending them is non-breaking but should be documented in the spec doc changelog.

## Related

- [ADR-0010](0010-retrieval-forward-only.md) — `retrieval` block forward-compat staircase.
- [ADR-0006](0006-marketing-studio-architecture.md) — the studio Template interface that imported skills slot into.
- `docs/skill-md-bbc-spec.md` — full normative spec (W2-1 deliverable).
- `apps/dashboard/src/lib/skills/skill-md-parser.ts` — strict validator (W2-2 deliverable).
- `apps/dashboard/src/lib/skills/sandbox.ts` — prompt-injection wrapper (W2-4 deliverable).
- `apps/dashboard/src/lib/studio/templates/types.ts` — `Template` interface the parser conforms to.
