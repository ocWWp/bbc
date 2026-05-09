#!/usr/bin/env bash
# validate-providers.sh — schema + cross-reference validator for F4 YAMLs.
#
# Checks:
#   1. Every provider-role YAML has required frontmatter fields and valid values.
#   2. Every adapter YAML has required frontmatter fields and valid status.
#   3. Every adapter's `implements: [<role-id>...]` references a role that exists.
#   4. Every adapter's `contract_version` matches the implemented role's contract_version.
#   5. `bindings.yaml` references provider_ids that exist as adapter files.
#   6. Each binding's role exists.
#
# Exit code 0 = clean. Non-zero = at least one failure (count printed at end).
#
# Usage:
#   bash scripts/validate-providers.sh [--strict]
#
# --strict: also fail on warnings (e.g., status: candidate provider bound).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

STRICT=false
[ "${1:-}" = "--strict" ] && STRICT=true

# Run the heavy lifting in python3 — bash YAML parsing is a tarpit.
python3 - "$ROOT" "$STRICT" <<'PY'
import sys, os, re
from pathlib import Path

ROOT = Path(sys.argv[1])
STRICT = sys.argv[2] == "true"
errs = []
warns = []

def parse_frontmatter(path):
    """Return dict from YAML frontmatter at top of file. None if no frontmatter."""
    text = path.read_text()
    m = re.match(r'^---\n(.*?)\n---', text, re.S)
    if not m:
        return None
    fm = {}
    body = m.group(1)
    # very small YAML subset: key: value, key: [list, items], key: <value>
    for line in body.split('\n'):
        line = line.rstrip()
        if not line or line.startswith('#'):
            continue
        if ':' not in line:
            continue
        k, v = line.split(':', 1)
        k = k.strip()
        v = v.strip()
        if v.startswith('[') and v.endswith(']'):
            inner = v[1:-1].strip()
            v = [x.strip().strip('"\'') for x in inner.split(',') if x.strip()] if inner else []
        else:
            v = v.strip('"\'')
        fm[k] = v
    return fm

def fail(msg):  errs.append(msg)
def warn(msg): warns.append(msg)

# ---------- Roles ----------
roles_dir = ROOT / "memory/ops/provider-roles"
role_files = sorted(roles_dir.glob("*.yaml")) if roles_dir.exists() else []

if not role_files:
    fail(f"No role YAMLs found in {roles_dir}")

roles = {}  # role_id -> { contract_version, path }
REQUIRED_ROLE_FIELDS = ["id", "role_id", "type", "layer", "owning_layer", "contract_version", "status"]

for f in role_files:
    fm = parse_frontmatter(f)
    if fm is None:
        fail(f"{f.relative_to(ROOT)}: no frontmatter")
        continue
    for field in REQUIRED_ROLE_FIELDS:
        if field not in fm:
            fail(f"{f.relative_to(ROOT)}: missing required field '{field}'")
    if fm.get("type") != "provider-role":
        fail(f"{f.relative_to(ROOT)}: type is '{fm.get('type')}', expected 'provider-role'")
    if fm.get("status") not in {"accepted", "proposed", "superseded", "archived"}:
        fail(f"{f.relative_to(ROOT)}: invalid status '{fm.get('status')}'")
    rid = fm.get("role_id")
    if rid:
        if rid in roles:
            fail(f"{f.relative_to(ROOT)}: duplicate role_id '{rid}' (also in {roles[rid]['path']})")
        roles[rid] = {"contract_version": fm.get("contract_version"), "path": str(f.relative_to(ROOT))}

# ---------- Adapters ----------
providers_dir = ROOT / "memory/ops/providers"
adapter_files = sorted([f for f in providers_dir.glob("*.yaml") if "_archived" not in f.parts]) if providers_dir.exists() else []
archived_files = sorted((providers_dir / "_archived").glob("*.yaml")) if (providers_dir / "_archived").exists() else []

adapters = {}  # provider_id -> { implements, contract_version, status, path }
REQUIRED_ADAPTER_FIELDS = ["id", "provider_id", "type", "implements", "contract_version", "status", "layer", "owning_layer"]
VALID_ADAPTER_STATUS = {"candidate", "active", "deprecated", "archived"}

