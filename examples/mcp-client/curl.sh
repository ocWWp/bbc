#!/usr/bin/env bash
# BBC brain — curl quickstart.
#
# Usage:
#   export BBC_URL="http://localhost:3000"
#   export BBC_API_KEY="bbc_xxx.yyy"
#   bash curl.sh

set -euo pipefail

: "${BBC_URL:?BBC_URL not set}"
: "${BBC_API_KEY:?BBC_API_KEY not set}"

AUTH="Authorization: Bearer ${BBC_API_KEY}"
JSON="Content-Type: application/json"

echo "## 1. MCP discovery (no auth needed)"
curl -s "${BBC_URL}/api/mcp" | jq '.tools | length as $n | "\($n) tools available"'

echo
echo "## 2. MCP: list tools (authenticated)"
curl -s -X POST "${BBC_URL}/api/mcp" -H "${AUTH}" -H "${JSON}" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | jq '.result.tools[].name'

echo
echo "## 3. MCP: list decisions (tool call)"
curl -s -X POST "${BBC_URL}/api/mcp" -H "${AUTH}" -H "${JSON}" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"list_decisions","arguments":{"limit":3}}}' | jq

echo
echo "## 4. MCP: search memories"
curl -s -X POST "${BBC_URL}/api/mcp" -H "${AUTH}" -H "${JSON}" \
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"search_memories","arguments":{"query":"auth","limit":5}}}' | jq

echo
echo "## 5. REST: list memories of type=vendor"
curl -s "${BBC_URL}/api/v1/brain/memories?type=vendor&limit=5" -H "${AUTH}" | jq

echo
echo "## 6. REST: search"
curl -s "${BBC_URL}/api/v1/brain/search?q=launch&limit=3" -H "${AUTH}" | jq

echo
echo "## 7. REST: pending proposals"
curl -s "${BBC_URL}/api/v1/brain/proposals?status=pending&limit=3" -H "${AUTH}" | jq

echo
echo "## 8. REST: discovery endpoint (no auth)"
curl -s "${BBC_URL}/api/v1/brain" | jq '.endpoints | length as $n | "\($n) REST endpoints"'
