# F1-build-3 + F1-build-4 — Outcome Log + Binding-Update Sketch (SUMMARY)

## Status

**Complete (2026-05-08).** Three scripts shipped; outcome log working end-to-end with sample data.

## Files

- `scripts/outcome-log.sh` — append a single outcome event (success/fail + latency + cost) to `memory/ops/outcomes/<adapter>/<YYYY-MM>.jsonl`. One JSON line per call.
- `scripts/outcome-aggregate.sh` — weekly rollup. Aggregates per-adapter success_rate, outcome_score (`log(1+S)/log(1+T)`), p50 latency, avg cost over a configurable window. Read-only; does NOT mutate adapter YAMLs.
- `scripts/binding-update.sh` — composes `rank.sh` with `bindings.yaml`. Detects when the ranker's pick differs from the current binding and prints what proposal a human would file. Auto-filing deferred (sketch-level integration only for V1).

## Verified

```
| adapter | calls | success_rate | outcome_score | p50_latency_ms | avg_cost_usd |
|---|---|---|---|---|---|
| anthropic-claude-sonnet | 3 | 0.667 | 0.792 | 920 | 0.0130 |
```

After 3 logged outcomes (2 success, 1 fail), the aggregator produced sane numbers. `binding-update.sh` correctly identified that `anthropic-claude-sonnet` is already bound to `llm-provider` (no change needed).

## Schema observations

- The outcome JSONL format is intentionally flat: `ts`, `adapter`, `role`, `profile`, `success`, optional `latency_ms`, `cost_usd`, `task_id`. No nested objects so streaming aggregation stays simple.
- `outcome_score` is bounded in [0, 1] regardless of usage volume (the design's normalization). With 3 calls and 2 successes, score is 0.792 — high because failure rate is low; the score will tighten as call count grows.
- `binding-update.sh` is **sketch-level**. It runs the ranker, compares pick vs. current, and tells the user what would change. It does NOT auto-file because: (a) F2-build-5's override-mode merger isn't done yet, so multi-binding-style profiles can't be auto-applied; (b) F1-build-2's rank.sh uses default trust=0.5 because real trust signals are sparse (gap #5 from F4-build-1); (c) auto-flipping a production binding without human review is not a V1 ambition.

## Schema gaps surfaced

1. **Outcome score formula uses `log(1+S)/log(1+T)`** which biases toward small-N optimism. With 1 success out of 1 call, score is 1.0 (perfect record). This is misleading until N grows. F1-build-3 in production should use a Bayesian shrinkage estimator. V1 keeps the simple formula and surfaces the call count alongside the score for context.
2. **No outcome-emission integration in consumer code.** Currently outcome events must be logged manually. Real F1.E requires consumer-side SDKs (8azi-api/app/services/ai.py wrapping the Anthropic call to emit outcome on success/fail). Not in this phase.
3. **No archival policy for outcome JSONL.** Per-month files grow forever. A "vacuum old months" policy is future work.
4. **`binding-update.sh` doesn't surface trust-signal gaps loudly enough.** When rank.sh produces a pick using default trust=0.5, the binding-update output should warn "trust score is mocked; do not apply this binding without verifying real signals." Currently silent.

## Carry-forward

The "ranker → binding flip → quarantine → purge" full loop is now possible in principle. In practice:
- F4 (provider interface) → ✓ built
- F1 (ranker) → ✓ scoring formula works; trust signals mocked
- F1.E (outcome rollup) → ✓ aggregator works; no auto-emission yet
- F4-build-4 (decommission slash command) → ✓ built
- The remaining humans-in-loop steps are intentional: manager review + main accept on every binding flip and decommission.

## Next

F3-build-2..5 — failover scaffolding (skeletal; real failover infra needs a Shadow VM). Then M1.
