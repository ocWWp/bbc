# F2 — OOP Skill Inheritance (SUMMARY)

## Status

**Designed (2026-05-08).** Pure design phase. No implementation.

## Core decision: real OOP, not decoration

The four OOP terms get concrete YAML backing:

| Term | Mechanism |
|---|---|
| Encapsulation | Each skill has typed `inputs:`, `outputs:`, `preconditions:` declared in YAML |
| Abstraction | `_abstract/` skills declare contract without invocable body; `abstract: true` flag enforced by validator |
| Inheritance | Child skill declares `extends: <parent_id>`. Resolver walks the chain and merges per per-field override modes (`replace` / `add` / `remove`) |
| Polymorphism | Same `pr-review` invocation resolves to different effective skills based on caller's layer (leaf > brand > general > abstract) |

## Storage layout

```
memory/skills/
├── _abstract/  (Main-owned)
├── general/    (Manager-owned)
├── <leaf>/     (leaf-owned)
└── _resolved/  (derived; gitignored)
```

Owning-layer rules match BBC's existing layer conventions. Abstract contract changes need ADRs (Main edit). Concrete skill changes go through the standard queue.

## Resolution algorithm

`resolve(caller_layer, skill_short_id)`:
1. Walk specificity tiers from caller up to org.
2. Pick the most specific match.
3. Linearize the `extends` chain into a flat effective skill applying override modes per field.
4. Validate effective skill against abstract base's contract.
5. Cache to `_resolved/`.

Every invocation produces a `resolution_trace` (parallel to F1's `pick_trace`) showing what was walked, what was overridden, and the effective skill. Inspectable failure modes.

## What's NOT in F2

Multiple inheritance, runtime introspection, mixins/traits, cross-org skill versioning, skill marketplace. Each documented in §7 of `PLAN.md` with a brief rationale.

## Build phases (deferred)

F2-build-1 (abstract bases + `general.*`), F2-build-2 (resolver + validator), F2-build-3 (first leaf specialization), F2-build-4 (`/bbc:invoke` + `/bbc:skill-trace`).

## Source

User's earlier request: "design the details and let me review it (give me a full UML and user stories)" plus the `marketing.pr-review extends general.pr-review` example. Six user stories cover: brand voice inheritance, engineering specialization, parent-update propagation, single-override leaf, resolution-trace debugging, contract-violation blocking. Full design: `PLAN.md`.
