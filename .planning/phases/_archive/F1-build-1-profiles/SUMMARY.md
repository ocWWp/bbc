# F1-build-1 — Profiles + _org-policy.yaml (SUMMARY)

## Status

**Complete (2026-05-08).** Three profiles authored under `memory/ops/profiles/`.

## Files

- `_org-policy.yaml` — org-wide hard constraints (data residency, content filter, latency ceiling) + trust signal weights + cold-start fallback rule.
- `marketing-default.yaml` — applies to `8azi-market`. Tighter cost/latency than org default. Vibe descriptors capture brand voice.
- `engineering-default.yaml` — applies to `8azi-api`, `8azi-web`. Higher cost ceiling, higher trust weight, tighter outcome window.

## Schema decisions

- **`inherits:` field** added (not in F1 design but discovered as needed). A profile inherits from `_org-policy` by default; the field is explicit for traceability.
- **Hard-constraint inheritance is one-way**: children can ADD or TIGHTEN; never relax. Validator (future) will enforce.
- **Soft preferences DON'T inherit** — each profile sets its own preferred_providers, region, vibe.
- **Weights inherit unless overridden**.

## Schema gaps surfaced

- `inherits:` is a real field; the F1 PLAN.md should be updated to mention it explicitly. Filed as note for future doc revision.
- No `_provisional: true` field yet on bindings (still uses paren hack from F4-build-1). F1 ranker will need to handle provisional bindings — defer to F1-build-2.
- `min_uptime_sla_pct` is a new constraint type not in the original PLAN — added as needed for engineering profile. Should be validated by `validate-providers.sh` extension or a new `validate-profiles.sh`.

## Next

F1-build-2 (rank.sh) — implement the actual ranker formula reading these profiles.
