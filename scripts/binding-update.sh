#!/usr/bin/env bash
# binding-update.sh — generate a binding-update proposal with rank.sh's pick_trace
# attached as evidence.
#
# Usage:
#   binding-update.sh --role <id> [--profile <id>]
#
# Composes /bbc:bind with rank.sh: runs the ranker for the given (role, profile),
# determines if the picked adapter differs from the current binding, and if so,
# produces a queue proposal updating bindings.yaml with the pick_trace inline.
#
# Does NOT accept the proposal — Manager review + Main accept stay as separate steps.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

ROLE=""
PROFILE="_org-policy"
while [ $# -gt 0 ]; do
  case "$1" in
    --role) ROLE="$2"; shift 2 ;;
    --profile) PROFILE="$2"; shift 2 ;;
    *) echo "ERROR: unknown arg: $1" >&2; exit 2 ;;
  esac
done

[ -z "$ROLE" ] && { echo "ERROR: --role required" >&2; exit 2; }

# 1. Run ranker
TRACE_FILE="$(mktemp)"
bash "$ROOT/scripts/rank.sh" "$ROLE" --profile "$PROFILE" > "$TRACE_FILE" 2>/dev/null

# 2. Extract picked adapter
PICKED="$(grep -E '^picked:' "$TRACE_FILE" | head -1 | awk '{print $2}')"
if [ -z "$PICKED" ] || [ "$PICKED" = "null" ]; then
  echo "ERROR: ranker found no candidate for role '$ROLE' under profile '$PROFILE'" >&2
  cat "$TRACE_FILE" >&2
  rm -f "$TRACE_FILE"
  exit 1
fi

# 3. Check current binding from bindings.yaml
CURRENT="$(grep -E "^\| $ROLE \|" "$ROOT/memory/ops/bindings.yaml" | awk -F'|' '{gsub(/^[ ]+|[ ]+$/, "", $3); print $3}')"

if [ "$CURRENT" = "$PICKED" ]; then
  echo "binding-update: role '$ROLE' already bound to '$PICKED'; no change."
  rm -f "$TRACE_FILE"
  exit 0
fi

echo "binding-update: would change role '$ROLE' binding from '$CURRENT' → '$PICKED'"
echo "Pick trace:"
cat "$TRACE_FILE"
echo
echo "To file as a real proposal, hand-craft a single-hunk diff against bindings.yaml's '$ROLE' row, attach this trace as evidence in the body, and run propose.sh."
echo "(Auto-filing is deferred: F1-build-4 sketches the integration; full automation requires the override-mode merger from F2-build-5 + decision-grade rank.sh from F1-build-3.)"

rm -f "$TRACE_FILE"
