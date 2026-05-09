#!/usr/bin/env bash
# reject.sh — archive a queued proposal as rejected, with reason.
#
# Usage:
#   reject.sh <proposal_id_or_filename> --reason "<short reason>"

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

if [ $# -lt 1 ]; then
  echo "Usage: reject.sh <proposal_id_or_filename> --reason \"<short reason>\"" >&2
  exit 2
fi

QUERY="$1"
shift
REASON=""
ACTOR="human:main"
while [ $# -gt 0 ]; do
  case "$1" in
    --reason) REASON="$2"; shift 2 ;;
    --actor)  ACTOR="$2";  shift 2 ;;
    *) echo "ERROR: unknown arg: $1" >&2; exit 2 ;;
  esac
done

[ -z "$REASON" ] && { echo "ERROR: --reason required" >&2; exit 2; }

# Resolve proposal file (same logic as accept.sh)
PROPOSAL=""
if [ -f "$ROOT/queue/$QUERY" ]; then
  PROPOSAL="$ROOT/queue/$QUERY"
elif [ -f "$ROOT/queue/${QUERY}.md" ]; then
  PROPOSAL="$ROOT/queue/${QUERY}.md"
else
  while IFS= read -r f; do
    if grep -q "^proposal_id: ${QUERY}$" "$f" 2>/dev/null; then
      PROPOSAL="$f"
      break
    fi
  done < <(find "$ROOT/queue" -maxdepth 1 -type f -name '*.md')
fi

[ -z "$PROPOSAL" ] && { echo "ERROR: proposal not found: $QUERY" >&2; exit 1; }
[ ! -f "$PROPOSAL" ] && { echo "ERROR: proposal not found: $QUERY" >&2; exit 1; }

TS_ISO="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

python3 - "$PROPOSAL" "$REASON" "$TS_ISO" <<'PY'
import sys, re, pathlib
p = pathlib.Path(sys.argv[1])
reason = sys.argv[2]
ts = sys.argv[3]
text = p.read_text()
text = re.sub(r'^status:\s*pending\s*$', 'status: rejected', text, flags=re.M)
# Insert rejected_at and rejection_reason after proposed_at
text = re.sub(
    r'^(proposed_at:.*)$',
    f'\\1\nrejected_at: {ts}\nrejection_reason: "{reason}"',
    text,
    count=1,
    flags=re.M,
)
p.write_text(text)
PY

mkdir -p "$ROOT/queue/_rejected"
mv "$PROPOSAL" "$ROOT/queue/_rejected/$(basename "$PROPOSAL")"

echo "Rejected $(basename "$PROPOSAL")"
echo "  reason: $REASON"
echo "  archived as: queue/_rejected/$(basename "$PROPOSAL")"

# F3 log emission
bash "$ROOT/scripts/log-emit.sh" \
  --actor "$ACTOR" \
  --action "reject" \
  --target "queue/_rejected/$(basename "$PROPOSAL")" \
  >/dev/null 2>&1 || true
