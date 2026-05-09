#!/usr/bin/env bash
# promote.sh — execute the F3 six-step promotion sequence.
#
# SCAFFOLD (F3-build-3). Implements steps 1–5 inline; step 6 (de-confliction
# of the old Primary) lives in deconflict.sh and runs only on the recovering
# host.
#
# Steps (F3 PLAN.md §3):
#   1. Detection — caller (shadow-watch) already detected staleness.
#   2. Ingestion — pull latest log from remote.
#   3. Identification — read lkg.txt.
#   4. Validation — replay log entries past LKG; check state hashes.
#   5. Promotion — emit era-promotion entry; start heartbeat.
#
# Real-world: invoked by shadow-watch.sh on threshold breach.
# Here: usable as a manual trigger ("graceful planned failover").

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
LOG="$ROOT/_log/operations.jsonl"
LKG="$ROOT/_log/lkg.txt"
CFG="$ROOT/memory/ops/_failover-config.yaml"

log_remote=$(grep -E '^log_remote:' "$CFG" | awk -F'"' '{print $2}')

echo "promote: STEP 1 — detection (assumed by caller)"

echo "promote: STEP 2 — ingest latest log"
if [ -z "$log_remote" ]; then
  echo "promote: SKIP — log_remote is empty (single-host mode); nothing to fetch." >&2
else
  case "$log_remote" in
    git@*|https://*github.com*) git -C "$ROOT" fetch origin 2>/dev/null || echo "promote: WARN git fetch failed" ;;
    s3://*) aws s3 sync "$log_remote" "$ROOT/_log/" 2>/dev/null || echo "promote: WARN s3 sync failed" ;;
    *) echo "promote: WARN unknown log_remote scheme: $log_remote" ;;
  esac
fi

echo "promote: STEP 3 — identify LKG"
v_lkg=$(cat "$LKG" 2>/dev/null || echo 0)
echo "  v_lkg = $v_lkg"

echo "promote: STEP 4 — validate tail"
python3 - "$ROOT" "$v_lkg" <<'PY'
import sys, json, hashlib
from pathlib import Path
ROOT = Path(sys.argv[1])
v_lkg = int(sys.argv[2])
log_path = ROOT / "_log/operations.jsonl"
if not log_path.exists():
    print("  no log file; nothing to validate.")
    sys.exit(0)
last_ok_v = v_lkg
for line in log_path.read_text().splitlines():
    if not line.strip():
        continue
    e = json.loads(line)
    if e["v"] <= v_lkg:
        continue
    target = ROOT / e.get("target", "")
    expected = e.get("state_hash", "")
    if expected and target.exists() and target.is_file():
        actual = hashlib.sha256(target.read_bytes()).hexdigest()
        if actual == expected:
            print(f"  v{e['v']}: OK ({e['target']})")
            last_ok_v = e["v"]
        else:
            print(f"  v{e['v']}: MISMATCH — stopping. tail beyond v{last_ok_v} is presumed dead.")
            break
    elif e.get("action") in ("propose", "reject"):
        # File-create operations: consider OK if target now exists
        if target.exists():
            print(f"  v{e['v']}: OK ({e['target']})")
            last_ok_v = e["v"]
        else:
            print(f"  v{e['v']}: target missing; INCOMPLETE")
            break
    else:
        print(f"  v{e['v']}: no state_hash, no target check; assuming OK")
        last_ok_v = e["v"]
print(f"  effective LKG after replay: v{last_ok_v}")
PY

echo "promote: STEP 5 — emit era-promotion entry"
host="$(hostname -s 2>/dev/null || echo unknown-host)"
ts="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
last_v=$(tail -n 1 "$LOG" 2>/dev/null | python3 -c 'import sys,json; print(json.loads(sys.stdin.read()).get("v",0))' 2>/dev/null || echo 0)
new_v=$((last_v + 1))
prev_primary=$(grep -E '^primary_host:' "$CFG" | awk -F'"' '{print $2}')

python3 - "$LOG" "$new_v" "$ts" "$host" "$prev_primary" "$v_lkg" <<'PY'
import sys, json
log, v, ts, host, prev_primary, lkg_at_emit = sys.argv[1:]
entry = {
    "v": int(v), "ts": ts, "host": host, "actor": "shadow",
    "action": "era-promotion", "target": "_log/",
    "state_hash": "", "lkg_at_emit": int(lkg_at_emit),
    "previous_primary": prev_primary,
}
with open(log, "a") as f:
    f.write(json.dumps(entry) + "\n")
PY

echo "promote: complete. v=$new_v emitted; this host is now Primary. Start heartbeat-emit.sh --loop."
