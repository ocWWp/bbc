---
id: mem_2026-05-08_tech-deployment-modes
type: fact
scope: org
layer: main
source: human:zeth
created: 2026-05-08T00:00:00Z
updated: 2026-05-08T00:00:00Z
owning_layer: main
tags: [deployment, multi-tenant, saas, self-host, storage, architecture]
status: accepted
---

# Deployment Modes

Companion to ADR-0004. Concrete mapping of how BBC's logical contract is materialized in each of the two deployment modes.

## Two modes

| | File-mode | DB-mode |
|---|---|---|
| **Audience** | Self-host (one team/org per host) | Managed SaaS (many tenants per host) |
| **Storage** | Markdown files on local FS | Postgres tables, RLS-gated by `tenant_id` |
| **Mutation transport** | `bash propose.sh` / `accept.sh` / `reject.sh` | Typed SQL transactions (`acceptProposal()`, etc.) |
| **Tenant model** | Implicit single tenant (the host) | Explicit `tenants` table; one tenant per signing-up team |
| **Auth** | Filesystem permissions + git | Supabase Auth + RLS |
| **Audit** | Filesystem move to `_accepted/` / `_rejected/` | Append-only `operations_log` table + UPDATE/DELETE-blocking trigger |
| **Distribution** | `git clone` + `docker compose up` | `bbc.<tld>` web app + per-tenant API keys for MCP |

Both modes implement the same logical contract (memory schema, queue protocol, lock matrix, vendor-name rule). Only the **binding** differs.

## Mapping: files ↔ tables

| File-mode path | DB-mode table | Notes |
|---|---|---|
| `memory/**/*.md` | `memory_files (path text, content text, frontmatter jsonb, tenant_id uuid)` | One row per file. `path` is the relative path from `memory/`. Frontmatter parsed into jsonb for queryable scope/layer/status filters. |
| `queue/*.md` (pending) | `queue_items (proposal_id text, status enum, body text, frontmatter jsonb, tenant_id uuid)` | Status: `pending`, `accepted`, `rejected`. Append-only — moves are status flips, not deletes. |
| `queue/_accepted/*.md` | `queue_items` rows with `status='accepted'` + `proposals_accepted (proposal_id, accepted_at, accepted_by, hash, tenant_id)` | The audit table is the immutable record. The queue_items row carries the body; the audit row carries the chain-of-custody. |
| `queue/_rejected/*.md` | `queue_items` rows with `status='rejected'` + `proposals_rejected (proposal_id, rejected_at, rejected_by, reason, tenant_id)` | Symmetric to accepted. |
| `_log/operations.jsonl` | `operations_log (id bigserial, ts timestamptz, actor text, action text, target text, state_hash text, lkg_at_emit bigint, tenant_id uuid)` | Append-only. Trigger blocks UPDATE and DELETE. `lkg_at_emit` preserves the F3 last-known-good semantics. |
| `_log/lkg.txt` | A single row in `operations_metadata (tenant_id uuid pk, lkg_seq bigint)` | Per-tenant. Updated by the same transaction that appends to `operations_log`. |
| `bindings.yaml` | `bindings (role text, provider_id text, provisional bool, bound_at timestamptz, notes text, tenant_id uuid)` | Per-tenant role→provider table. |
| `manager/rules/*.md` | `memory_files` rows with frontmatter `layer: manager` | Same table as memory; the `layer` field disambiguates. |
| `distribution/<leaf>/CLAUDE.md` and friends | `memory_files` rows with `layer: distribution` and `scope: leaf:<name>` | Same. |

The "two modes are bindings of one schema" property comes from this mapping being lossless in both directions: a file-mode BBC can be **exported** to a DB by walking the filesystem and inserting rows; a DB-mode BBC can be **exported** to files by serializing rows back to markdown. This is the migration story for users moving between modes.

## Storage interface (dashboard codebase)

The dashboard reads and writes BBC state via three typed interfaces, defined in `src/lib/store/`:

```ts
// MemoryStore — read-only for most paths, writes go through acceptProposal()
interface MemoryStore {
  read(path: string): Promise<MemoryFile | null>;
  list(opts?: { layer?: Layer; scope?: Scope; status?: Status }): Promise<MemoryFile[]>;
  search(query: string): Promise<MemoryFile[]>;
}

// QueueStore — reads pending / accepted / rejected; writes via accept/reject
interface QueueStore {
  listPending(): Promise<QueueItem[]>;
  listAccepted(opts?: PaginationOpts): Promise<QueueItem[]>;
  listRejected(opts?: PaginationOpts): Promise<QueueItem[]>;
  read(proposalId: string): Promise<QueueItem | null>;
  acceptProposal(proposalId: string, actor: string): Promise<void>;
  rejectProposal(proposalId: string, actor: string, reason: string): Promise<void>;
  proposeChange(input: ProposeInput): Promise<{ proposalId: string }>;
}

// LogStore — append-only, no UPDATE/DELETE methods exist by design
interface LogStore {
  append(entry: LogEntry): Promise<void>;
  read(opts: { limit: number; cursor?: string }): Promise<LogEntry[]>;
  lkg(): Promise<{ seq: number; ts: string }>;
}
```

