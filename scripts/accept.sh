#!/usr/bin/env bash
# accept.sh — apply a queued proposal to its target file and archive it.
#
# Usage:
#   accept.sh <proposal_id_or_filename> [--force] [--dry-run]
#
# Behavior:
#   1. Locate the proposal in queue/ (matches by proposal_id OR by filename).
#   2. Verify status: pending and manager_review.verdict: approved.
#      (You can override with --force, but you'll get a loud warning.)
#   3. Apply the change to target_file based on change_kind:
#       - edit:      apply the unified diff in the body via `patch`. Patch
#                    warnings are surfaced to stderr but do not block apply.
#       - add:       extract the fenced ```markdown block and write it as a new file.
#       - supersede: mark the old file's status: superseded; if a replacement
#                    add-block is included, write it.
#   4. Update target_file frontmatter:
#       - updated: <now>
#       - provenance: append proposal_id
#   5. Set proposal status: accepted; move file to queue/_accepted/.
#
# Flags:
#   --force    Bypass manager_review.verdict check. Loud warning printed.
#   --dry-run  Run all validation + a `patch --dry-run` against the target,
#              but do NOT mutate anything. Safe preview before real accept.
#
# Errors stop without partial mutation.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

if [ $# -lt 1 ]; then
  echo "Usage: accept.sh <proposal_id_or_filename> [--force] [--dry-run]" >&2
  exit 2
fi

QUERY="$1"
shift
FORCE=false
DRY_RUN=false
ACTOR="human:main"   # default; dashboard server actions override with --actor "human:github:<user>"
while [ $# -gt 0 ]; do
  case "$1" in
    --force)   FORCE=true; shift ;;
    --dry-run) DRY_RUN=true; shift ;;
    --actor)   ACTOR="$2"; shift 2 ;;
    *) echo "ERROR: unknown arg: $1" >&2; exit 2 ;;
  esac
done

# Resolve proposal file
PROPOSAL=""
if [ -f "$ROOT/queue/$QUERY" ]; then
  PROPOSAL="$ROOT/queue/$QUERY"
elif [ -f "$ROOT/queue/${QUERY}.md" ]; then
  PROPOSAL="$ROOT/queue/${QUERY}.md"
else
  # Try matching by proposal_id field
  while IFS= read -r f; do
    if grep -q "^proposal_id: ${QUERY}$" "$f" 2>/dev/null; then
      PROPOSAL="$f"
      break
    fi
  done < <(find "$ROOT/queue" -maxdepth 1 -type f -name '*.md')
fi

if [ -z "$PROPOSAL" ] || [ ! -f "$PROPOSAL" ]; then
  echo "ERROR: proposal not found: $QUERY" >&2
  exit 1
fi

# Read frontmatter fields
fm() {
  local field="$1"
  awk -v f="$field" '
    /^---$/ { in_fm = !in_fm; if (!in_fm) exit; next }
    in_fm && $0 ~ "^"f":" {
      sub("^"f":[[:space:]]*", "")
      gsub(/^"|"$/, "")
      print
      exit
    }
  ' "$PROPOSAL"
}

PROPOSAL_ID="$(fm proposal_id)"
TARGET_LAYER="$(fm target_layer)"
TARGET_FILE_REL="$(fm target_file)"
CHANGE_KIND="$(fm change_kind)"
STATUS="$(fm status)"
DEST_FILE_REL="$(fm dest_file)"   # used by change_kind: archive

[ -z "$PROPOSAL_ID" ] && { echo "ERROR: proposal missing proposal_id" >&2; exit 1; }
[ -z "$TARGET_FILE_REL" ] && { echo "ERROR: proposal missing target_file" >&2; exit 1; }
[ -z "$CHANGE_KIND" ] && { echo "ERROR: proposal missing change_kind" >&2; exit 1; }

if [ "$STATUS" != "pending" ]; then
  echo "ERROR: proposal status is '$STATUS', expected 'pending'" >&2
  $FORCE || exit 1
  echo "WARNING: --force set, continuing anyway" >&2
fi

# Manager review check
# Range: from "manager_review:" to next frontmatter close "---", then grep verdict.
VERDICT="$(awk '/^manager_review:/,/^---$/{print}' "$PROPOSAL" \
            | awk '/^[[:space:]]+verdict:/ {sub(/.*verdict:[[:space:]]*/,""); print; exit}')"
