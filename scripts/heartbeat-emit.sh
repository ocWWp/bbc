#!/usr/bin/env bash
# heartbeat-emit.sh — Primary writes a heartbeat to _log/heartbeat once per
# HEARTBEAT_SECONDS (read from memory/ops/_failover-config.yaml).
#
# Usage:
#   heartbeat-emit.sh         # emit one heartbeat then exit
#   heartbeat-emit.sh --loop  # daemon mode: emit forever at the configured interval
#
# In production: run via cron (every 30s — for that, use systemd timer or pm2;
# cron's minimum granularity is 1 minute) or as a long-lived `--loop` process.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
HB_FILE="$ROOT/_log/heartbeat"
LOG="$ROOT/_log/operations.jsonl"

LOOP=false
[ "${1:-}" = "--loop" ] && LOOP=true

interval=$(grep -E '^heartbeat_seconds:' "$ROOT/memory/ops/_failover-config.yaml" | awk '{print $2}')
interval="${interval:-30}"

emit_one() {
  local ts host last_v
  ts="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  host="$(hostname -s 2>/dev/null || echo unknown-host)"
  if [ -s "$LOG" ]; then
    last_v=$(tail -n 1 "$LOG" | python3 -c 'import sys, json; print(json.loads(sys.stdin.read()).get("v", 0))' 2>/dev/null || echo 0)
  else
    last_v=0
  fi
  # Atomic write (mktemp + mv)
  local tmp
  tmp=$(mktemp)
  printf '{"v": %s, "ts": "%s", "host": "%s"}\n' "$last_v" "$ts" "$host" > "$tmp"
  mv "$tmp" "$HB_FILE"
}

if [ "$LOOP" = true ]; then
  echo "heartbeat-emit: starting loop (interval ${interval}s)"
  while true; do
    emit_one
    sleep "$interval"
  done
else
  emit_one
  echo "heartbeat emitted: $(cat "$HB_FILE")"
fi
