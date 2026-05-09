#!/usr/bin/env bash
# rank.sh — F1 ranker: score adapters that satisfy a role under a profile.
#
# Pure function: given <role-id> and <profile-id>, output a pick_trace YAML
# listing excluded candidates (with reasons) and ranked survivors (with
# per-term scores). Does NOT mutate bindings; that's a separate proposal.
#
# Usage:
#   rank.sh <role-id> [--profile <profile-id>]   (default profile: _org-policy)
#
# Output: pick_trace YAML on stdout.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

if [ $# -lt 1 ]; then
  echo "Usage: rank.sh <role-id> [--profile <profile-id>]" >&2
  exit 2
fi

ROLE="$1"
shift
PROFILE="_org-policy"
while [ $# -gt 0 ]; do
  case "$1" in
    --profile) PROFILE="$2"; shift 2 ;;
    *) echo "ERROR: unknown arg: $1" >&2; exit 2 ;;
  esac
done

python3 - "$ROOT" "$ROLE" "$PROFILE" <<'PY'
import sys, re, math
from pathlib import Path

ROOT = Path(sys.argv[1])
ROLE_ID = sys.argv[2]
PROFILE_ID = sys.argv[3]

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

def parse_simple_kv_block(body, marker_re, terminator_re=r'^##\s'):
    """Extract key:value pairs under a heading until the next heading."""
    in_block = False
    out = {}
    for line in body.split('\n'):
        if re.match(marker_re, line):
            in_block = True
            continue
        if in_block and re.match(terminator_re, line):
            break
        if in_block:
            stripped = line.strip().lstrip('-').lstrip(' *')
            if ':' in stripped and not stripped.startswith('#'):
                k, v = stripped.split(':', 1)
                out[k.strip()] = v.strip()
    return out

def find_role(role_id):
    for f in (ROOT / "memory/ops/provider-roles").glob("*.yaml"):
        fm, body = parse_frontmatter(f)
        if fm and fm.get("role_id") == role_id:
            return fm, body, f
    return None, None, None

def find_profile(profile_id):
    for f in (ROOT / "memory/ops/profiles").glob("*.yaml"):
        fm, body = parse_frontmatter(f)
        if fm and fm.get("profile_id") == profile_id:
            return fm, body, f
    return None, None, None

def find_adapters_implementing(role_id):
    out = []
    for f in (ROOT / "memory/ops/providers").glob("*.yaml"):
        fm, body = parse_frontmatter(f)
        if not fm:
            continue
        impls = fm.get("implements", [])
        if isinstance(impls, str):
            impls = [impls]
        if role_id in impls:
            out.append((fm, body, f))
    return out

# ---------- Find role ----------
role_fm, role_body, role_path = find_role(ROLE_ID)
if not role_fm:
    print(f"# ERROR: role '{ROLE_ID}' not found")
    sys.exit(1)

# ---------- Find profile (use _org-policy as fallback context) ----------
profile_fm, profile_body, profile_path = find_profile(PROFILE_ID)
if not profile_fm:
    print(f"# ERROR: profile '{PROFILE_ID}' not found")
    sys.exit(1)

# Get _org-policy for inheritance
org_fm, org_body, _ = find_profile("_org-policy")

# ---------- Extract profile constraints + weights ----------
def get_constraint(body, key):
    """Pull 'key: value' from body; coerce numbers."""
    m = re.search(r'^- ' + re.escape(key) + r':\s*([^\n#]+)', body, re.M)
    if not m:
        return None
    val = m.group(1).strip().strip('"\'')
    if val == "null":
        return None
    try: return float(val)
    except ValueError: return val

def get_weights(body):
    weights = {}
    in_weights = False
    for line in body.split('\n'):
        if re.match(r'^weights:', line) or re.match(r'^trust_weights:', line):
            in_weights = True
            continue
        if in_weights:
            if line.strip() == "" or re.match(r'^##\s', line):
                if weights: break
                continue
            m = re.match(r'^\s+(\w+):\s*([\d.]+)', line)
            if m:
                weights[m.group(1)] = float(m.group(2))
            elif re.match(r'^\S', line) and weights:
                break
    return weights

