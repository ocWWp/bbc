#!/usr/bin/env bash
# log-emit.sh — append a versioned entry to bbc/_log/operations.jsonl and
# advance bbc/_log/lkg.txt if the post-validate hook (optional) succeeds.
#
# Called by every mutating BBC script (propose.sh, accept.sh, reject.sh,
# bootstrap-leaf.sh, index-memory.sh).
#
# Usage:
#   log-emit.sh --actor <actor> --action <action> --target <relpath> [--state-hash <hash>]
#               [--validate-cmd "<bash command to run; if exits 0, advance LKG>"]
#
# Output: prints the new version number on stdout.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
LOG="$ROOT/_log/operations.jsonl"
LKG="$ROOT/_log/lkg.txt"

ACTOR=""
ACTION=""
TARGET=""
STATE_HASH=""
VALIDATE_CMD=""

while [ $# -gt 0 ]; do
  case "$1" in
    --actor) ACTOR="$2"; shift 2 ;;
    --action) ACTION="$2"; shift 2 ;;
    --target) TARGET="$2"; shift 2 ;;
    --state-hash) STATE_HASH="$2"; shift 2 ;;
    --validate-cmd) VALIDATE_CMD="$2"; shift 2 ;;
    *) echo "ERROR: unknown arg: $1" >&2; exit 2 ;;
  esac
done

[ -z "$ACTOR" ]  && { echo "ERROR: --actor required" >&2; exit 2; }
[ -z "$ACTION" ] && { echo "ERROR: --action required" >&2; exit 2; }
[ -z "$TARGET" ] && { echo "ERROR: --target required" >&2; exit 2; }

# Compute state_hash if not provided and target exists
if [ -z "$STATE_HASH" ] && [ -f "$ROOT/$TARGET" ]; then
  STATE_HASH="$(shasum -a 256 "$ROOT/$TARGET" | awk '{print $1}')"
fi

# Compute next version
mkdir -p "$ROOT/_log"
[ -f "$LKG" ] || echo "0" > "$LKG"
[ -f "$LOG" ] || touch "$LOG"

if [ -s "$LOG" ]; then
  LAST_V="$(tail -n 1 "$LOG" | python3 -c 'import sys, json; print(json.loads(sys.stdin.read()).get("v", 0))' 2>/dev/null || echo 0)"
else
  LAST_V=0
fi
NEXT_V=$((LAST_V + 1))

LKG_AT_EMIT="$(cat "$LKG" 2>/dev/null || echo 0)"
HOST="$(hostname -s 2>/dev/null || echo unknown-host)"
TS="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

# Append entry (one-line JSON)
python3 - "$NEXT_V" "$TS" "$HOST" "$ACTOR" "$ACTION" "$TARGET" "$STATE_HASH" "$LKG_AT_EMIT" "$LOG" <<'PY'
import sys, json
v, ts, host, actor, action, target, state_hash, lkg_at_emit, log_path = sys.argv[1:]
entry = {
    "v": int(v), "ts": ts, "host": host, "actor": actor,
    "action": action, "target": target,
    "state_hash": state_hash, "lkg_at_emit": int(lkg_at_emit),
}
with open(log_path, 'a') as f:
    f.write(json.dumps(entry) + "\n")
PY

# Run validate cmd; if it succeeds, advance LKG
ADVANCE=true
if [ -n "$VALIDATE_CMD" ]; then
  if ! ( cd "$ROOT" && eval "$VALIDATE_CMD" ) >/dev/null 2>&1; then
    echo "log-emit: validate-cmd failed; LKG NOT advanced (was $LKG_AT_EMIT)" >&2
    ADVANCE=false
  fi
fi

if [ "$ADVANCE" = true ]; then
  echo "$NEXT_V" > "$LKG"
fi

echo "$NEXT_V"
