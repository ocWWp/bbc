# F1 — Tool Credibility Ranker (SUMMARY)

## Status

**Designed (2026-05-08).** Pure design phase. No implementation.

## Core decision: separation of three problems

The original "BBC magically picks the right tool" hand-wave is replaced by a five-stage pipeline where every step has named inputs, named outputs, and traceable failure modes:

| Stage | What it does | Owns |
|---|---|---|
| F1.A — Profiles | Encodes hard constraints + soft preferences + weights for a brand/leaf/task | `memory/ops/profiles/<id>.yaml` |
| F1.B — Filter | Drops candidates that violate any hard constraint | pure function |
| F1.C — Trust | Multi-source weighted score (`α stability + β outcome + γ external + δ declared`) | per-adapter signal blocks |
| F1.D — Ranker | Weighted score + argmax + deterministic tiebreak; emits `pick_trace` | `scripts/rank.sh` |
| F1.E — Learning | Outcome log → weekly rollup → updated trust → binding-update proposal | `memory/ops/outcomes/` |

## What's NOT solved (honest)

Cold start, outcome attribution (correlation ≠ causation), gamed external signals, profile drift, multi-tenancy at scale. Each documented in §7 of `PLAN.md` with an explicit mitigation (often human-in-loop).

## Reframe

F1 is three stacked, well-studied problems: constraint satisfaction, multi-criteria decision analysis, trust scoring + bandit-style learning. The "magic" appears when these are merged in an LLM prompt. F1 unmerges them.

## Build phases (deferred)

F1-build-1 (profiles), F1-build-2 (ranker formula in `rank.sh`), F1-build-3 (outcome log + rollup), F1-build-4 (integrate with F4 binding-update flow). Each its own future plan.

## Source

Design rooted in user's earlier prompt requesting a concrete architecture replacing "magic with mechanics," with explicit decomposition, named scoring formula, hard vs. soft constraints, and honest non-solutions. Full design: `PLAN.md` in this directory.