if [ "$VERDICT" != "approved" ]; then
  echo "WARNING: manager_review.verdict is '${VERDICT:-<missing>}', not 'approved'" >&2
  $FORCE || { echo "Refusing to accept without approval. Use --force to override." >&2; exit 1; }
fi

TARGET_PATH="$ROOT/$TARGET_FILE_REL"

# Path-traversal guard: a malicious or malformed proposal could declare
# target_file: ../../etc/passwd (or similar) and accept.sh would happily
# write outside $ROOT. Resolve the path symbolically (-m allows non-existent
# files; we don't require the target to exist yet for new-file accepts) and
# require it to start with $ROOT/. realpath is GNU coreutils on Linux; on
# macOS we fall back to python3 since BSD realpath lacks the -m flag.
resolve_path() {
  if realpath -m / >/dev/null 2>&1; then
    realpath -m "$1"
  else
    python3 -c "import os,sys; print(os.path.normpath(os.path.abspath(sys.argv[1])))" "$1"
  fi
}
RESOLVED_ROOT="$(resolve_path "$ROOT")"
RESOLVED_TARGET="$(resolve_path "$TARGET_PATH")"
case "$RESOLVED_TARGET" in
  "$RESOLVED_ROOT"/*) : ;;
  "$RESOLVED_ROOT")   : ;;
  *)
    echo "ERROR: target_file resolves outside repo root: $RESOLVED_TARGET (root: $RESOLVED_ROOT)" >&2
    exit 1
    ;;
esac

TS_ISO="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

# Extract body (everything after the second --- line)
extract_body() {
  awk 'BEGIN { fm=0 } /^---$/ { fm++; next } fm>=2 { print }' "$PROPOSAL"
}

# Extract a fenced code block of a given language
# Usage: extract_fence <lang>
extract_fence() {
  local lang="$1"
  extract_body | awk -v lang="$lang" '
    $0 == "```"lang { inblock=1; next }
    inblock && $0 == "```" { inblock=0; exit }
    inblock { print }
  '
}

apply_edit() {
  local diff_text
  diff_text="$(extract_fence diff)"
  if [ -z "$diff_text" ]; then
    echo "ERROR: change_kind=edit but no \`\`\`diff block in body" >&2
    exit 1
  fi
  if [ ! -f "$TARGET_PATH" ]; then
    echo "ERROR: target_file does not exist: $TARGET_PATH" >&2
    exit 1
  fi

  # Multi-hunk atomicity (F4-build-3 finding #1):
  # Always do a `patch --dry-run` first. If ANY hunk would fail, abort cleanly
  # — no partial apply, no .rej files, target untouched. Only after dry-run
  # succeeds do we run the real patch. (When the caller passed --dry-run on
  # accept.sh itself, we still only do the dry-run pass.)
  local dry_stderr_file
  dry_stderr_file="$(mktemp)"
  set +e
  ( cd "$ROOT" && printf '%s\n' "$diff_text" | patch -p1 --silent --no-backup-if-mismatch --dry-run ) 2>"$dry_stderr_file"
  local dry_rc=$?
  set -e

  if [ "$dry_rc" -ne 0 ]; then
    echo "ERROR: patch dry-run failed (exit $dry_rc) — target unchanged" >&2
    if [ -s "$dry_stderr_file" ]; then
      echo "patch warnings:" >&2
      sed 's/^/  /' "$dry_stderr_file" >&2
    fi
    rm -f "$dry_stderr_file"
    exit "$dry_rc"
  fi
  # If we're in user-facing dry-run mode, surface dry-run warnings here and stop.
  if [ "$DRY_RUN" = true ]; then
    if [ -s "$dry_stderr_file" ]; then
      echo "patch warnings (dry-run):" >&2
      sed 's/^/  /' "$dry_stderr_file" >&2
    fi
    rm -f "$dry_stderr_file"
    return 0
  fi
  rm -f "$dry_stderr_file"

  # Real apply. Capture stderr separately so warnings still surface even on success.
  local patch_stderr_file
  patch_stderr_file="$(mktemp)"

  set +e
  ( cd "$ROOT" && printf '%s\n' "$diff_text" | patch -p1 --silent --no-backup-if-mismatch ) 2>"$patch_stderr_file"
  local patch_rc=$?
  set -e

  if [ -s "$patch_stderr_file" ]; then
    echo "patch warnings:" >&2
    sed 's/^/  /' "$patch_stderr_file" >&2
  fi
  rm -f "$patch_stderr_file"

  if [ "$patch_rc" -ne 0 ]; then
    # This shouldn't happen — dry-run passed but real apply failed. Surface loudly.
    echo "ERROR: patch failed AFTER dry-run succeeded (exit $patch_rc) — target may be partially modified, INVESTIGATE" >&2
    exit "$patch_rc"
  fi
}

apply_add() {
  local body
  body="$(extract_fence markdown)"
  if [ -z "$body" ]; then
    echo "ERROR: change_kind=add but no \`\`\`markdown block in body" >&2
    exit 1
  fi
  if [ -e "$TARGET_PATH" ]; then
    echo "ERROR: target_file already exists: $TARGET_PATH (use kind=edit instead)" >&2
    exit 1
  fi
  if [ "$DRY_RUN" = true ]; then
    echo "DRY RUN: would create $TARGET_FILE_REL ($(printf '%s\n' "$body" | wc -l | tr -d ' ') lines)" >&2
    return 0
  fi
  mkdir -p "$(dirname "$TARGET_PATH")"
  printf '%s\n' "$body" > "$TARGET_PATH"
}

apply_supersede() {
  if [ ! -f "$TARGET_PATH" ]; then
    echo "ERROR: target_file does not exist: $TARGET_PATH" >&2
    exit 1
  fi
  # F4-build-3 finding #2: terminal status word depends on target's type.
  # provider-adapter → "archived" (matches F4 enum). Else → "superseded".
  local target_type terminal_status
  target_type="$(awk '/^---$/{c++; next} c==1 && /^type:/ {sub(/^type:[[:space:]]*/,""); gsub(/^"|"$/,""); print; exit}' "$TARGET_PATH")"
  if [ "$target_type" = "provider-adapter" ]; then
    terminal_status="archived"
  else
    terminal_status="superseded"
  fi

  if [ "$DRY_RUN" = true ]; then
    echo "DRY RUN: would mark $TARGET_FILE_REL frontmatter status: $terminal_status" >&2
    return 0
  fi
  # Bump status to terminal in target frontmatter
  python3 - "$TARGET_PATH" "$terminal_status" <<'PY' || { echo "ERROR: failed to bump status" >&2; exit 1; }