for f in adapter_files:
    fm = parse_frontmatter(f)
    if fm is None:
        fail(f"{f.relative_to(ROOT)}: no frontmatter")
        continue
    for field in REQUIRED_ADAPTER_FIELDS:
        if field not in fm:
            fail(f"{f.relative_to(ROOT)}: missing required field '{field}'")
    if fm.get("type") != "provider-adapter":
        fail(f"{f.relative_to(ROOT)}: type is '{fm.get('type')}', expected 'provider-adapter'")
    if fm.get("status") not in VALID_ADAPTER_STATUS:
        fail(f"{f.relative_to(ROOT)}: invalid adapter status '{fm.get('status')}'")
    pid = fm.get("provider_id")
    if pid:
        if pid in adapters:
            fail(f"{f.relative_to(ROOT)}: duplicate provider_id '{pid}'")
        adapters[pid] = {
            "implements": fm.get("implements", []),
            "contract_version": fm.get("contract_version"),
            "status": fm.get("status"),
            "path": str(f.relative_to(ROOT)),
        }

# ---------- Cross-refs: adapter -> role ----------
for pid, a in adapters.items():
    impls = a["implements"] if isinstance(a["implements"], list) else [a["implements"]]
    if not impls:
        fail(f"adapter '{pid}': empty 'implements' list")
        continue
    for role_id in impls:
        if role_id not in roles:
            fail(f"adapter '{pid}': implements unknown role '{role_id}'")
            continue
        if str(a["contract_version"]) != str(roles[role_id]["contract_version"]):
            fail(f"adapter '{pid}': contract_version {a['contract_version']} != role '{role_id}' contract_version {roles[role_id]['contract_version']}")

# ---------- Bindings ----------
# Schema (post-Part 3 polish): 5 cells per row.
#   | role | provider | provisional | bound_at | notes |
# provider: <id>  OR  "(unbound)"
# provisional: yes | no | -
infos = []
bindings_path = ROOT / "memory/ops/bindings.yaml"
if not bindings_path.exists():
    fail("memory/ops/bindings.yaml does not exist")
else:
    text = bindings_path.read_text()
    in_table = False
    for line in text.split('\n'):
        if line.startswith('| role'):
            in_table = True
            continue
        if in_table and line.startswith('|---'):
            continue
        if in_table:
            if not line.startswith('|'):
                in_table = False
                continue
            cells = [c.strip() for c in line.strip().strip('|').split('|')]
            if len(cells) < 5:
                # Legacy 4-cell rows are no longer accepted; flag and skip.
                if len(cells) >= 2:
                    fail(f"bindings.yaml: row for '{cells[0]}' has {len(cells)} cells, expected 5 (role|provider|provisional|bound_at|notes)")
                continue
            role_id, provider_cell, provisional_cell = cells[0], cells[1], cells[2]
            if provider_cell == "(unbound)":
                if role_id not in roles:
                    fail(f"bindings.yaml: unknown role '{role_id}' (unbound)")
                continue
            pid = provider_cell
            # Validate
            if role_id not in roles:
                fail(f"bindings.yaml: unknown role '{role_id}'")
            if pid not in adapters:
                fail(f"bindings.yaml: role '{role_id}' bound to unknown adapter '{pid}'")
            else:
                impls = adapters[pid]["implements"]
                if not isinstance(impls, list):
                    impls = [impls]
                if role_id not in impls:
                    fail(f"bindings.yaml: role '{role_id}' bound to '{pid}' but adapter does NOT declare 'implements: [{role_id}]'")
                if adapters[pid]["status"] == "archived":
                    fail(f"bindings.yaml: role '{role_id}' bound to ARCHIVED adapter '{pid}'")
                # Coherence: provisional-row vs adapter status.
                if provisional_cell == "yes":
                    if adapters[pid]["status"] not in ("candidate", "active"):
                        fail(f"bindings.yaml: '{role_id}' marked provisional but adapter '{pid}' status is '{adapters[pid]['status']}'")
                    infos.append(f"bindings.yaml: '{role_id}' is provisionally bound to '{pid}' (adapter status: {adapters[pid]['status']})")
                elif provisional_cell == "no":
                    if adapters[pid]["status"] == "candidate":
                        fail(f"bindings.yaml: '{role_id}' marked NOT provisional but adapter '{pid}' is still 'candidate' (mismatch — promote adapter to 'active' or set provisional: yes)")
                else:
                    fail(f"bindings.yaml: '{role_id}' provisional cell is '{provisional_cell}', expected 'yes' or 'no' or '-' (use '-' only with provider '(unbound)')")

# ---------- Output ----------
print(f"validate-providers: {len(role_files)} roles, {len(adapters)} adapters, {len(archived_files)} archived")
if infos:
    print(f"\n{len(infos)} info note(s):")
    for i in infos:
        print(f"  INFO: {i}")
if warns:
    print(f"\n{len(warns)} warning(s):")
    for w in warns:
        print(f"  WARN: {w}")
if errs:
    print(f"\n{len(errs)} error(s):")
    for e in errs:
        print(f"  ERR:  {e}")
    sys.exit(2)
if STRICT and warns:
    sys.exit(1)
print("\nclean ✓")
PY
