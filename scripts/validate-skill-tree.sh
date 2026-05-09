#!/usr/bin/env bash
# validate-skill-tree.sh — verify the entire skill tree.
#
# Checks:
#   1. Every skill has required frontmatter fields.
#   2. Every non-abstract skill has 'extends:' pointing to an existing skill.
#   3. Extends chain terminates at the root 'skill' abstract.
#   4. No cycles in the extends graph.
#   5. Concrete skills satisfy their abstract base's contract (declared inputs/outputs sections present).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

python3 - "$ROOT" <<'PY'
import sys, re
from pathlib import Path

ROOT = Path(sys.argv[1])
SKILLS = ROOT / "memory/skills"
errs = []
warns = []

REQUIRED = ["id", "skill_id", "type", "contract_version", "scope", "layer", "owning_layer", "status"]

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
        fm[k.strip()] = v.strip().strip('"\'')
    return fm, body

skills = {}
for f in SKILLS.rglob("*.yaml"):
    if "_resolved" in f.parts:
        continue
    fm, body = parse_frontmatter(f)
    if not fm:
        errs.append(f"{f.relative_to(ROOT)}: no frontmatter")
        continue
    for field in REQUIRED:
        if field not in fm:
            errs.append(f"{f.relative_to(ROOT)}: missing required field '{field}'")
    sid = fm.get("skill_id")
    if not sid:
        continue
    if sid in skills:
        errs.append(f"{f.relative_to(ROOT)}: duplicate skill_id '{sid}'")
    skills[sid] = {"fm": fm, "body": body, "path": f}

def walk(sid, visited=None):
    visited = visited or set()
    if sid in visited:
        return None, "cycle"
    if sid not in skills:
        return None, f"unknown skill '{sid}'"
    visited.add(sid)
    fm = skills[sid]["fm"]
    if sid == "skill":
        return [sid], None
    parent = fm.get("extends")
    if not parent:
        return None, f"skill '{sid}' has no extends and is not the root"
    chain, err = walk(parent, visited)
    if err:
        return None, err
    return chain + [sid], None

for sid in skills:
    chain, err = walk(sid)
    if err:
        errs.append(f"skill '{sid}': {err}")
        continue
    if chain[0] != "skill":
        errs.append(f"skill '{sid}': chain does not terminate at root 'skill' (ends at '{chain[0]}')")

for sid, info in skills.items():
    if info["fm"].get("abstract") == "true":
        continue
    body = info["body"]
    has_inputs = re.search(r'^##\s+Inputs', body, re.M) or re.search(r'^##\s+Inherits', body, re.M)
    has_outputs = re.search(r'^##\s+Outputs', body, re.M) or re.search(r'^##\s+Inherits', body, re.M)
    if not (has_inputs and has_outputs):
        warns.append(f"skill '{sid}': body lacks 'Inputs' / 'Outputs' (or 'Inherits') section — contract verification incomplete")

print(f"validate-skill-tree: {len(skills)} skills examined")
if warns:
    print(f"\n{len(warns)} warning(s):")
    for w in warns:
        print(f"  WARN: {w}")
if errs:
    print(f"\n{len(errs)} error(s):")
    for e in errs:
        print(f"  ERR:  {e}")
    sys.exit(2)
print("\nclean ✓")
PY
