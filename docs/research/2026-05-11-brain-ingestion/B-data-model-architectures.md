---
title: Data Model Architectures of Leading AI Memory Systems
date: 2026-05-11
author: research agent
status: draft
audience: BBC architecture (Main layer)
---

# B. Data Model Architectures — what to copy, what to skip

## Executive summary

BBC's current schema (typed supertags + free body + `memory_relations`) is structurally closer to **Glean's enterprise knowledge graph** and **LangMem's "profiles"** than to **Mem0** or **Zep**, both of which lean on free-form fact extraction with vector + graph hybrid storage. Once BBC opens the firehose of URL / file / GitHub / Notion / Linear / Slack ingestion, typed-only nodes will choke: you cannot pre-define a supertag for every fact in a Slack thread. The dominant pattern across **Mem0**, **Zep/Graphiti**, **Cognee**, and **Letta** is a **two-tier model**: a raw / episodic layer that captures every ingested chunk verbatim with provenance, and a derived / semantic layer that holds extracted, typed, deduplicated facts. BBC should adopt this split, add a first-class `sources` table, keep typed supertags as the canonical layer, and add embeddings on the derived layer only — not on raw chunks at BBC's scale.

---

## 1. Comparative survey

### Mem0 — extract-then-resolve, hybrid vector + graph
- **Storage model:** dual-store. A vector store of natural-language "memories" (one fact per row, embedded) + an optional property graph (Mem0g) that stores `(entity, relation, entity)` triples. Recent releases added BM25 alongside vectors.
- **Granularity:** **single fact** ("Alice prefers TypeScript"), not document chunk. An LLM extracts facts from messages during the *extraction phase*.
- **Relations:** explicit `entity -[relation]-> entity` edges in the graph store (Neo4j / FalkorDB / Neptune Analytics).
- **Provenance:** memories carry `created_at`, `updated_at`, `user_id`, `agent_id`, `run_id`. Provenance is "which conversation produced this fact", not "which doc / commit / URL".
- **Updates / supersession:** the *update phase* runs an LLM tool-call over similar existing memories and emits one of `ADD / UPDATE / DELETE / NOOP`. Mem0g marks edges *invalid* rather than physically deleting them — temporal reasoning intact.
- **Retrieval:** hybrid — semantic vector + BM25 + entity match, then graph hop for multi-hop questions.
- Source: [Mem0 paper (arXiv 2504.19413)](https://arxiv.org/abs/2504.19413), [Mem0 graph memory docs](https://docs.mem0.ai/platform/features/graph-memory), [Mem0 Add Memory docs](https://docs.mem0.ai/core-concepts/memory-operations/add).

### Zep / Graphiti — temporal knowledge graph as the spine
- **Storage model:** three nested subgraphs in Neo4j-compatible storage: **Episode Subgraph** (raw events, verbatim, timestamped), **Semantic Entity Subgraph** (extracted entities + facts, each embedded in 1024-D), **Community Subgraph** (clusters).
- **Granularity:** every level — raw episode preserved alongside the extracted entities. The episode is *ground truth*.
- **Relations:** typed edges between entities; edges themselves carry attributes.
- **Provenance:** every entity and edge points back to the episode(s) that produced it. Full lineage from derived fact to source event.
- **Updates / supersession:** **bi-temporal** — every edge carries an `event_time T` ("when this fact was true in the world") and `ingestion_time T'` ("when Zep learned it"). New contradictory facts invalidate (not delete) old edges by closing their `valid_to` interval.
- **Retrieval:** hybrid semantic + BM25 + graph traversal, p95 ~300ms.
- Source: [Zep paper (arXiv 2501.13956)](https://arxiv.org/abs/2501.13956), [Graphiti GitHub](https://github.com/getzep/graphiti).

### Cognee — ontology-grounded knowledge graph
- **Storage model:** graph store (Memgraph / Neo4j) + vector store, behind a six-stage `cognify` pipeline: classify → permission-check → chunk → extract entities/relations → summarize → embed-and-commit.
- **Granularity:** chunks → triples. Chunks survive; triples are the queryable layer.
- **Entity resolution:** the standout feature. Cognee accepts an OWL/RDFS ontology and **canonicalizes** extracted entities to ontology URIs ("automobile maker" + "car manufacturer" → one canonical node).
- **Provenance:** preserved per triple via the originating chunk.
- **Updates:** a `memify` step prunes stale nodes and strengthens frequent connections.
- Source: [Cognee docs — cognify](https://docs.cognee.ai/core-concepts/main-operations/legacy-operations/cognify), [Cognee — ontology grounding](https://www.cognee.ai/blog/deep-dives/grounding-ai-memory).

### Letta (MemGPT) — tiered, agent-controlled
- **Storage model:** three tiers — **in-context memory** (small, labelled k:v blocks like `persona`, `human`), **recall memory** (all conversation history, searchable by date/text), **archival memory** (vector DB of long-running facts and external "Data Sources").
- **Granularity:** archival = arbitrary text passages with embeddings; recall = whole messages.
- **Relations:** none, structurally. Relations are implicit in the prose.
- **Provenance:** by message id + timestamp in recall; by passage id in archival.
- **Updates:** the *agent itself* decides what to evict/insert via tool calls — no automatic conflict resolution.
- Source: [Letta MemGPT docs](https://docs.letta.com/concepts/memgpt/), [Letta memory management](https://docs.letta.com/advanced/memory-management/).

### LangMem — type-by-purpose (Semantic / Episodic / Procedural)
- **Semantic memory:** two flavors — **collections** (unbounded facts, vector-searched) and **profiles** (a single document conforming to a strict schema). The profile flavor is essentially what BBC's typed supertags already are.
- **Episodic memory:** few-shot examples capturing *how a task was done*.
- **Procedural memory:** instructions stored as a continuously-rewritten system prompt.
- **Storage:** LangGraph BaseStore (Postgres/Redis), schema-per-namespace.
- Source: [LangMem conceptual guide](https://langchain-ai.github.io/langmem/concepts/conceptual_guide/), [LangMem SDK launch](https://blog.langchain.com/langmem-sdk-launch/).

### Notion — block as universal atom
- Every page, paragraph, image, database row is a **block** with UUID, type, properties, parent pointer, ordered children. Parent pointers give permission inheritance for free; ordered children give layout. Stored in Postgres, sharded by workspace.
- Why this matters for BBC: **one polymorphic table with a `type` discriminator** scales further than seven type-specific tables. BBC already does this with `memory_files` — keep it.
- Source: [Notion blog — block-based data model](https://www.notion.com/blog/data-model-behind-notion).

### Glean — multi-pillar enterprise graph
- Three pillars: **content** (docs, messages, tickets), **identity** (users, teams, roles), **activity** (interactions, history). Entities are ML-inferred from connector data. Hybrid retrieval: graph traversal + vector + classical.
- Provenance is the *connector* and the *source doc id*.
- Source: [Glean — Enterprise Graph](https://www.glean.com/product/enterprise-graph), [Glean — knowledge graph guide](https://www.glean.com/resources/guides/glean-knowledge-graph).

### Microsoft Graph + Copilot — semantic index over Graph
- The Microsoft Graph (entities: users, files, messages, meetings, etc.) plus a tenant-wide **semantic index** (vectors over the same content). The Graph is the entity model; the semantic index is a retrieval layer on top, *not* a separate ontology.
- Source: [MS Learn — semantic index for Copilot](https://learn.microsoft.com/en-us/microsoftsearch/semantic-index-for-copilot).

### ChatGPT memory (April 2025)
- Two stores: **saved memories** (short LLM-generated bullets) and **chat history**. As of April 2025, "User Knowledge Memories" are dense AI-generated summaries periodically synthesized from chats — no vector DB, no graph, just a curated list the model reads at prompt time. Cheap, opinionated, low-precision.
- Source: [OpenAI — Memory and new controls](https://openai.com/index/memory-and-new-controls-for-chatgpt/), [LLMRefs — reverse engineering ChatGPT memory](https://llmrefs.com/blog/reverse-engineering-chatgpt-memory).

---

## 2. Patterns that recur

| Pattern | Adopted by | BBC has it? |
|---|---|---|
| Two-tier: raw/episodic + derived/semantic | Zep, Cognee, Mem0 (extraction phase), Letta | **No** — supertags only |
| Provenance as first-class FK back to source | Zep (mandatory), Glean, Cognee | Partial — `source_url` field exists per supertag |
| Bi-temporal validity (event_time vs ingest_time) | Zep | **No** |
| Conflict resolution via LLM ADD/UPDATE/DELETE | Mem0 | **No** — proposal queue is human-gated |
| Polymorphic atom + type discriminator | Notion, BBC's `memory_files` | **Yes** |
| Typed schema-per-purpose (profile) | LangMem, BBC supertags | **Yes** |
| Ontology canonicalization | Cognee | **No** |
| Hybrid retrieval (vector + BM25 + graph) | Mem0, Zep, Glean, MS Copilot | **No** — typed query only |

---

## 3. Recommended schema evolution for BBC

### 3.1 Keep supertags primary; add a `raw_chunk` tier *below* them

The single biggest gap: BBC has nowhere to put a Slack message, a GitHub commit body, or a Linear comment that *might* contain a fact but hasn't been promoted yet. Forcing every ingested artifact through the supertag taxonomy at ingest time is the wrong design — it will either (a) reject useful inputs because no supertag fits, or (b) produce wildly miscategorized `glossary` rows.

The Zep/Cognee/Mem0 consensus is correct here: **store the raw episode verbatim, then derive typed nodes from it asynchronously**. BBC's analog:

```
+-------------------+        +--------------------+        +-------------------+
|    sources        |<-------|     raw_chunks     |<-------|   memory_files    |
| (URL/file/repo/   |        | (verbatim ingested |        |  (typed supertags |
|  Notion/Linear/   |        |  text, embeddings) |        |   — unchanged)    |
|  Slack/...)       |        +--------------------+        +-------------------+
+-------------------+                  |                            |
                                       |                            |
                                       v                            v
                            +-----------------------+    +----------------------+
                            |  proposals (queue)    |--->| memory_relations     |
                            |  (extracted typed     |    | (cross-references)   |
                            |   candidates, awaits  |    +----------------------+
                            |   human Accept)       |
                            +-----------------------+
```

Raw chunks never auto-promote. The extractor reads them and **files a proposal** through the existing queue — no change to the lock matrix, no autonomy violation against CLAUDE.md principle #6.

### 3.2 Concrete table additions

```sql
-- 1. First-class source records (every ingested origin)
create table sources (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null,
  kind            text not null,        -- 'url'|'file'|'github'|'notion'|'linear'|'slack'|'manual'
  uri             text,                 -- canonical locator (URL, repo#commit, file sha, notion block id)
  title           text,
  fetched_at      timestamptz not null default now(),
  content_hash    text,                 -- for dedup across re-ingests
  metadata        jsonb default '{}'::jsonb,
  unique (tenant_id, kind, uri, content_hash)
);
alter table sources enable row level security;

-- 2. Raw, untyped, embedded chunks
create table raw_chunks (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null,
  source_id       uuid not null references sources(id) on delete cascade,
  chunk_index     int  not null,        -- order within the source
  text            text not null,
  embedding       vector(1536),         -- pgvector; nullable until embedded
  span_start      int,                  -- byte offsets back into source
  span_end        int,
  extracted_at    timestamptz,          -- null = not yet processed
  metadata        jsonb default '{}'::jsonb
);
alter table raw_chunks enable row level security;
create index on raw_chunks using hnsw (embedding vector_cosine_ops);

-- 3. Many-to-many: a memory_file (typed node) cites N sources
create table memory_file_sources (
  memory_file_id  uuid not null references memory_files(id) on delete cascade,
  source_id       uuid not null references sources(id) on delete cascade,
  raw_chunk_id    uuid references raw_chunks(id) on delete set null,
  confidence      real,                 -- 0..1 extractor confidence
  added_at        timestamptz not null default now(),
  primary key (memory_file_id, source_id, raw_chunk_id)
);
alter table memory_file_sources enable row level security;

-- 4. Bi-temporal validity on memory_files (additive)
alter table memory_files
  add column valid_from   timestamptz,   -- when fact became true IRL
  add column valid_to     timestamptz,   -- null = currently valid
  add column superseded_by uuid references memory_files(id);
```

RLS is straightforward: every new table gets the same `tenant_id` policy template you already use. The `memory_file_sources` policy can derive `tenant_id` via the parent `memory_file`.

### 3.3 New supertag types to add

- `note` — free-form unstructured prose that *should* be remembered but doesn't fit existing schemas. The escape valve. Without it, the extractor will mis-categorize.
- `event` — a timestamped thing that happened (deploy, incident, contract signed, hire). Useful as an anchor for many other relations and matches Zep's "episode" concept at the typed layer.
- `person` — distinct from `team`. Slack/GitHub ingestion will produce hundreds of these; today `team` is the only place to put them and that's wrong.
- `topic` — a tag-like canonical concept. Lets you cluster across types ("everything about onboarding") without overloading `glossary`.

### 3.4 Provenance: 1:many, not a single field

Today the `source_url` field on each supertag is **insufficient**. A `decision` ADR has its own URL *and* may cite a Slack discussion *and* a GitHub PR — three sources, one fact. Replace the single field with `memory_file_sources` (above). Keep the existing `source_url` column for one release as a backfill bridge, then drop it.

### 3.5 Do you need embeddings on typed nodes? Yes — but only on supertags, not on raw_chunks

At 1–10 person teams, typed lookups (`vendors where role='llm-provider'`) are fine for known questions. They fail for *agent* questions like "what did we decide about pricing last quarter?" — that's semantic, not relational. Add `embedding vector(1536)` to `memory_files` (single column, hybrid query `WHERE type='decision' AND embedding <-> $q < 0.3`). Skip embedding raw_chunks until ingestion volume justifies it (>10k chunks/tenant). Cheap to add later because the schema is already in place.

### 3.6 Conflict resolution: do NOT auto-merge

Mem0's LLM-driven `ADD/UPDATE/DELETE/NOOP` is elegant but violates BBC's principle #6 (no silent autonomy). When the same fact arrives from two sources (`team.email` differs between Slack and a GitHub commit), the extractor should:

1. Detect the conflict by typed-key match (`type='team' AND name='X'`).
2. File **one proposal** that lists both candidate values and both `source_id`s in its frontmatter.
3. Surface it in `/bbc:dashboard` as `conflicts: 1`.
4. Human picks the winner in `/bbc:accept`. Loser is recorded in `memory_file_sources` with `confidence=0` for audit, not discarded.

This costs no autonomy and gives you Zep-style provenance lineage as a side effect.

### 3.7 What to skip

- **Ontology canonicalization (Cognee)** — overkill at 1–10 ppl. Revisit at 100+.
- **Graph DB (Neo4j / FalkorDB)** — `memory_relations` in Postgres handles BBC's hop count (2–3) fine. Recursive CTE is cheaper than a second datastore.
- **Letta-style agent-managed memory** — orthogonal to BBC's gated model; the agent owns *retrieval*, not *writes*.
- **ChatGPT-style summary bullets** — too lossy; you'd lose typed queries.

---

## 4. Migration sketch (non-binding)

1. Add `sources` and `raw_chunks` tables + RLS policies. Existing data: untouched.
2. Add `memory_file_sources` join; backfill from `source_url`.
3. Add `embedding`, `valid_from/to`, `superseded_by` columns to `memory_files`. All nullable.
4. Add `note`, `event`, `person`, `topic` supertag schemas (Zod) — additive, no break.
5. Build the ingestion proposer (separate phase) that fills `raw_chunks` → emits queued proposals.
6. Deprecate `source_url` after two releases.

Each step is independently shippable behind a feature flag and keeps the proposal queue as the only write path — CLAUDE.md compatible.

---

## Sources and references

1. [Mem0 paper — arXiv 2504.19413](https://arxiv.org/abs/2504.19413) — extract / update / consolidate phases, ADD/UPDATE/DELETE/NOOP
2. [Mem0 graph memory docs](https://docs.mem0.ai/platform/features/graph-memory) — hybrid vector + graph
3. [Mem0 — Add Memory operation](https://docs.mem0.ai/core-concepts/memory-operations/add)
4. [Mem0 — State of AI Agent Memory 2026](https://mem0.ai/blog/state-of-ai-agent-memory-2026)
5. [Zep paper — arXiv 2501.13956](https://arxiv.org/abs/2501.13956) — temporal knowledge graph
6. [Graphiti GitHub](https://github.com/getzep/graphiti) — episode / semantic / community subgraphs
7. [Zep docs — graph overview](https://help.getzep.com/graph-overview)
8. [Cognee — cognify pipeline docs](https://docs.cognee.ai/core-concepts/main-operations/legacy-operations/cognify)
9. [Cognee — ontology grounding](https://www.cognee.ai/blog/deep-dives/grounding-ai-memory)
10. [Letta — MemGPT concepts](https://docs.letta.com/concepts/memgpt/)
11. [Letta — memory management](https://docs.letta.com/advanced/memory-management/)
12. [LangMem conceptual guide](https://langchain-ai.github.io/langmem/concepts/conceptual_guide/) — semantic / episodic / procedural
13. [LangMem SDK launch blog](https://blog.langchain.com/langmem-sdk-launch/)
14. [Notion — block-based data model](https://www.notion.com/blog/data-model-behind-notion)
15. [Glean — Enterprise Graph product page](https://www.glean.com/product/enterprise-graph)
16. [Glean — knowledge graph guide](https://www.glean.com/resources/guides/glean-knowledge-graph)
17. [Microsoft Learn — semantic index for Copilot](https://learn.microsoft.com/en-us/microsoftsearch/semantic-index-for-copilot)
18. [OpenAI — Memory and new controls](https://openai.com/index/memory-and-new-controls-for-chatgpt/)
19. [LLMRefs — reverse-engineering ChatGPT memory](https://llmrefs.com/blog/reverse-engineering-chatgpt-memory)
