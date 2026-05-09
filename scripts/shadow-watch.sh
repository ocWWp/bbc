#!/usr/bin/env bash
# shadow-watch.sh — Shadow polls Primary's heartbeat and, on N missed polls,
# triggers promote.sh.
#
# SCAFFOLD ONLY (F3-build-2). Real Shadow operation requires:
#   - A separate Shadow host with read access to the remote log.
#   - The log_remote URL in memory/ops/_failover-config.yaml set.
#   - This script running as a daemon on Shadow (long-lived process).
#
# Usage (when Shadow exists):
#   shadow-watch.sh --loop
#
# In dev / single-host mode, this script will refuse to run since shadow_host
# is empty in _failover-config.yaml.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
HB_FILE="$ROOT/_log/heartbeat"
CFG="$ROOT/memory/ops/_failover-config.yaml"

# Read config
shadow_host=$(grep -E '^shadow_host:' "$CFG" | awk -F: '{print $2}' | tr -d '" ')
heartbeat_seconds=$(grep -E '^heartbeat_seconds:' "$CFG" | awk '{print $2}')
poll_seconds=$(grep -E '^poll_seconds:' "$CFG" | awk '{print $2}')
threshold=$(grep -E '^failover_threshold_misses:' "$CFG" | awk '{print $2}')

# Refuse if no shadow_host (we'd be the lone Primary, no point watching)
if [ -z "$shadow_host" ]; then
  echo "shadow-watch: shadow_host is empty in _failover-config.yaml; refusing to run." >&2
  echo "  Provision a Shadow host and update _failover-config.yaml first." >&2
  exit 0
fi

threshold="${threshold:-3}"
heartbeat_seconds="${heartbeat_seconds:-30}"
poll_seconds="${poll_seconds:-10}"

LOOP=false
[ "${1:-}" = "--loop" ] && LOOP=true

stale_count=0
check_once() {
  if [ ! -f "$HB_FILE" ]; then
    echo "shadow-watch: WARN no heartbeat file"
    stale_count=$((stale_count + 1))
    return
  fi
  local hb_ts hb_age now_epoch hb_epoch
  hb_ts=$(python3 -c 'import sys, json; print(json.loads(open(sys.argv[1]).read()).get("ts", ""))' "$HB_FILE" 2>/dev/null || echo "")
  if [ -z "$hb_ts" ]; then
    stale_count=$((stale_count + 1))
    return
  fi
  hb_epoch=$(date -u -d "$hb_ts" +%s 2>/dev/null || python3 -c 'import sys, datetime; print(int(datetime.datetime.fromisoformat(sys.argv[1].replace("Z","+00:00")).timestamp()))' "$hb_ts")
  now_epoch=$(date -u +%s)
  hb_age=$((now_epoch - hb_epoch))
  if [ "$hb_age" -gt $((heartbeat_seconds * 2)) ]; then
    stale_count=$((stale_count + 1))
    echo "shadow-watch: STALE ($hb_age s old; consecutive=$stale_count/$threshold)"
  else
    if [ "$stale_count" -gt 0 ]; then
      echo "shadow-watch: heartbeat fresh (age ${hb_age}s); resetting stale counter."
    fi
    stale_count=0
  fi

  if [ "$stale_count" -ge "$threshold" ]; then
    echo "shadow-watch: TRIGGERING PROMOTION — primary heartbeat stale for $stale_count consecutive polls"
    bash "$ROOT/scripts/promote.sh"
    exit 0
  fi
}

if [ "$LOOP" = true ]; then
  echo "shadow-watch: starting loop (poll ${poll_seconds}s, threshold $threshold)"
  while true; do
    check_once
    sleep "$poll_seconds"
  done
else
  check_once
fi
