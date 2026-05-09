#!/usr/bin/env bash
# refresh-all.sh — idempotent BBC refresh.
#
# Runs every indexer + validator + leaf bootstrap. Designed to be invoked by
# launchd every 15 min (see install-daemons.sh) but also safe to run manually.
#
# Each step is wrapped: a failing validator surfaces as a WARN log entry but
# does not abort the rest. Final summary printed; one log entry emitted.
#
# Portable bash 3.2 (macOS default) — no associative arrays.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
TS="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

mkdir -p "$ROOT/_log"

# Each entry: "label:script"
STEPS=(
  "index-memory:index-memory.sh"
  "index-archives:index-archives.sh"
  "validate-providers:validate-providers.sh"
  "validate-skill-tree:validate-skill-tree.sh"
)

ok_count=0
warn_count=0
summary=""

run_step() {
  local label="$1"
  local script="$2"
  local rc=0
  if [ ! -x "$ROOT/scripts/$script" ]; then
    summary="${summary}${label}=missing; "
    warn_count=$((warn_count + 1))
    echo "WARN refresh-all: $script not executable or missing" >&2
    return
  fi
  local errfile
  errfile="$(mktemp)"
  bash "$ROOT/scripts/$script" >/dev/null 2>"$errfile"
  rc=$?
  if [ "$rc" -eq 0 ]; then
    summary="${summary}${label}=ok; "
    ok_count=$((ok_count + 1))
  else
    summary="${summary}${label}=fail($rc); "
    warn_count=$((warn_count + 1))
    echo "WARN refresh-all: $script exited $rc" >&2
    if [ -s "$errfile" ]; then
      sed 's/^/    /' "$errfile" >&2
    fi
  fi
  rm -f "$errfile"
}

for step in "${STEPS[@]}"; do
  label="${step%%:*}"
  script="${step#*:}"
  run_step "$label" "$script"
done

# Re-bootstrap every leaf (idempotent — no-op if Main hasn't changed since last run).
leaf_ok=0
leaf_warn=0
if [ -d "$ROOT/distribution" ]; then
  while IFS= read -r leaf_dir; do
    [ -z "$leaf_dir" ] && continue
    leaf_name="$(basename "$leaf_dir")"
    [ "$leaf_name" = "_template" ] && continue
    [ ! -f "$leaf_dir/CLAUDE.md" ] && continue
    if bash "$ROOT/scripts/bootstrap-leaf.sh" "$leaf_name" >/dev/null 2>&1; then
      leaf_ok=$((leaf_ok + 1))
    else
      leaf_warn=$((leaf_warn + 1))
      echo "WARN refresh-all: bootstrap-leaf.sh $leaf_name failed" >&2
    fi
  done < <(find "$ROOT/distribution" -mindepth 1 -maxdepth 1 -type d | LC_ALL=C sort)
fi
summary="${summary}bootstrap-leaves=${leaf_ok}ok/${leaf_warn}warn"
ok_count=$((ok_count + leaf_ok))
warn_count=$((warn_count + leaf_warn))

echo "refresh-all $TS — ok=$ok_count warn=$warn_count"
echo "  $summary"

# Log the run via log-emit (best-effort; never blocks).
bash "$ROOT/scripts/log-emit.sh" \
  --actor "refresh-daemon" \
  --action "refresh" \
  --target "_log/operations.jsonl" \
  >/dev/null 2>&1 || true

if [ "$warn_count" -gt 0 ]; then
  exit 1
fi
exit 0
