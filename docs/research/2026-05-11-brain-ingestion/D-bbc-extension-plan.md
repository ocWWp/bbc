# D — BBC Extension Plan: Multi-Source Ingestion

**Date:** 2026-05-11
**Author:** Research agent (D-track)
**Scope:** Concrete extension to BBC's current ingestion (textarea → extractor → bulk insert) to accept URL, file drop, GitHub, Notion, Linear, Slack. SQL sketches included; no code written yet.
**Companion docs:** A (landscape), B (UX patterns), C (LLM extraction).

---

## 1. Current state inventory

The shipped Phase I pipeline is a single straight line — see `apps/dashboard/src/app/welcome/actions.ts:37-87` (`extractMemoryProposals`) and `:103-151` (`bulkAcceptProposals`).

```
[/welcome dump-step textarea]
        │ text (80-8000 chars)
        ▼
[extractMemoryProposals]   actions.ts:37
  ├─ requireActor + per-user in-mem rate limit (5/min)  :18-31
  ├─ Anthropic SDK · claude-sonnet-4-6 · tool_choice=extract_proposals   :60-67
  ├─ ProposalsResponseSchema validates    extractor/types.ts:33
  └─ returns { proposals: Proposal[] }
        │
        ▼
[review-step]  client-side edits per card
        │
        ▼
[bulkAcceptProposals]  actions.ts:103
  ├─ supertagSchemas[type].safeParse(fields)   :118
  ├─ build row { tenant_id, type, title, slug, status:'active',
  │              fields, body_blocks, path, content }   :122-135
  └─ supabase.from('memory_files').insert(rows)   :141
        │
        ▼
[memory_files table]  0005_memory_files.sql + 0017/0018/0019
```

**Hook points for new sources:**

1. **Pre-extract.** A new source must produce `text` (or structured RawContent) of the same shape `extractMemoryProposals` expects. The cleanest seam is a new server action `ingestSource(input)` that *both* (a) creates a row in a new `ingestion_sources` table and (b) returns text to feed into `extractMemoryProposals`. UI stays the same: dump-step gains a tab strip (Text / URL / File / Connect…).
2. **Post-extract.** `bulkAcceptProposals` already accepts `Proposal[]` and writes to `memory_files`. We extend it to also write `(source_id, item_id)` rows into a join table so every accepted item carries provenance. **Critical gap:** `memory_files` has no `source_id` column today (0005, 0017). The current path writes `path: memory/<type>/<slug>.md` with no origin trace beyond `proposalsResponseSchema`.

The frontmatter schema (`memory/_schema.md:13`) already has a `source` field — `human:<who> | leaf:<name> | manager | external:<url>` — but the DB-mode mirror (`memory_files.frontmatter` jsonb) is not populated on the welcome path. So provenance is doubly missing: no column, no frontmatter write.

---

## 2. Source model proposal

### 2.1 New tables

