#!/usr/bin/env bash
# propose.sh — write a new proposal file to bbc/queue/.
#
# Usage:
#   propose.sh --target main|manager \
#              --file <path-from-repo-root> \
#              --kind edit|add|supersede|archive|flag \
#              [--dest-file <path>]   # required for kind=archive
#              --summary "<short summary>" \
#              [--source "<who/what said so>"] \
#              [--originator leaf-<name>|manager] \
#              [--body-file <path>] \
#              [--source-memory-id <uuid>]   # for kind=flag, points at the memory row
#
# --source captures provenance for Manager review (proposal-review rule asks
# for at least one source: a leaf observation, a human directive, or an
# external link). If omitted, defaults to "<proposed_by> observation" —
# valid but weak; an explicit citation is preferred.
#
# If --originator is omitted, propose.sh tries to infer from $PWD:
#   - If running from inside bbc/distribution/<name>/ → originator=leaf-<name>
#   - If running from inside bbc/manager/             → originator=manager
#   - Otherwise: error.
#
# IMPORTANT: --originator inference requires you to `cd` into the leaf or
# manager directory before invoking. Running from repo root without
# --originator will error.
#
# If --body-file is omitted, propose.sh writes a stub body and prints the
# proposal path so the caller can fill it in.

set -euo pipefail

# Resolve repo root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

TARGET=""
FILE=""
KIND=""
SUMMARY=""
SOURCE=""
ORIGINATOR=""
BODY_FILE=""
DEST_FILE=""
SOURCE_MEMORY_ID=""

while [ $# -gt 0 ]; do
  case "$1" in
    --target) TARGET="$2"; shift 2 ;;
    --file) FILE="$2"; shift 2 ;;
    --kind) KIND="$2"; shift 2 ;;
    --summary) SUMMARY="$2"; shift 2 ;;
    --source) SOURCE="$2"; shift 2 ;;
    --originator) ORIGINATOR="$2"; shift 2 ;;
    --body-file) BODY_FILE="$2"; shift 2 ;;
    --dest-file) DEST_FILE="$2"; shift 2 ;;
    --source-memory-id) SOURCE_MEMORY_ID="$2"; shift 2 ;;
    -h|--help)
      sed -n '2,/^set -euo/p' "$0" | head -n -1 | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *) echo "ERROR: unknown arg: $1" >&2; exit 2 ;;
  esac
done

# Validate args
[ -z "$TARGET" ]  && { echo "ERROR: --target required (main|manager)" >&2; exit 2; }
[ -z "$FILE" ]    && { echo "ERROR: --file required" >&2; exit 2; }
[ -z "$KIND" ]    && { echo "ERROR: --kind required (edit|add|supersede|archive|flag)" >&2; exit 2; }
[ -z "$SUMMARY" ] && { echo "ERROR: --summary required" >&2; exit 2; }

case "$TARGET" in main|manager) ;; *) echo "ERROR: --target must be main or manager" >&2; exit 2 ;; esac
case "$KIND" in edit|add|supersede|archive|flag) ;; *) echo "ERROR: --kind must be edit|add|supersede|archive|flag" >&2; exit 2 ;; esac
if [ "$KIND" = "archive" ] && [ -z "$DEST_FILE" ]; then
  echo "ERROR: --kind archive requires --dest-file" >&2
  exit 2
fi

# Infer originator if not provided
if [ -z "$ORIGINATOR" ]; then
  PWD_REL="${PWD#$ROOT/}"
  case "$PWD_REL" in
    distribution/*)
      LEAF="${PWD_REL#distribution/}"
      LEAF="${LEAF%%/*}"
      ORIGINATOR="leaf-$LEAF"
      ;;
    manager*) ORIGINATOR="manager" ;;
    *)
      echo "ERROR: cannot infer --originator from PWD ($PWD)" >&2
      echo "       pass --originator leaf-<name> or --originator manager" >&2
      exit 2
      ;;
  esac
fi

# Build ids and paths
TS_ISO="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
TS_FS="$(echo "$TS_ISO" | tr ':' '-')"

# Slug from summary: lowercase, kebab, ≤ 40 chars
SLUG="$(echo "$SUMMARY" \
  | LC_ALL=C tr '[:upper:]' '[:lower:]' \
  | LC_ALL=C tr -c 'a-z0-9' '-' \
  | sed -e 's/--*/-/g' -e 's/^-//' -e 's/-$//' \
  | cut -c1-40)"

PROPOSAL_ID="prop_${TS_FS}_${ORIGINATOR}_${SLUG}"
FILENAME="${TS_FS}__${ORIGINATOR}__${SLUG}.md"
DEST="$ROOT/queue/$FILENAME"

if [ -e "$DEST" ]; then
  echo "ERROR: $DEST already exists (collision — rerun in 1s)" >&2
  exit 1
fi

# Set proposed_by (frontmatter format: leaf:<name> or manager)
case "$ORIGINATOR" in
  leaf-*) PROPOSED_BY="leaf:${ORIGINATOR#leaf-}" ;;
  manager) PROPOSED_BY="manager" ;;
esac

# Default --source if not provided. Weak default — explicit is better.
if [ -z "$SOURCE" ]; then
  SOURCE="$PROPOSED_BY observation (no explicit source cited)"
  echo "WARNING: no --source provided. Using weak default. Manager may request changes." >&2
fi

# Body
if [ -n "$BODY_FILE" ]; then
  if [ ! -f "$BODY_FILE" ]; then
    echo "ERROR: --body-file not found: $BODY_FILE" >&2
    exit 1
  fi
  BODY="$(cat "$BODY_FILE")"
else
  case "$KIND" in
    edit)
      BODY="<!-- TODO: paste a unified diff against $FILE inside a \`\`\`diff block -->"
      ;;
    add)
      BODY="<!-- TODO: paste the full new file content (frontmatter + body) inside a \`\`\`markdown block -->"
      ;;
    supersede)
      BODY="<!-- TODO: cite the file being superseded by id and explain why -->"
      ;;
    flag)
      BODY="<!-- TODO: explain WHY you are flagging this memory (voice mismatch, factual error, stale info, etc.) -->"
      ;;
  esac
fi

# Write proposal
{
  echo "---"
  echo "proposal_id: $PROPOSAL_ID"
  echo "proposed_by: $PROPOSED_BY"
  echo "proposed_at: $TS_ISO"
  echo "target_layer: $TARGET"
  echo "target_file: $FILE"
  [ -n "$DEST_FILE" ] && echo "dest_file: $DEST_FILE"
  echo "change_kind: $KIND"
  [ -n "$SOURCE_MEMORY_ID" ] && echo "source_memory_id: $SOURCE_MEMORY_ID"
  echo "diff_summary: \"$SUMMARY\""
  echo "source: \"$SOURCE\""
  echo "status: pending"
  echo "---"
  echo
  echo "$BODY"
} > "$DEST"

echo "Wrote $DEST"
echo "proposal_id: $PROPOSAL_ID"

# F3 log emission (best-effort; never blocks the proposal)
bash "$ROOT/scripts/log-emit.sh" \
  --actor "$PROPOSED_BY" \
  --action "propose" \
  --target "queue/$FILENAME" \
  >/dev/null 2>&1 || true
