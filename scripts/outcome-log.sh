#!/usr/bin/env bash
# outcome-log.sh — append a single outcome event for a (provider, role, profile) call.
#
# Usage:
#   outcome-log.sh --adapter <id> --role <id> --profile <id> --success <true|false> \
#                  [--latency-ms <int>] [--cost-usd <float>] [--task-id <id>]
#
# Appends one JSON line per call to memory/ops/outcomes/<adapter>/<YYYY-MM>.jsonl.
# F1-build-3's primary deliverable. F1.E rollup (weekly) is future work.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

ADAPTER=""
ROLE=""
PROFILE=""
SUCCESS=""
LATENCY=""
COST=""
TASK_ID=""

while [ $# -gt 0 ]; do
  case "$1" in
    --adapter) ADAPTER="$2"; shift 2 ;;
    --role) ROLE="$2"; shift 2 ;;
    --profile) PROFILE="$2"; shift 2 ;;
    --success) SUCCESS="$2"; shift 2 ;;
    --latency-ms) LATENCY="$2"; shift 2 ;;
    --cost-usd) COST="$2"; shift 2 ;;
    --task-id) TASK_ID="$2"; shift 2 ;;
    *) echo "ERROR: unknown arg: $1" >&2; exit 2 ;;
  esac
done

[ -z "$ADAPTER" ] && { echo "ERROR: --adapter required" >&2; exit 2; }
[ -z "$ROLE" ]    && { echo "ERROR: --role required" >&2; exit 2; }
[ -z "$PROFILE" ] && { echo "ERROR: --profile required" >&2; exit 2; }
[ -z "$SUCCESS" ] && { echo "ERROR: --success required (true|false)" >&2; exit 2; }

case "$SUCCESS" in true|false) ;; *) echo "ERROR: --success must be true|false" >&2; exit 2 ;; esac

TS_ISO="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
MONTH="$(date -u +%Y-%m)"
OUT_DIR="$ROOT/memory/ops/outcomes/$ADAPTER"
OUT_FILE="$OUT_DIR/$MONTH.jsonl"
mkdir -p "$OUT_DIR"

python3 - "$OUT_FILE" "$TS_ISO" "$ADAPTER" "$ROLE" "$PROFILE" "$SUCCESS" "${LATENCY:-null}" "${COST:-null}" "${TASK_ID:-}" <<'PY'
import sys, json
out, ts, adapter, role, profile, success, latency, cost, task_id = sys.argv[1:]
entry = {
    "ts": ts,
    "adapter": adapter,
    "role": role,
    "profile": profile,
    "success": success == "true",
}
if latency != "null":
    entry["latency_ms"] = int(latency)
if cost != "null":
    entry["cost_usd"] = float(cost)
if task_id:
    entry["task_id"] = task_id
with open(out, "a") as f:
    f.write(json.dumps(entry) + "\n")
PY

echo "Logged outcome: adapter=$ADAPTER role=$ROLE success=$SUCCESS → ${OUT_FILE#$ROOT/}"