```sql
-- 0020_ingestion_sources.sql

create type public.ingestion_source_kind as enum (
  'text',        -- raw paste (default — covers current behavior)
  'url',         -- HTTP fetch (article, README, public Notion page)
  'file',        -- uploaded .md/.txt/.pdf/.docx blob
  'github',      -- OAuth-scoped repo or org
  'notion',      -- OAuth workspace
  'linear',      -- OAuth team
  'slack'        -- OAuth workspace
);

create type public.ingestion_status as enum (
  'pending',     -- row created, work not yet started
  'fetching',    -- adapter is pulling bytes
  'fetched',     -- raw content stored, awaiting parse
  'parsing',     -- normalizer running (HTML → text, PDF → text, etc.)
  'parsed',      -- text ready, awaiting extractor
  'extracting',  -- LLM in flight
  'extracted',   -- proposals ready in queue_items or transient store
  'integrated',  -- at least one memory_files row written
  'error'        -- terminal; see error_message
);

create table public.ingestion_sources (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenants(id) on delete cascade,
  kind            public.ingestion_source_kind not null,
  status          public.ingestion_status not null default 'pending',

  -- Idempotency: stable hash of (kind, normalized locator).
  -- url: sha256(canonical_url); file: sha256(bytes);
  -- github: sha256(repo_id+head_sha); notion: sha256(page_id+last_edited_time);
  -- linear: sha256(issue_id+updated_at); slack: sha256(channel_id+thread_ts);
  -- text: sha256(content) — rejects exact-duplicate paste.
  idempotency_key text not null,

  -- Per-source metadata. Loosely typed by `kind`. Examples:
  -- url:    { url, canonical_url, title?, content_type, status_code }
  -- file:   { filename, mime, byte_size, storage_path }
  -- github: { account_id, repo, head_sha, branch, paths? }
  -- notion: { account_id, page_id, last_edited_time }
  -- linear: { account_id, issue_id, project_id?, state }
  -- slack:  { account_id, channel_id, thread_ts, message_count }
  metadata        jsonb not null default '{}'::jsonb,

  -- Cached content (raw + normalized). Inlined for v1; move to object
  -- storage if rows get large (> ~256KB threshold).
  raw_content     text,                  -- as-fetched (HTML, JSON, MD…)
  parsed_text     text,                  -- LLM-ready plain text
  content_hash    text,                  -- sha256(parsed_text) — for re-ingestion diff

  -- Re-ingestion strategy. 'replace' supersedes prior memory items
  -- created from this source; 'append' adds new items only.
  reingest_mode   text not null default 'append'
                  check (reingest_mode in ('replace', 'append')),

  -- Lock-matrix integration. Owning layer chosen at ingest time by UX
  -- ('Save to org' vs 'Save to this repo' toggle). Defaults to manager.
  owning_layer    text not null default 'manager'
                  check (owning_layer in ('main', 'manager', 'distribution')),

  -- Provenance + audit.
  created_at      timestamptz not null default now(),
  fetched_at      timestamptz,
  extracted_at    timestamptz,
  integrated_at   timestamptz,
  created_by      uuid references auth.users(id) on delete set null,
  error_message   text,

  -- Idempotency is per-tenant: same URL across tenants is two rows.
  unique (tenant_id, idempotency_key)
);

create index ingestion_sources_tenant_status_idx
  on public.ingestion_sources (tenant_id, status, created_at desc);
create index ingestion_sources_tenant_kind_idx
  on public.ingestion_sources (tenant_id, kind);

alter table public.ingestion_sources enable row level security;

create policy ingestion_sources_member_read on public.ingestion_sources
  for select using (public.is_member_of(tenant_id));

create policy ingestion_sources_member_insert on public.ingestion_sources
  for insert with check (public.is_member_of(tenant_id));

-- Writes after insert (status flips, parsed_text, etc.) happen via
-- service-role inside server actions, not direct user UPDATEs.
```

### 2.2 Join table — many-to-many between memory items and sources

A single memory_file may originate from multiple sources (e.g., a "Voice" item refined from both a textarea dump and a Notion brand-guide page). And one source can produce many items.

```sql
-- 0021_memory_file_sources.sql

create table public.memory_file_sources (
  tenant_id    uuid not null references public.tenants(id) on delete cascade,
  memory_id    uuid not null references public.memory_files(id) on delete cascade,
  source_id    uuid not null references public.ingestion_sources(id) on delete cascade,
  -- The exact slice/anchor inside the source that produced this item.
  -- url:    { selector?: string, char_range?: [int,int] }
  -- github: { path: string, line_range?: [int,int], commit_sha }
  -- notion: { block_id?: string }
  -- linear: { comment_id?: string }
  -- slack:  { message_ts }
  locator      jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now(),
  primary key (tenant_id, memory_id, source_id)
);
alter table public.memory_file_sources enable row level security;
create policy mfs_member_read on public.memory_file_sources
  for select using (public.is_member_of(tenant_id));
```

This preserves the principle-1 invariant ("memory is the contract"): the contract row is still `memory_files`; provenance is a join. Sources can be deleted later without orphaning memory.

### 2.3 OAuth connection table (separate from sources)

```sql
-- 0022_external_accounts.sql

create type public.external_provider as enum
  ('github', 'notion', 'linear', 'slack');

create table public.external_accounts (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenants(id) on delete cascade,
  provider        public.external_provider not null,
  external_id     text not null,           -- e.g. github user/org id
  display_name    text not null,
  scopes          text[] not null default '{}',
  -- Token stored encrypted; field omitted from RLS-selectable view.
  access_token_enc text not null,
  refresh_token_enc text,
  expires_at      timestamptz,
  created_at      timestamptz not null default now(),
  created_by      uuid references auth.users(id) on delete set null,
  unique (tenant_id, provider, external_id)
);
alter table public.external_accounts enable row level security;
-- Read policy returns a SAFE view (no tokens); the actual table is
-- service-role only.
```

---

## 3. Adapter interface

A single TypeScript surface every new source kind implements. Lives in `apps/dashboard/src/lib/ingestion/adapters/`.

