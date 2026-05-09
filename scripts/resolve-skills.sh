#!/usr/bin/env bash
# resolve-skills.sh — F2 resolver: walk extends chain for a (caller, skill_id)
# pair and emit a flat effective skill + resolution_trace.
#
# Usage:
#   resolve-skills.sh <skill-short-id> [--caller <layer>]
#
# <skill-short-id> = e.g. "pr-review" (the resolver finds the most-specific
# match by looking at <caller>/pr-review.yaml then general/pr-review.yaml).
# <layer> defaults to "general" when not provided.
#
# Output: an effective skill YAML on stdout, plus a resolution_trace block.
#
# Side-effect: caches result to memory/skills/_resolved/<caller>__<skill>.yaml

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

if [ $# -lt 1 ]; then
  echo "Usage: resolve-skills.sh <skill-short-id> [--caller <layer>]" >&2
  exit 2
fi

SHORT_ID="$1"
shift
CALLER="general"
while [ $# -gt 0 ]; do
  case "$1" in
    --caller) CALLER="$2"; shift 2 ;;
    *) echo "ERROR: unknown arg: $1" >&2; exit 2 ;;
  esac
done

python3 - "$ROOT" "$SHORT_ID" "$CALLER" <<'PY'
import sys, re
from pathlib import Path

ROOT = Path(sys.argv[1])
SHORT_ID = sys.argv[2]
CALLER = sys.argv[3]

SKILLS = ROOT / "memory/skills"

def parse_frontmatter(path):
    text = path.read_text()
    m = re.match(r'^---\n(.*?)\n---', text, re.S)
    if not m:
        return None, ""
    body = text[m.end():]
    fm = {}
    for line in m.group(1).split('\n'):
        line = line.rstrip()
        if not line or line.startswith('#') or ':' not in line:
            continue
        k, v = line.split(':', 1)
        k = k.strip(); v = v.strip()
        if v.startswith('[') and v.endswith(']'):
            inner = v[1:-1].strip()
            v = [x.strip().strip('"\'') for x in inner.split(',') if x.strip()] if inner else []
        else:
            v = v.strip('"\'')
        fm[k] = v
    return fm, body

def find_skill(skill_id):
    """Find a skill file by its skill_id field (e.g., 'general.pr-review' or 'pr-review' for a tier match)."""
    # Map skill_id 'general.pr-review' to general/pr-review.yaml; 'review-skill' to _abstract/review-skill.yaml
    for f in SKILLS.rglob("*.yaml"):
        if "_resolved" in f.parts:
            continue
        fm, body = parse_frontmatter(f)
        if fm and fm.get("skill_id") == skill_id:
            return fm, body, f
    return None, None, None

# --- Specificity walk: find the most-specific concrete skill matching SHORT_ID ---
# Layer order (most specific to least):
#   1. <caller>.<short>            (e.g., 8azi-web.pr-review)
#   2. <caller-brand>.<short>      (skipped in V1 — no brand tier)
#   3. general.<short>
#   4. <short>                     (abstract; rare for direct invocation)

candidates = []
for prefix in [f"{CALLER}.{SHORT_ID}", f"general.{SHORT_ID}", SHORT_ID]:
    fm, body, path = find_skill(prefix)
    if fm:
        candidates.append((fm, body, path))

if not candidates:
    print(f"# ERROR: no skill resolves '{SHORT_ID}' from caller '{CALLER}'")
    sys.exit(1)

# Pick most-specific (first in candidates list)
chosen_fm, chosen_body, chosen_path = candidates[0]

# --- Walk extends chain upward ---
chain = []
current_id = chosen_fm.get("skill_id")
visited = set()
while current_id:
    if current_id in visited:
        print(f"# ERROR: cycle detected in extends chain at '{current_id}'")
        sys.exit(1)
    visited.add(current_id)
    fm, body, path = find_skill(current_id)
    if not fm:
        print(f"# ERROR: extends references unknown skill '{current_id}'")
        sys.exit(1)
    chain.append((fm, body, path))
    current_id = fm.get("extends")

# Reverse so root abstract is first; concrete skill is last
chain.reverse()

# --- Validate: chain must terminate at the root 'skill' abstract ---
if chain[0][0].get("skill_id") != "skill":
    print(f"# WARNING: chain does not terminate at root 'skill' abstract; got '{chain[0][0].get('skill_id')}'")

# --- Materialize: walk chain forward, accumulating fields ---
# V1 simplification: the body sections of each link are concatenated;
# scalar frontmatter fields take the most-specific value (last wins).
effective_fm = {}
body_sections = []
for fm, body, path in chain:
    for k, v in fm.items():
        # Skip identity fields that should reflect the FINAL skill, not the chain
        if k in ("id", "skill_id", "abstract", "extends"):
            continue
        effective_fm[k] = v
    body_sections.append(f"# === inherited from {fm.get('skill_id')} ({path.relative_to(ROOT)}) ===\n{body.strip()}")

# Use the most-specific file's identity
effective_fm["id"] = chosen_fm.get("id")
effective_fm["skill_id"] = chosen_fm.get("skill_id")
effective_fm["resolved_for_caller"] = CALLER

# --- Cache to _resolved/ ---
resolved_dir = SKILLS / "_resolved"
resolved_dir.mkdir(parents=True, exist_ok=True)
cache_file = resolved_dir / f"{CALLER}__{SHORT_ID}.yaml"

# --- Emit ---
out_lines = ["---"]
for k, v in effective_fm.items():
    if isinstance(v, list):
        out_lines.append(f"{k}: [{', '.join(v)}]")
    else:
        out_lines.append(f"{k}: {v}")
out_lines.append("---")
out_lines.append("")
out_lines.append("# Resolution trace")
out_lines.append("resolution_trace:")
out_lines.append(f"  requested: {SHORT_ID}")
out_lines.append(f"  caller: {CALLER}")
out_lines.append("  chain:")
for fm, _, path in chain:
    out_lines.append(f"    - {{ skill_id: {fm.get('skill_id')}, path: {path.relative_to(ROOT)} }}")
out_lines.append(f"  effective_skill_id: {chosen_fm.get('skill_id')}")
out_lines.append("")
for sec in body_sections:
    out_lines.append(sec)
    out_lines.append("")

output = "\n".join(out_lines)
cache_file.write_text(output)
print(output)
print(f"\n# (cached to {cache_file.relative_to(ROOT)})")
PY