max_cost = get_constraint(profile_body, "max_cost_per_call_usd") or get_constraint(org_body or "", "max_cost_per_call_usd")
max_latency = get_constraint(profile_body, "max_latency_p95_ms") or get_constraint(org_body or "", "max_latency_p95_ms")
weights = get_weights(profile_body) or get_weights(org_body or "") or {}

# ---------- Find candidates ----------
candidates = find_adapters_implementing(ROLE_ID)

# ---------- Filter: hard constraints ----------
excluded = []
survivors = []

def get_metric(body, key):
    m = re.search(r'^- ' + re.escape(key) + r':\s*([\d.]+)', body, re.M)
    return float(m.group(1)) if m else None

for fm, body, _ in candidates:
    pid = fm.get("provider_id")
    status = fm.get("status")
    if status == "archived":
        excluded.append((pid, "status: archived"))
        continue
    cost = get_metric(body, "cost_per_call_usd")
    lat = get_metric(body, "latency_p95_ms") or get_metric(body, "latency_p95_first_token_ms")
    if max_cost is not None and cost is not None and cost > max_cost:
        excluded.append((pid, f"cost {cost} > max {max_cost}"))
        continue
    if max_latency is not None and lat is not None and lat > max_latency:
        excluded.append((pid, f"latency {lat}ms > max {max_latency}ms"))
        continue
    survivors.append((fm, body))

# ---------- Score survivors ----------
ranked = []
for fm, body in survivors:
    pid = fm.get("provider_id")
    cost = get_metric(body, "cost_per_call_usd") or 0
    lat = get_metric(body, "latency_p95_ms") or get_metric(body, "latency_p95_first_token_ms") or 0

    norm_cost = max(0, 1 - (cost / max_cost)) if max_cost else 0.5
    norm_latency = max(0, 1 - (lat / max_latency)) if max_latency else 0.5
    # Trust: V1 scaffolding — if metadata is sparse, default mid-range. Real F1.C
    # multi-source trust requires populated stability/outcome blocks (gap #5).
    trust = 0.5
    outcome = 0.0   # cold start — no outcome log yet (F1-build-3)
    pref = 0.0      # preference_match — no preferred_providers populated yet

    w = {
        "cost": weights.get("cost", 0.25),
        "latency": weights.get("latency", 0.15),
        "trust": weights.get("trust", 0.35),
        "outcome_history": weights.get("outcome_history", 0.15),
        "preference_match": weights.get("preference_match", 0.10),
    }

    score = (w["cost"] * norm_cost +
             w["latency"] * norm_latency +
             w["trust"] * trust +
             w["outcome_history"] * outcome +
             w["preference_match"] * pref)

    ranked.append({
        "provider": pid,
        "score": round(score, 4),
        "terms": {
            "cost": round(norm_cost, 4),
            "latency": round(norm_latency, 4),
            "trust": round(trust, 4),
            "outcome": round(outcome, 4),
            "preference": round(pref, 4),
        },
    })

# Sort: highest score first, deterministic tiebreak by provider_id
ranked.sort(key=lambda r: (-r["score"], r["provider"]))

# ---------- Emit pick_trace ----------
import json
print("---")
print(f"role: {ROLE_ID}")
print(f"profile: {PROFILE_ID}")
print(f"candidates_total: {len(candidates)}")
print(f"survived_filter: {len(survivors)}")
if ranked:
    print(f"picked: {ranked[0]['provider']}")
else:
    print("picked: null")
print("excluded:")
for pid, reason in excluded:
    print(f"  - {{ provider: {pid}, reason: \"{reason}\" }}")
print("ranked:")
for r in ranked:
    print(f"  - {{ provider: {r['provider']}, score: {r['score']}, "
          f"terms: {{ cost: {r['terms']['cost']}, latency: {r['terms']['latency']}, "
          f"trust: {r['terms']['trust']}, outcome: {r['terms']['outcome']}, "
          f"preference: {r['terms']['preference']} }} }}")
_dt = __import__("datetime")
print("decided_at: " + _dt.datetime.now(_dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"))
print("decided_by: ranker-v1")
print("notes: |")
print("  V1 scaffolding: trust uses default 0.5 (real multi-source trust scoring is")
print("  F1-build-3+); outcome is 0 (cold start; no outcome log yet); preference_match")
print("  is 0 (no preferred_providers configured). Run rank.sh once outcome data exists.")
PY