```ts
// apps/dashboard/src/lib/ingestion/adapter.ts

export type SourceKind =
  | 'text' | 'url' | 'file' | 'github' | 'notion' | 'linear' | 'slack';

export interface RawContent {
  raw: string;                         // bytes-as-text (HTML, JSON, MD…)
  contentType: string;                 // 'text/html', 'application/json', …
  charset?: string;
  fetchedAt: string;                   // ISO
  upstreamMeta: Record<string, unknown>;
}

export interface NormalizedText {
  text: string;                        // LLM-ready
  title?: string;
  language?: string;
  // Per-item locator pre-computed for memory_file_sources rows.
  chunks?: Array<{ text: string; locator: Record<string, unknown> }>;
}

export interface AdapterContext {
  tenantId: string;
  userId: string;
  account?: { id: string; accessToken: string };   // populated for OAuth kinds
  log: (event: string, payload?: Record<string, unknown>) => void;
}

export interface SourceAdapter<TConfig> {
  kind: SourceKind;

  /** Compute the idempotency key from inputs only — no network. */
  idempotencyKey(config: TConfig): string;

  /** Pull bytes from upstream. Streams raw_content. */
  fetch(config: TConfig, ctx: AdapterContext): Promise<RawContent>;

  /** HTML/PDF/JSON → plain text. Pure CPU; no network. */
  parse(raw: RawContent, ctx: AdapterContext): Promise<NormalizedText>;

  /** Optional: re-fetch heuristic. Returns true if upstream changed
   *  since last successful integration. Used by manual "refresh" buttons. */
  hasChanged?(config: TConfig, lastKnownMeta: Record<string, unknown>,
              ctx: AdapterContext): Promise<boolean>;
}

export const adapters: Record<SourceKind, SourceAdapter<unknown>> = {
  text:   textAdapter,
  url:    urlAdapter,
  file:   fileAdapter,
  github: githubAdapter,
  notion: notionAdapter,
  linear: linearAdapter,
  slack:  slackAdapter,
};
```

The orchestrator (`apps/dashboard/src/lib/ingestion/run.ts`) drives the state machine: `pending → fetching → fetched → parsing → parsed → extracting → extracted → integrated`. Each transition is one server-action call; no daemons (principle 6).

---

## 4. Lock-matrix interaction

For each new source kind, two questions: who owns the resulting memory rows, and where does the proposal queue sit?

| Source kind | Default `owning_layer` | Queue path | Notes |
|---|---|---|---|
| text | manager | Direct accept (current behavior) | unchanged from Phase I; a tenant pasting their own brain doesn't need a queue handshake |
| url | manager | Direct accept | one-shot read; equivalent to a paste |
| file | manager | Direct accept | per-tenant upload; same trust level as paste |
| github (repo-scoped) | distribution `leaf:<repo>` | **queue_items first**, then accept | a README change is a leaf-layer fact; promotion to manager goes via the existing propose flow |
| github (org-scoped) | manager | queue_items | org-wide profile / CODE_OF_CONDUCT — manager fact |
| notion | manager | queue_items | Notion is usually company-wide knowledge |
| linear | manager | queue_items | issues/epics → decisions and product items, manager-tier |
| slack | manager | queue_items | thread → decision; always proposed, never auto-accept |

**Principle 6 compliance.** The orchestrator never auto-accepts. For text/url/file, extraction is user-initiated (button press in `/welcome` or `/memory/import`); proposals appear in the review UI like today; user clicks "Accept" → `bulkAcceptProposals`. For github/notion/linear/slack, same model — user clicks "Pull from <source>"; orchestrator runs synchronously; proposals land in `queue_items` with `actor: user:<id> via source:<source_id>`. Webhooks (e.g., Linear issue.updated) are out of scope for v1 — ADR-0004 allows them when scoped + identified, but they cross the "user explicitly invoked" boundary. Defer to a future ADR.

The lock-matrix lines for these new tables (to be added to `CLAUDE.md`):

```
| `public.ingestion_sources` rows | service-role inside server actions invoked by the tenant member who owns the row | RLS allows member INSERT; UPDATE/DELETE service-role only |
| `public.external_accounts` rows | server actions during OAuth flow; refresh-token rotation is a deterministic effect of a user-initiated API call | n/a |
| `public.memory_file_sources` | written automatically inside `bulkAcceptProposals` / `accept_proposal()` | n/a |
```

---

## 5. Supertag schema gaps

The 7 shipped supertags (`types/index.ts:74-94`) — voice / decision / glossary / vendor / product / team / skill — cover most ingest patterns but leave clear holes for the new sources.

**Coverage assessment per source kind:**

- **URL (article / docs page)** — usually `decision`, `product`, or `glossary`. Covered.
- **File (.md README, .pdf brand guide)** — `voice`, `product`, sometimes `decision`. Covered.
- **GitHub README** — `product` + `vendor` + sometimes `decision` (ADRs in `/docs/adr/`). Covered.
- **GitHub issue / PR** — these are units of work, not memory. Gap below.
- **Notion page** — usually `product`, `voice`, `decision`. Covered.
- **Linear epic / issue** — units of work spanning multiple items. Gap below.
- **Slack thread** — usually `decision` (mid-discussion → outcome). Covered, but lossy because the thread carries multiple voices the schema flattens.

**Three proposed new supertags (worth a Phase H.2 ADR before they ship):**