import sys, re, pathlib
p = pathlib.Path(sys.argv[1])
terminal = sys.argv[2]
text = p.read_text()
m = re.match(r'^---\n(.*?)\n---\n(.*)$', text, re.S)
if not m:
    sys.exit("no frontmatter")
fm, body = m.group(1), m.group(2)
fm = re.sub(r'^status:.*$', f'status: {terminal}', fm, flags=re.M)
p.write_text(f"---\n{fm}\n---\n{body}")
PY
  # If body has an `add` block, also write a replacement
  local body
  body="$(extract_fence markdown || true)"
  if [ -n "$body" ]; then
    echo "NOTE: supersede includes a replacement add-block — file a separate add proposal in V1" >&2
  fi
}

# F4-build-3 finding #3: file-move support.
# `change_kind: archive` moves a file from target_file to dest_file, sets
# status:archived in the moved-to file, and stamps archived_at. Designed for
# the F4 decommission workflow's Purge phase (provider YAMLs → _archived/).
apply_archive() {
  if [ -z "$DEST_FILE_REL" ]; then
    echo "ERROR: change_kind=archive requires dest_file in proposal frontmatter" >&2
    exit 1
  fi
  if [ ! -f "$TARGET_PATH" ]; then
    echo "ERROR: target_file does not exist: $TARGET_PATH" >&2
    exit 1
  fi
  local dest_path="$ROOT/$DEST_FILE_REL"
  if [ -e "$dest_path" ]; then
    echo "ERROR: dest_file already exists: $dest_path" >&2
    exit 1
  fi
  if [ "$DRY_RUN" = true ]; then
    echo "DRY RUN: would move $TARGET_FILE_REL → $DEST_FILE_REL with status: archived" >&2
    return 0
  fi

  # Stamp status + archived_at into the file's frontmatter, then move.
  python3 - "$TARGET_PATH" "$TS_ISO" <<'PY' || { echo "ERROR: failed to stamp archive frontmatter" >&2; exit 1; }
import sys, re, pathlib
p = pathlib.Path(sys.argv[1])
ts = sys.argv[2]
text = p.read_text()
m = re.match(r'^---\n(.*?)\n---\n(.*)$', text, re.S)
if not m:
    sys.exit("no frontmatter")
fm, body = m.group(1), m.group(2)
fm = re.sub(r'^status:.*$', 'status: archived', fm, flags=re.M)
if re.search(r'^archived_at:', fm, re.M):
    fm = re.sub(r'^archived_at:.*$', f'archived_at: {ts}', fm, flags=re.M)
else:
    fm += f"\narchived_at: {ts}"
p.write_text(f"---\n{fm}\n---\n{body}")
PY

  mkdir -p "$(dirname "$dest_path")"
  mv "$TARGET_PATH" "$dest_path"

  # The post-apply frontmatter pass operates on TARGET_PATH; for archive,
  # the file now lives at dest_path. Repoint TARGET_PATH so updated:/provenance:
  # land in the right (moved) file.
  TARGET_PATH="$dest_path"
  TARGET_FILE_REL="$DEST_FILE_REL"
}

