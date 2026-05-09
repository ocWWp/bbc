#!/usr/bin/env bash
# deconflict.sh — when a previously-deposed Primary wakes up, it MUST run
# this before doing anything else. Reads the remote log and either demotes
# (if it's behind a fresh era-promotion) or hard-errors (split brain).
#
# SCAFFOLD (F3-build-4). In production: invoked from system startup or wrapped
# around any mutating script's entrypoint.
#
# Usage:
#   deconflict.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
LOG="$ROOT/_log/operations.jsonl"
CFG="$ROOT/memory/ops/_failover-config.yaml"

log_remote=$(grep -E '^log_remote:' "$CFG" | awk -F'"' '{print $2}')

# Pull remote log
if [ -n "$log_remote" ]; then
  case "$log_remote" in
    git@*|https://*github.com*) git -C "$ROOT" fetch origin 2>/dev/null && git -C "$ROOT" reset --hard origin/HEAD -- _log/ 2>/dev/null || true ;;
    s3://*) aws s3 sync "$log_remote" "$ROOT/_log/" 2>/dev/null || true ;;
  esac
fi

self_host="$(hostname -s 2>/dev/null || echo unknown-host)"

python3 - "$LOG" "$self_host" "$ROOT" <<'PY'
import sys, json
from pathlib import Path

log = sys.argv[1]
self_host = sys.argv[2]
root = Path(sys.argv[3])

if not Path(log).exists():
    print("deconflict: no log; nothing to compare. Resuming as Primary (cold start).")
    sys.exit(0)

entries = []
for line in Path(log).read_text().splitlines():
    if not line.strip(): continue
    entries.append(json.loads(line))

if not entries:
    print("deconflict: empty log; resuming as Primary.")
    sys.exit(0)

# Find latest era-promotion
era_promotion = None
for e in reversed(entries):
    if e.get("action") == "era-promotion":
        era_promotion = e
        break

if not era_promotion:
    print("deconflict: no era-promotion in log; resuming as Primary (no failover happened).")
    sys.exit(0)

# Self-check: was that era-promotion deposing US?
if era_promotion.get("previous_primary") == self_host:
    print(f"deconflict: era-promotion at v{era_promotion['v']} deposed self ({self_host}) → demoting to Shadow.")
    print(f"  current Primary: {era_promotion['host']}")
    print("  start shadow-watch.sh --loop instead of heartbeat-emit.sh")
    # Touch a marker file so other scripts know we're Shadow
    Path(root / "_log/role").write_text("shadow\n")
    sys.exit(0)

# era-promotion didn't depose us; either we're Shadow watching someone else's Primary, or split brain
if era_promotion.get("host") == self_host:
    print(f"deconflict: era-promotion at v{era_promotion['v']} ALREADY shows us as Primary; resuming heartbeat.")
    Path(root / "_log/role").write_text("primary\n")
    sys.exit(0)

print(f"deconflict: HARD ERROR — log shows era-promotion deposing '{era_promotion.get('previous_primary')}' "
      f"and elevating '{era_promotion.get('host')}'. Self is '{self_host}'. "
      f"This may be split-brain or log corruption. STOP and reconcile manually.")
sys.exit(1)
PY