1. **`initiative`** — a multi-week effort with a goal, status, and owner. Maps cleanly to Linear epics and GitHub milestones. Fields: `{ goal, status: planned|in_progress|shipped|abandoned, owner_team_id?, start_date?, target_date?, parent_initiative_id? }`. Without this, Linear ingest produces dozens of decisions that are really sub-tasks of one initiative.

2. **`source_artifact`** — a memory-of-a-memory: "the brand guide PDF says X" — captures provenance distinct from the extracted facts. Fields: `{ source_id, source_kind, url?, snapshot_at, summary }`. Provides a place to attach things that are not yet decomposed into typed items. Acts as a stub when the extractor can't confidently classify but the user wants the source remembered.

3. **`conversation`** — for Slack threads specifically: `{ channel, participants[], started_at, summary, outcome? }`. Resolves the "many voices flattened to one" problem; lets agents query "what did we discuss about onboarding last month?" without losing the multi-speaker structure.

Recommendation: ship Phase I.20 with the existing 7 supertags + a generic `source_artifact` (smallest possible addition) and defer `initiative` + `conversation` to Phase K when Linear/Slack land.

---

## 6. Phase J prerequisite check

The user's design doc §5 step-3 already specified "Upload (Notion/Google Docs URLs + markdown drag)" as one of three onboarding paths (line 117). What shipped in Phase I is only the textarea variant. So this is **revealed scope, not new scope** — the design always called for it; Phase I undershipped it.

**Sequencing recommendation:**

- **Phase I.20 (pre-launch, 2–3 day lift):** URL paste + .md / .txt file drop, both going through the existing `extractMemoryProposals` path. Adds `ingestion_sources` + `memory_file_sources` tables, two adapters (`urlAdapter`, `fileAdapter`), one new tab-strip in `dump-step.tsx`. **Ship before public beta.** The design doc already promised this.
- **Phase K (post-launch, ~1.5 weeks):** GitHub (read-only OAuth), Notion (OAuth), Linear (OAuth). All three queue-first. Adds `external_accounts` table + OAuth callback routes + three adapters. Bundles well with the existing Phase K scope (Marketplace + MCP writes + Stripe), since OAuth UX shares the marketplace's bind/unbind pattern.
- **Phase K+ (after Slack-tier of $19+/mo plan exists):** Slack adapter. Auth flow is the heaviest of the four (manifest, per-channel scopes); not worth the lift until the paid tier justifies it.
- **Phase J (Marketing Studio) does not depend on multi-source.** Studio reads from `memory_files`; it doesn't care how rows got there. There's no blocker. The two phases can ship in either order. Argument for I.20 first: a launch demo that says "paste your README" is more visceral than "paste a paragraph."

**MVP punch list for Phase I.20 below in the executive summary.**

---

## 7. Migration risk

**Will source-tracking changes require a backfill?**

Yes, but trivially. After 0020/0021 land, run:

```sql
-- 0023_backfill_text_sources.sql
-- Every memory_files row that exists today came from a textarea dump
-- (Phase I) or hand-seeded examples (Phase H). Mark them all as 'text'
-- sources so the join table has rows.

insert into public.ingestion_sources
  (tenant_id, kind, status, idempotency_key, metadata, created_at, owning_layer)
select
  m.tenant_id,
  'text'::ingestion_source_kind,
  'integrated'::ingestion_status,
  'backfill:' || m.id::text,           -- unique per row; no real key
  jsonb_build_object('backfilled', true, 'source_note',
    'pre-Phase-I.20; original input not retained'),
  m.created_at,
  'manager'
from public.memory_files m;

insert into public.memory_file_sources (tenant_id, memory_id, source_id, locator)
select m.tenant_id, m.id, s.id, '{}'::jsonb
from public.memory_files m
join public.ingestion_sources s
  on s.tenant_id = m.tenant_id
 and s.idempotency_key = 'backfill:' || m.id::text;
```

**Lift:** ~30 min to write + verify. **Risk:** zero — additive only, no data lost. The pre-Phase-I.20 textareas aren't retained (they were never stored — only the extracted proposals were), so the backfill is honest about that with `source_note`.

**Schema-drift risk for file-mode** (per ADR-0004): file-mode users get the new `ingestion_sources` concept as frontmatter on existing memory files only — no separate `.md` source files. Add an optional `source:` block to frontmatter (already half-specified in `_schema.md:13`) and document the mapping. File-mode users running `scripts/index-memory.sh` won't need migrations.

---

## Closing note

The shipped pipeline is well-shaped for this extension: `Proposal[]` is already the universal currency between input and storage. The only missing pieces are (a) a place to record where the proposals came from and (b) a way to keep multiple inputs feeding one extractor without rewriting the welcome flow. Both are additive — no breaking changes to the 7 supertags, no breaking changes to `bulkAcceptProposals`, no daemons introduced. Principle 1 and principle 6 hold.
