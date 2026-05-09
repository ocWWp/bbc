#!/usr/bin/env bash
# outcome-aggregate.sh — weekly rollup: aggregate per-adapter outcomes from
# the last N days and print a summary suitable for updating adapter YAMLs'
# stability/outcome blocks.
#
# Usage:
#   outcome-aggregate.sh [--window-days N]
#
# F1.E learning loop's first step. Does NOT mutate adapter YAMLs — that's a
# separate proposal. This script just produces the aggregated numbers.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

WINDOW=30
[ "${1:-}" = "--window-days" ] && WINDOW="${2:-30}"

python3 - "$ROOT" "$WINDOW" <<'PY'
import sys, json, math
from pathlib import Path
from datetime import datetime, timezone, timedelta

ROOT = Path(sys.argv[1])
WINDOW = int(sys.argv[2])
OUTCOMES = ROOT / "memory/ops/outcomes"

if not OUTCOMES.exists():
    print("# No outcomes directory; nothing to aggregate.")
    sys.exit(0)

cutoff = datetime.now(timezone.utc) - timedelta(days=WINDOW)
print(f"# outcome-aggregate (window: last {WINDOW} days, cutoff: {cutoff.isoformat()})")
print()

per_adapter = {}
for adapter_dir in sorted(OUTCOMES.iterdir()):
    if not adapter_dir.is_dir():
        continue
    a = adapter_dir.name
    successes = total = 0
    latencies = []
    costs = []
    for f in adapter_dir.glob("*.jsonl"):
        for line in f.read_text().splitlines():
            if not line.strip():
                continue
            try:
                e = json.loads(line)
            except json.JSONDecodeError:
                continue
            ts = e.get("ts")
            if not ts:
                continue
            try:
                t = datetime.fromisoformat(ts.replace("Z", "+00:00"))
            except ValueError:
                continue
            if t < cutoff:
                continue
            total += 1
            if e.get("success"):
                successes += 1
            if "latency_ms" in e:
                latencies.append(e["latency_ms"])
            if "cost_usd" in e:
                costs.append(e["cost_usd"])
    per_adapter[a] = {
        "total": total,
        "success_rate": (successes / total) if total else None,
        "outcome_score": (math.log(1 + successes) / math.log(1 + total)) if total else 0.0,
        "p50_latency_ms": sorted(latencies)[len(latencies)//2] if latencies else None,
        "avg_cost_usd": (sum(costs) / len(costs)) if costs else None,
    }

if not per_adapter:
    print("# No adapter outcome data in window.")
    sys.exit(0)

print("| adapter | calls | success_rate | outcome_score | p50_latency_ms | avg_cost_usd |")
print("|---|---|---|---|---|---|")
for a, m in sorted(per_adapter.items()):
    sr = f"{m['success_rate']:.3f}" if m['success_rate'] is not None else "-"
    p50 = f"{m['p50_latency_ms']}" if m['p50_latency_ms'] is not None else "-"
    cost = f"{m['avg_cost_usd']:.4f}" if m['avg_cost_usd'] is not None else "-"
    print(f"| {a} | {m['total']} | {sr} | {m['outcome_score']:.3f} | {p50} | {cost} |")
PY
