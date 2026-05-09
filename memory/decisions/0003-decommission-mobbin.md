---
id: mem_2026-05-08_adr-0003-decommission-mobbin
type: decision
scope: org
layer: main
source: human:zeth
created: 2026-05-08T00:00:00Z
updated: 2026-05-08T00:00:00Z
owning_layer: main
tags: [adr, decommission, mobbin, f4-build-3]
status: accepted
---

# ADR-0003: Decommission mobbin (F4-build-3 rehearsal)

## Context

`mobbin` was bound to `pattern-reference` role from 2026-03-01. It was used during design ideation phases (8azi-web Phase 0.5) via the Mobbin MCP server, never as a runtime dependency.

F4-build-3 needed a low-stakes provider to rehearse the full Announce → Quarantine → Purge cycle end-to-end. Mobbin fit because:
- Zero `bbc-provider:mobbin` tags in any consumer code (verified by grep before rehearsal).
- No production code path depends on it.
- Quarantine sweep is provably a no-op.

## Decision

Decommission `mobbin` as the F4-build-3 rehearsal target. The role `pattern-reference` becomes unbound. No replacement adapter at this time — design phases continue without an MCP-mediated reference for now.

## Lifecycle (executed 2026-05-08)

| Phase | Date | Mechanism | Outcome |
|---|---|---|---|
| Announce | 2026-05-08 | Queue proposal flipping `status: active` → `deprecated` + sunset_date + decommission_reason | Accepted (after one rejected attempt due to malformed diff — see findings) |
| Quarantine | 2026-05-08 (instant) | `grep -rn "bbc-provider:mobbin"` across consumer repos | 0 occurrences; no work needed |
| Purge | 2026-05-08 | (a) Bindings flip via queue proposal; (b) Status `deprecated` → `archived` direct edit; (c) File moved to `memory/ops/providers/_archived/`; (d) This ADR | Complete |

## Consequences

- `pattern-reference` role exists with no bound adapter. New design work has no MCP-mediated reference until a replacement is bound.
- The complete decommission cycle is now exercised. Findings captured in `phases/F4-build-3-decom-rehearsal/SUMMARY.md`.
- `_archived/mobbin.yaml` is now the historical record. Validator confirms it is excluded from the active adapter set.

## Supersedes

n/a — this is the first decommission ADR. Future decommissions follow this pattern.

## Source

Phase F4-build-3 of BBC roadmap. See `.planning/phases/F4-build-3-decom-rehearsal/SUMMARY.md`.
