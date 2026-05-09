#!/usr/bin/env bash
# install-skills.sh — make /bbc:* commands available globally by symlinking
# the project's commands directory into the user's ~/.claude/commands/.
#
# Usage:
#   bash scripts/install-skills.sh           # install (create symlink)
#   bash scripts/install-skills.sh --uninstall  # remove the symlink
#   bash scripts/install-skills.sh --status     # show current install state
#
# By default BBC's slash commands work when a Claude session is opened in
# or under the BBC repo (project-local discovery via bbc/.claude/commands/).
# Running this installer makes them work from anywhere by symlinking
# bbc/.claude/commands/bbc → ~/.claude/commands/bbc.
#
# Idempotent: running twice does nothing harmful. Won't overwrite an existing
# non-symlink ~/.claude/commands/bbc — it'll error and tell you.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SOURCE="$ROOT/.claude/commands/bbc"
TARGET_DIR="$HOME/.claude/commands"
TARGET="$TARGET_DIR/bbc"

ACTION="install"
case "${1:-}" in
  --uninstall) ACTION="uninstall" ;;
  --status)    ACTION="status" ;;
  "")          ;;
  *)
    echo "Usage: install-skills.sh [--uninstall|--status]" >&2
    exit 2
    ;;
esac

case "$ACTION" in
  status)
    if [ -L "$TARGET" ]; then
      LINK="$(readlink "$TARGET")"
      echo "installed: $TARGET -> $LINK"
      [ "$LINK" = "$SOURCE" ] && echo "  (matches this BBC repo)" || echo "  (points elsewhere — possible conflict)"
    elif [ -e "$TARGET" ]; then
      echo "blocked: $TARGET exists but is NOT a symlink. Move it aside or delete before installing."
      exit 1
    else
      echo "not installed."
    fi
    ;;

  uninstall)
    if [ -L "$TARGET" ]; then
      rm "$TARGET"
      echo "removed symlink: $TARGET"
    elif [ -e "$TARGET" ]; then
      echo "ERROR: $TARGET is not a symlink (uninstall refuses to delete real files)" >&2
      exit 1
    else
      echo "nothing to uninstall."
    fi
    ;;

  install)
    if [ ! -d "$SOURCE" ]; then
      echo "ERROR: $SOURCE not found. Are you in a valid BBC repo?" >&2
      exit 1
    fi
    mkdir -p "$TARGET_DIR"
    if [ -L "$TARGET" ]; then
      EXISTING="$(readlink "$TARGET")"
      if [ "$EXISTING" = "$SOURCE" ]; then
        echo "already installed (symlink matches): $TARGET -> $SOURCE"
        exit 0
      fi
      echo "ERROR: $TARGET is a symlink to a different BBC repo: $EXISTING" >&2
      echo "       Run --uninstall first if you want to switch." >&2
      exit 1
    fi
    if [ -e "$TARGET" ]; then
      echo "ERROR: $TARGET exists but is NOT a symlink." >&2
      echo "       Move it aside (e.g. ~/.claude/commands/bbc.bak) before installing." >&2
      exit 1
    fi
    ln -s "$SOURCE" "$TARGET"
    echo "installed: $TARGET -> $SOURCE"
    echo "/bbc:* commands are now available globally (in any Claude session)."
    ;;
esac