case "$CHANGE_KIND" in
  edit)      apply_edit ;;
  add)       apply_add ;;
  supersede) apply_supersede ;;
  archive)   apply_archive ;;
  *) echo "ERROR: unknown change_kind: $CHANGE_KIND" >&2; exit 1 ;;
esac

# Dry-run stops here: validation passed, patch was tested with --dry-run,
# but no mutations to target frontmatter, no archive, no index regen.
if [ "$DRY_RUN" = true ]; then
  echo "DRY RUN: $PROPOSAL_ID would be applied to $TARGET_FILE_REL"
  echo "         (no files modified)"
  exit 0
fi

# Update target frontmatter: updated + provenance
if [ -f "$TARGET_PATH" ]; then
  python3 - "$TARGET_PATH" "$PROPOSAL_ID" "$TS_ISO" <<'PY' || { echo "ERROR: failed to update target frontmatter" >&2; exit 1; }
import sys, re, pathlib
target, prop_id, ts = sys.argv[1], sys.argv[2], sys.argv[3]
p = pathlib.Path(target)
text = p.read_text()
m = re.match(r'^---\n(.*?)\n---\n(.*)$', text, re.S)
if not m:
    sys.exit(0)  # no frontmatter, leave alone
fm, body = m.group(1), m.group(2)

if re.search(r'^updated:', fm, re.M):
    fm = re.sub(r'^updated:.*$', f'updated: {ts}', fm, flags=re.M)
else:
    fm += f"\nupdated: {ts}"

if re.search(r'^provenance:', fm, re.M):
    fm = re.sub(
        r'^provenance:\s*\[(.*?)\]',
        lambda m: f"provenance: [{m.group(1)}, {prop_id}]" if m.group(1).strip() else f"provenance: [{prop_id}]",
        fm,
        flags=re.M,
    )
else:
    fm += f"\nprovenance: [{prop_id}]"

p.write_text(f"---\n{fm}\n---\n{body}")
PY
fi

# Update proposal status and move to _accepted/
python3 - "$PROPOSAL" "$TS_ISO" <<'PY'
import sys, re, pathlib
p = pathlib.Path(sys.argv[1])
ts = sys.argv[2]
text = p.read_text()
text = re.sub(r'^status:\s*pending\s*$', 'status: accepted', text, flags=re.M)
text = re.sub(r'^proposed_at:', f'accepted_at: {ts}\nproposed_at:', text, count=1, flags=re.M)
p.write_text(text)
PY

mkdir -p "$ROOT/queue/_accepted"
mv "$PROPOSAL" "$ROOT/queue/_accepted/$(basename "$PROPOSAL")"

# Refresh the memory index
bash "$ROOT/scripts/index-memory.sh" >/dev/null

echo "Accepted $PROPOSAL_ID"
echo "  applied to:  $TARGET_FILE_REL"
echo "  archived as: queue/_accepted/$(basename "$PROPOSAL")"

# F3 log emission — record the accept; advance LKG if target file is hash-stable
bash "$ROOT/scripts/log-emit.sh" \
  --actor "$ACTOR" \
  --action "accept" \
  --target "$TARGET_FILE_REL" \
  >/dev/null 2>&1 || true
