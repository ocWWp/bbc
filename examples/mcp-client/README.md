# BBC client examples

Working code that queries the BBC brain via the [MCP server](../../docs/integrate/mcp.mdx) and the [REST shim](../../docs/integrate/mcp.mdx#planned-tools). Pick the language closest to where your agent runs.

## Get an API key

```
1. Sign in to your BBC deployment
2. Open /api-keys
3. Click "Generate key" — copy the token
4. Set it as an env var:
   export BBC_API_KEY="bbc_<key_id>.<secret>"
   export BBC_URL="http://localhost:3000"   # or your deployed URL
```

All examples read those two env vars.

## What's here

| File | What it does | Runs |
|---|---|---|
| `curl.sh` | Eight one-liners — every MCP/REST endpoint, copy-pasteable | `bash` |
| `typescript.ts` | Node script: lists decisions + searches the brain via MCP | `node` |
| `python.py` | Python script: same flow as the TS one | `python` |
| `submit-memory.ts` | TypeScript: submit a new memory record via the REST shim (requires `write` scope) | `node` |

## Quick verification

```bash
export BBC_API_KEY="bbc_xxx.yyy"
export BBC_URL="http://localhost:3000"

# REST: list decisions
curl -s "$BBC_URL/api/v1/brain/decisions?limit=3" \
  -H "Authorization: Bearer $BBC_API_KEY" | jq

# MCP: list tools
curl -s -X POST "$BBC_URL/api/mcp" \
  -H "Authorization: Bearer $BBC_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | jq
```

If both work, you're set. Otherwise the most common failures:

- **401 unauthorized** — token typo or revoked key. Generate a fresh one.
- **403 forbidden** — you used a `read` key on a `write` endpoint. Generate a `write` key (or `admin`).
- **404 not found** — wrong path. Check `GET $BBC_URL/api/v1/brain` for the live endpoint list.

## What the agents can do

Read tools (all scopes):
- `list_memories(type?, limit?)` — typed records by supertag
- `get_memory(id)` — full record
- `search_memories(query, limit?)` — ilike on title + content
- `list_decisions(limit?)` / `list_vendors()` — convenience filters
- `list_proposals(status?, limit?)` / `get_proposal(proposal_id)` — queue read

Write tools (`write` scope required):
- `submit_memory(type, title, content?, fields?)` — insert a new memory

See [memory types reference](../../docs/concepts/memory-types.mdx) for the supertag list and field shapes.
