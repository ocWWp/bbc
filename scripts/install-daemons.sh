#!/usr/bin/env bash
# install-daemons.sh — install/uninstall macOS launchd agents that run the
# BBC auto-update + heartbeat scripts.
#
# Per-user agents at ~/Library/LaunchAgents/com.8azi.bbc.<name>.plist.
#
# Usage:
#   install-daemons.sh --install <refresh|heartbeat|all>
#   install-daemons.sh --uninstall <refresh|heartbeat|all>
#   install-daemons.sh --status

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
LA_DIR="$HOME/Library/LaunchAgents"

REFRESH_LABEL="com.8azi.bbc.refresh"
HEARTBEAT_LABEL="com.8azi.bbc.heartbeat"
REFRESH_PLIST="$LA_DIR/$REFRESH_LABEL.plist"
HEARTBEAT_PLIST="$LA_DIR/$HEARTBEAT_LABEL.plist"

ACTION=""
WHICH=""
case "${1:-}" in
  --install)   ACTION="install";   WHICH="${2:-}"; ;;
  --uninstall) ACTION="uninstall"; WHICH="${2:-}"; ;;
  --status)    ACTION="status"; ;;
  ""|-h|--help)
    sed -n '2,/^set -euo/p' "$0" | head -n -1 | sed 's/^# \{0,1\}//'
    exit 0
    ;;
  *) echo "ERROR: unknown arg: $1" >&2; exit 2 ;;
esac

write_refresh_plist() {
  cat > "$REFRESH_PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>           <string>$REFRESH_LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>$ROOT/scripts/refresh-all.sh</string>
  </array>
  <key>WorkingDirectory</key><string>$ROOT</string>
  <key>StartInterval</key>   <integer>900</integer>
  <key>RunAtLoad</key>       <true/>
  <key>StandardOutPath</key> <string>$ROOT/_log/refresh-stdout.log</string>
  <key>StandardErrorPath</key><string>$ROOT/_log/refresh-stderr.log</string>
</dict>
</plist>
PLIST
}

write_heartbeat_plist() {
  cat > "$HEARTBEAT_PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>           <string>$HEARTBEAT_LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>$ROOT/scripts/heartbeat-emit.sh</string>
    <string>--loop</string>
  </array>
  <key>WorkingDirectory</key><string>$ROOT</string>
  <key>RunAtLoad</key>       <true/>
  <key>KeepAlive</key>       <true/>
  <key>StandardOutPath</key> <string>$ROOT/_log/heartbeat-stdout.log</string>
  <key>StandardErrorPath</key><string>$ROOT/_log/heartbeat-stderr.log</string>
</dict>
</plist>
PLIST
}

bootstrap_label() {
  local label="$1" plist="$2"
  launchctl bootout "gui/$UID/$label" 2>/dev/null || true
  if launchctl bootstrap "gui/$UID" "$plist"; then
    echo "loaded: $label"
  else
    echo "ERROR: launchctl bootstrap failed for $label" >&2
    return 1
  fi
}

unload_label() {
  local label="$1" plist="$2"
  if launchctl bootout "gui/$UID/$label" 2>/dev/null; then
    echo "unloaded: $label"
  else
    echo "(not loaded): $label"
  fi
  if [ -f "$plist" ]; then
    rm "$plist"
    echo "removed plist: $plist"
  fi
}

status_label() {
  local label="$1" plist="$2"
  if [ -f "$plist" ]; then
    echo "$label: plist present at $plist"
  else
    echo "$label: not installed"
    return
  fi
  if launchctl print "gui/$UID/$label" >/dev/null 2>&1; then
    echo "  loaded: yes"
    launchctl print "gui/$UID/$label" | grep -E '^\s*(state|pid|last exit code)' | sed 's/^/  /' || true
  else
    echo "  loaded: NO"
  fi
}

case "$ACTION" in
  install)
    mkdir -p "$LA_DIR" "$ROOT/_log"
    case "$WHICH" in
      refresh)
        write_refresh_plist
        bootstrap_label "$REFRESH_LABEL" "$REFRESH_PLIST"
        ;;
      heartbeat)
        write_heartbeat_plist
        bootstrap_label "$HEARTBEAT_LABEL" "$HEARTBEAT_PLIST"
        ;;
      all)
        write_refresh_plist
        bootstrap_label "$REFRESH_LABEL" "$REFRESH_PLIST"
        write_heartbeat_plist
        bootstrap_label "$HEARTBEAT_LABEL" "$HEARTBEAT_PLIST"
        ;;
      *) echo "ERROR: --install needs refresh|heartbeat|all" >&2; exit 2 ;;
    esac
    ;;

  uninstall)
    case "$WHICH" in
      refresh)   unload_label "$REFRESH_LABEL"   "$REFRESH_PLIST" ;;
      heartbeat) unload_label "$HEARTBEAT_LABEL" "$HEARTBEAT_PLIST" ;;
      all)
        unload_label "$REFRESH_LABEL"   "$REFRESH_PLIST"
        unload_label "$HEARTBEAT_LABEL" "$HEARTBEAT_PLIST"
        ;;
      *) echo "ERROR: --uninstall needs refresh|heartbeat|all" >&2; exit 2 ;;
    esac
    ;;

  status)
    status_label "$REFRESH_LABEL"   "$REFRESH_PLIST"
    echo
    status_label "$HEARTBEAT_LABEL" "$HEARTBEAT_PLIST"
    ;;
esac
