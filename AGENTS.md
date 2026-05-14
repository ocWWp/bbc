# Onboarding for Agents

You are an LLM operating inside the BBC repo. Read this first, then `CLAUDE.md`, then the Manager and Distribution `CLAUDE.md` if relevant.

## What this repo is

The BBC product — a brain protocol + dashboard + MCP server. Three layers (Main → Manager → Distribution) communicating through Markdown memory and a proposal queue.

If you're operating against a tenant repo (the dashboard launched with `BBC_REPO=path-to-tenant-repo`), this BBC repo provides the protocol contracts; the tenant repo provides the actual memory + queue + log content. See [`docs/tenant-repo-architecture.md`](docs/tenant-repo-architecture.md).

## How to find your layer

Where you opened the session decides your role:

| You started in… | You are | Read first |
|---|---|---|
| `bbc/` (root) | Main session — high-trust, principle-level edits | `CLAUDE.md` |
| `bbc/manager/` | Manager session — review queue, edit Manager rules | `../CLAUDE.md` then `CLAUDE.md` |
| `bbc/distribution/<leaf>/` | Distribution leaf — local rules + proposals only | `../../CLAUDE.md` → `../../manager/CLAUDE.md` → `CLAUDE.md` |

If you can't tell which layer you're in, stop and ask the human.

## Hard rules (apply at every layer)

1. **Precedence is Main > Manager > Distribution.** You cannot override an upper layer; you can only specialize or propose.
2. **Direct writes only inside your `owning_layer`.** Anything else goes through `scripts/propose.sh`.
3. **Memory files always have YAML frontmatter** with at minimum: `id`, `type`, `scope`, `layer`, `source`, `created`, `updated`, `owning_layer`, `status`. See `memory/_schema.md`.
4. **Don't invent vendor names.** Vendors are bound to roles (`db-provider`, `llm-provider`, …) in the tenant's `memory/ops/bindings.yaml`. Cite roles in prose; only adapter YAMLs and the bindings table name vendors.
5. **Never modify Main's `CLAUDE.md` from a non-Main session.** Even if asked.

## Files you'll touch most

- `memory/` — company knowledge by category.
- `queue/` — your proposal lands here as a single file. Use `scripts/propose.sh`.
- `distribution/<your-leaf>/local/` — leaf-only scratch / pre-promotion notes.

## Surfaces BBC exposes (for context, not for you to extend casually)

Aside from the markdown protocol, the dashboard (`apps/dashboard/`) hosts:

- **Studios** at `/studio/{marketing,engineering,founder}` — role-scoped LLM agents that read the brain and produce work (X posts, ADRs, board updates). Templates live under `apps/dashboard/src/lib/studio/{templates,eng-templates,founder-templates}/`. Adding a new template is a file in the right registry + side-effect import in `index.ts`.
- **MCP server** at `/api/mcp` — JSON-RPC over HTTP. Bearer-authenticated via `api_keys` table. 8 tools (`list/get/search_memories`, `list_decisions/vendors/proposals`, `get_proposal`, `submit_memory`). Code at `apps/dashboard/src/app/api/mcp/route.ts`.
- **REST shim** at `/api/v1/brain/*` — same auth, plain HTTP. For curl/scripts. Same tools.
- **Brain query module** at `apps/dashboard/src/lib/brain-api.ts` — shared between MCP + REST. The contract you'd extend if you add a new tool.

If you're asked to "make BBC do X for me as an agent," it's usually MCP + a new tool in `brain-api.ts` + a new entry in `route.ts`. Not a markdown protocol change.

## When in doubt

Pause and write a proposal rather than acting. Proposals are cheap; reverting a Main-layer mutation is expensive.
