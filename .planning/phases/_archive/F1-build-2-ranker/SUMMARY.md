# F1-build-2 — rank.sh Ranker (SUMMARY)

## Status

**Complete (2026-05-08).** Pure-function ranker shipped as `scripts/rank.sh`. End-to-end tested against current adapter set.

## What it does

`rank.sh <role-id> [--profile <profile-id>]` reads:
- The role contract from `memory/ops/provider-roles/<role>.yaml`
- The profile from `memory/ops/profiles/<profile-id>.yaml` (default `_org-policy`)
- All adapters whose `implements:` list contains the role

Outputs a `pick_trace` YAML on stdout listing:
- Excluded candidates and reasons
- Surviving candidates ranked by score with per-term breakdown
- The picked provider (highest score; deterministic tiebreak by id)

## Filter logic

Hard constraints from profile (with `_org-policy` fallback):
- `cost_per_call_usd > max_cost_per_call_usd` → excluded
- `latency_p95_ms > max_latency_p95_ms` → excluded
- `status: archived` → excluded

## Scoring formula

Implements F1 PLAN.md §5 directly:

```
score = w_cost × normalize_cost
      + w_latency × normalize_latency
      + w_trust × trust_score
      + w_outcome_history × outcome_score
      + w_preference_match × preference_score
```

V1 scaffolding values (will improve as F1-build-3 lands real outcome data):
- `trust = 0.5` (mid-range default; real multi-source scoring is gap #5 from F4-build-1)
- `outcome = 0` (cold start; no outcome log yet)
- `preference = 0` (no `preferred_providers` populated)

The pick_trace explicitly notes these scaffolding values so a reader knows the score is provisional.

## Verified runs

- `rank.sh llm-provider --profile engineering-default` → picks `anthropic-claude-sonnet` with score 0.5947 (cost normalized to 1.0 since under cap; latency normalized to 0.97).
- `rank.sh image-edit-provider --profile marketing-default` → picks null (no candidate adapters), `candidates_total: 0`. Correct behavior.

## Schema gaps surfaced

1. **The frontmatter parser is a small subset of YAML.** Quoted strings, lists, and scalars work; nested objects don't. Sufficient for current files but breaks if anyone adds nested YAML to a role/profile/adapter.
2. **Trust scoring is mocked.** Real F1.C trust formula requires populated stability/outcome blocks in adapter YAMLs. The current adapters mostly say `<unknown>` for stability signals (carried-forward gap #6).
3. **Profile inheritance is partial.** rank.sh falls back to `_org-policy` for missing constraints + weights, but doesn't merge soft preferences. Acceptable for V1 since profiles don't yet have preferred_providers.
4. **No `validate-profiles.sh` yet.** A typo'd weight key (e.g., `lattency` for `latency`) silently uses default. Should add validator before profiles are heavily edited.
5. **Output format is YAML-ish but not parsed by another script yet.** When `binding-update.sh` (F1-build-4) consumes pick_trace, may need to formalize.

## Next

F1-build-3 + F1-build-4 — outcome logging and binding-update integration. Both partially scaffolded next.
