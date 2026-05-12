#!/usr/bin/env bash
# Seed a fresh tenant with starter memories so the studios and MCP have
# something to work with. Calls the REST shim at /api/v1/brain/memories.
#
# Usage:
#   export BBC_URL="http://localhost:3000"          # or your deployed URL
#   export BBC_API_KEY="bbc_<key_id>.<secret>"      # MUST be write-scope
#   bash scripts/seed-demo-memories.sh
#
# Idempotency: this script inserts new rows every time it runs. If you run
# it twice you'll get duplicates. Delete via /memory or supabase if needed.
#
# What it seeds:
#   1 product      (your positioning + target user)
#   1 voice        (do/don't words + register)
#   4 decisions    (the most concrete supertag for studio testing)
#   3 vendors      (so vendor-swap workflows have something to swap)
#   2 team         (so founder studio can address people by name)
#                  -- 11 memories total
#
# The content is generic "demo company" — you'll want to replace it with
# real memories via /welcome or the dashboard editor.

set -euo pipefail

: "${BBC_URL:?BBC_URL not set}"
: "${BBC_API_KEY:?BBC_API_KEY not set}"

AUTH="Authorization: Bearer ${BBC_API_KEY}"
JSON="Content-Type: application/json"
ENDPOINT="${BBC_URL%/}/api/v1/brain/memories"

submit() {
  local label="$1"
  local body="$2"
  local res
  res=$(curl -s -w '\nHTTP:%{http_code}' -X POST "${ENDPOINT}" \
    -H "${AUTH}" -H "${JSON}" -d "${body}")
  local http
  http=$(echo "${res}" | tail -n 1 | sed 's/HTTP://')
  local payload
  payload=$(echo "${res}" | sed '$d')
  if [[ "${http}" != "201" ]]; then
    echo "  ✗ ${label} -> HTTP ${http}: ${payload}" >&2
    return 1
  fi
  local id
  id=$(echo "${payload}" | sed -n 's/.*"id":"\([^"]*\)".*/\1/p')
  echo "  ✓ ${label} -> ${id:0:8}…"
}

echo "Seeding demo memories into ${BBC_URL}"
echo

echo "Product (1):"
submit "Positioning" '{
  "type": "product",
  "title": "Demo Co positioning",
  "content": "Demo Co is the company brain. We help founders stop re-pasting context into AI tools.",
  "fields": {
    "positioning": "The company brain. Three loops on one typed memory schema.",
    "target_user": "Solo / early-stage founders who waste half a day re-pasting context into AI tools.",
    "differentiators": ["Typed memory, not vector blob", "AGPLv3 self-host", "BYOK"]
  }
}'

echo
echo "Voice (1):"
submit "Voice" '{
  "type": "voice",
  "title": "Demo Co voice",
  "content": "Direct, lowercase, no corporate hedging. Speak to the founder like a peer.",
  "fields": {
    "register": "direct, lowercase, peer-to-peer",
    "do_words": ["plainly", "shipped", "what we decided"],
    "dont_words": ["users", "we believe", "leverage", "synergy"],
    "example_phrases": ["we shipped it", "the brain is alive", "stop re-pasting"]
  }
}'

echo
echo "Decisions (4):"
submit "ADR-0001 deployment modes" '{
  "type": "decision",
  "title": "Two deployment modes: file + DB",
  "fields": {
    "decision": "Demo Co supports file-mode (single-tenant self-host) and DB-mode (multi-tenant) from one codebase.",
    "rationale": "Solo founders want zero infra; hosted demo needs multi-tenant. One schema serves both.",
    "consequences": ["Stores have two implementations behind one interface", "Tenant-scoping via RLS in DB-mode"]
  }
}'

submit "ADR-0002 AGPLv3" '{
  "type": "decision",
  "title": "AGPLv3 license, no Stripe in v1",
  "fields": {
    "decision": "Ship AGPLv3, no paywall, no metered SaaS. Self-host or hosted-demo only.",
    "rationale": "Builds the open-source moat first. Commercial license stays a future option.",
    "consequences": ["Cannot accept revenue in v1", "Can sell hosted/enterprise license later"]
  }
}'

submit "ADR-0003 BYOK" '{
  "type": "decision",
  "title": "Bring-your-own-keys, no central billing",
  "fields": {
    "decision": "Tenants supply their own Anthropic key via /settings/keys, encrypted server-side.",
    "rationale": "No metering, no central liability, no surprise bills.",
    "consequences": ["Tenants need their own Anthropic account to use LLM features"]
  }
}'

submit "ADR-0004 Cloudflare Workers" '{
  "type": "decision",
  "title": "Default deployment target: Cloudflare Workers via OpenNext",
  "fields": {
    "decision": "Ship the Cloudflare deploy button as the primary path; keep Vercel working as fallback.",
    "rationale": "Cloudflare is cheaper at our volume + free tier is generous.",
    "consequences": ["cf:build / cf:deploy pnpm scripts maintained", "Some Vercel-only features (ISR) avoided"]
  }
}'

echo
echo "Vendors (3):"
submit "Vendor: Anthropic" '{
  "type": "vendor",
  "title": "Anthropic",
  "fields": {
    "vendor_name": "Anthropic",
    "role": "llm-provider",
    "status": "active",
    "notes": "claude-sonnet-4-6 for run, claude-haiku-4-5 for proposal routing"
  }
}'

submit "Vendor: Supabase" '{
  "type": "vendor",
  "title": "Supabase",
  "fields": {
    "vendor_name": "Supabase",
    "role": "db-provider",
    "status": "active",
    "notes": "Postgres + Auth + RLS. Free tier covers self-host."
  }
}'

submit "Vendor: Cloudflare" '{
  "type": "vendor",
  "title": "Cloudflare",
  "fields": {
    "vendor_name": "Cloudflare",
    "role": "hosting-provider",
    "status": "active",
    "notes": "Workers via OpenNext adapter"
  }
}'

echo
echo "Team (2):"
submit "Team: founder" '{
  "type": "team",
  "title": "Demo Founder",
  "fields": {
    "name": "Demo Founder",
    "role": "founder + engineering",
    "responsibilities": "Sets product direction; owns Demo Co core."
  }
}'

submit "Team: designer" '{
  "type": "team",
  "title": "Demo Designer",
  "fields": {
    "name": "Demo Designer",
    "role": "design + brand",
    "responsibilities": "Visual system, marketing assets, voice consistency."
  }
}'

echo
echo "Done. Open ${BBC_URL}/memory to see the seeded records."
echo "Try a studio: ${BBC_URL}/studio"