Two implementations live alongside:
- `src/lib/store/local/` — file-mode. Backed by `fs/promises` + bash exec for mutations (delegates to `propose.sh`/`accept.sh`/`reject.sh`).
- `src/lib/store/supabase/` — DB-mode. Backed by `@supabase/ssr` server client, all operations as typed SQL transactions.

A factory `getStore(): { memory; queue; log }` reads `BBC_MODE` from env (`file` or `db`) and returns the right impl. **No application code touches `fs.readFile` or `child_process.exec` directly after Phase 2.**

## Invariant translation

How each Main principle materializes in each mode:

### 1. Memory is the contract

- **File-mode**: every `memory/**/*.md` file conforms to `memory/_schema.md`. The filesystem layout is the materialization.
- **DB-mode**: every `memory_files` row conforms to a derived JSON schema (the `frontmatter jsonb` column has a CHECK constraint via a `validate_memory_frontmatter()` function). The schema doc remains authoritative; DB-mode just enforces it earlier.

### 2. Direct writes are scoped to your `owning_layer`

- **File-mode**: enforced by convention + `propose.sh` refusing cross-layer writes.
- **DB-mode**: enforced by RLS policy. `update memory_files where owning_layer = 'main'` only succeeds if the calling role's claim resolves to a Main-class identity. Distribution roles get UPDATE only on rows where `owning_layer = 'distribution' and scope = 'leaf:<their-leaf>'`.

### 3. Proposals are append-only; resolutions move (not delete)

- **File-mode**: filesystem moves files between `queue/`, `queue/_accepted/`, `queue/_rejected/`. Files are never deleted.
- **DB-mode**: `queue_items` rows have a status enum that flips. A trigger blocks DELETE on `queue_items`. Accepted/rejected rows additionally generate companion rows in `proposals_accepted`/`proposals_rejected` tables that have UPDATE/DELETE blocked entirely.

### 4. Vendor names are not architecture

- **Both modes**: identical. Roles in `memory/ops/vendors.md` (file) or `vendors` table view (DB). Bindings in `bindings.yaml` (file) or `bindings` table (DB). Adapter rows reference the role, not the vendor name.

### 5. Voice is single-source

- **Both modes**: `memory/design/voice-tone.md` (file) / `memory_files` row at path `design/voice-tone.md` (DB). Cross-repo consumers (8azi-* applications) read it from BBC's API or filesystem.

### 6. No silent autonomy

- **File-mode**: enforced by the absence of daemons. No background processes auto-accept queue items.
- **DB-mode**: principle 6 expands to a per-construct ruling table — see ADR-0004 §Consequences/Governance principle 6. Summary: `accept_proposal()` and `reject_proposal()` are the only paths that mutate `memory_files` / `queue_items` / `bindings`, and they require an authenticated identity that is **either** a human (Supabase Auth user) **or** a named agent (MCP API key with an `agent_id`). The two are not equivalent — an agent acting on behalf of a user is OK; an agent acting on its own deliberation is not. `pg_cron` is forbidden for protocol-state mutations and allowed for housekeeping. Inbound webhooks must carry a named-identity actor string (e.g., `webhook:stripe:<event_id>`) and a constrained scope. Auto-accept by any rule or trained model is forbidden.

## Mode selection at runtime

The dashboard reads `BBC_MODE` from environment:

- `BBC_MODE=file` — uses `LocalStore`. Requires `BBC_REPO` to point at a BBC checkout. Single tenant. No auth.
- `BBC_MODE=db` — uses `SupabaseStore`. Requires `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`. Multi-tenant. Auth via Supabase Auth (already wired in this session).

The MCP server (`bbc/mcp-server/`) reads the same env var and uses the same store implementations — agent reads/writes are isomorphic to dashboard reads/writes.

## Migration paths

- **File → DB** (a self-hoster signs up for hosted): a `bbc-cli export` command serializes a file-mode BBC into a portable JSON/SQL dump. Sign-up flow ingests the dump into a fresh tenant.
- **DB → File** (a hosted user wants to self-host): the dashboard's "Export" page produces a tarball of `memory/`, `queue/`, `_log/`, `bindings.yaml` reconstructed from the tenant's rows. User unzips, runs `docker compose up` against the local copy.

Both directions must be lossless for `accepted` audit data; lossy is acceptable for transient states like `pending` queue items.

## Out of scope for this doc

- Schema DDL — lives in `apps/dashboard/supabase/migrations/0003+...sql` (Phase 1–2 of productization). The path reflects the monorepo layout decided in `tech/repo-structure.md`; the actual move from `8azi-dashboard/` happens as Phase 1's first task.
- API surface for the MCP server — separate doc, Phase 6.
- Pricing / billing model — `memory/product/` (Phase 8).
