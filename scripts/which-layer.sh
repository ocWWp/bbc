#!/usr/bin/env bash
# which-layer.sh — detect which BBC layer the caller is in based on $PWD.
#
# Usage:
#   bash scripts/which-layer.sh
#
# Output (stdout): one of
#   main         (you're at the BBC repo root)
#   manager      (you're inside bbc/manager/)
#   leaf:<name>  (you're inside bbc/distribution/<name>/)
#   unknown      (you're outside the BBC tree, or in queue/, scripts/, etc.)
#
# Exit code is 0 in all cases — callers parse stdout.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Resolve $PWD to its real path so symlinks don't fool us
PWD_REAL="$(cd "$PWD" && pwd -P)"
ROOT_REAL="$(cd "$ROOT" && pwd -P)"

if [ "$PWD_REAL" = "$ROOT_REAL" ]; then
  echo "main"
  exit 0
fi

# Strip the repo root prefix; if PWD_REAL isn't under ROOT_REAL, we're outside.
case "$PWD_REAL" in
  "$ROOT_REAL"/*)
    REL="${PWD_REAL#$ROOT_REAL/}"
    ;;
  *)
    echo "unknown"
    exit 0
    ;;
esac

case "$REL" in
  manager|manager/*)
    echo "manager"
    ;;
  distribution/_template|distribution/_template/*)
    echo "unknown"   # _template is not a real leaf
    ;;
  distribution/*)
    LEAF="${REL#distribution/}"
    LEAF="${LEAF%%/*}"
    echo "leaf:$LEAF"
    ;;
  *)
    echo "unknown"
    ;;
esac
