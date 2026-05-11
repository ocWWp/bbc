---
id: mem_2026-05-11_adr-0005-multi-source-ingestion
type: decision
scope: org
layer: main
source: human:oscar
created: 2026-05-11T00:00:00Z
updated: 2026-05-11T00:00:00Z
owning_layer: main
tags: [adr, bbc, ingestion, sources, harness, security, principles]
status: accepted
---

# ADR-0005: Multi-source brain ingestion — URLs and files are first-class alongside pasted text

## Context

Design doc §5 always promised three onboarding inputs: **paste**, **drop a file**, **paste a URL**. Phase I shipped only the textarea. The result is a brain that has lobotomized its own input surface: real users have a README, a deck, a Notion doc, a landing page — making them retype that content is friction we don't need and don't intend.

Research (`docs/research/2026-05-11-brain-ingestion/`) confirmed two things:

1. **Every serious memory product is multi-source.** Mem0, Letta, Zep, Cognee, Glean — all of them treat unstructured paste as one ingestion path among many, not the canonical one. BBC's bet on textarea-as-hero is a UX statement (brain-dump is fine), not a data-model decision.
2. **BBC's own lock matrix + proposal queue already are the harness.** The harness-engineering research (track C) shows that what's missing is making `source` a structured `{kind, locator, fetched_at}` triple, attaching it to every memory via a many-to-many join, and routing every byte of ingested content through the existing proposal queue before it becomes a memory.

Phase I.20 ships URL paste and file drop. OAuth integrations (GitHub, Notion, Linear, Slack) are explicitly deferred to Phase K — they need an `external_accounts` table, OAuth flows, scope-management UI, and per-connector trust tiers that don't belong in a pre-launch sprint.

## Decision

**Three convergent rules:**

1. **Sources are first-class.** A new `ingestion_sources` table holds one row per ingestion event (text paste, URL fetch, file drop). A new `memory_file_sources` join table cites the N sources that contributed to each memory. Every memory carries its provenance; multi-source conflicts surface as a single proposal with both candidate values.

2. **No silent autonomy — principle #6 holds.** Every ingested byte runs through the existing `extractMemoryProposals` → `bulkAcceptProposals` queue. There is no auto-accept for any source kind in I.20. When per-source auto-accept becomes useful (Phase K, when a Slack-bot ingest at volume justifies it), it will be **delegated**, not silent: a Manager-owned `memory/ops/ingestion/<source>.md` policy file will declare the trust tier and acceptance rule, and the rule itself must pass through the queue once before any byte is auto-accepted.

3. **Trust boundaries are per source kind, not blanket.** The URL adapter runs a sandboxed fetcher (allow-listed schemes, hostname-based IP block, content-type allow-list, 1 MB size cap, 10 s timeout) before any content reaches an LLM. The file adapter accepts only `.md` / `.txt` (PDF deferred). A basic PII pre-scrub (API keys, AWS keys, password-in-URL parameters) runs on the raw text before extraction. SSRF via DNS rebinding remains a residual risk in v1, mitigated by per-tenant rate limits.

## Rippable vs durable

Per the harness-engineering framing:

- **Durable** (these survive every refactor): the lock matrix, the proposal queue gate, per-source `owning_layer`, the `source: {kind, locator, fetched_at}` provenance triple, PII scrubbing as a pre-extraction step.
- **Rippable** (replace freely): the specific fetcher implementation, the readability parser choice, the PII regex catalog, the SSRF allow-list shape, the LLM extractor prompt.

If we ever swap `@mozilla/readability` for a better parser, or `linkedom` for a real headless browser, the queue gate and provenance model don't move.

## Consequences

**Schema:** Two new tables (`ingestion_sources`, `memory_file_sources`) + one enum extension (`memory_type` += `source_artifact`, `note`). Pure-additive — no breaking changes to `memory_files`. Three migrations: `0020`, `0021`, `0022`.

**Governance:** Lock matrix in `CLAUDE.md` gains three rows for the new tables. `ingestion_sources` is `owning_layer: manager` (Manager owns ingestion policy); `memory_file_sources` inherits from its parent memory; `external_accounts` is added as a Phase K placeholder row.

**Ops surface:** Three new Manager-owned policy files seeded under `memory/ops/ingestion/{text,url,file}.md` declaring trust tiers and acceptance defaults. These are the seed for richer Phase K policies.

**Deferred risks:**
- **DNS rebinding** on the URL fetcher (mitigated by rate limits, not eliminated).
- **PDF parsing** deferred to v1.21 once we pick a parser strategy that handles scanned PDFs sensibly.
- **No `raw_chunks` table or pgvector yet** — at I.20 volume (1-10 onboarding tenants) Postgres + recursive CTE over the join table is enough. Bi-temporal columns (`valid_from` / `valid_to`) and embedding storage land when volume justifies them.

**Backfill:** Pre-I.20 memories have no source rows. Schema-level cause: `memory_files` has no `created_by` column, so a synthetic-text-source backfill would have nothing to FK against. UI handles "no source" gracefully on review/done steps.

**Follow-on:** A future `scripts/reject-by-source.sh` (file-mode) and `bulk_reject_by_source()` (DB-mode) will let an admin retract every memory from a compromised source in one move. Not shipped in I.20 — but the data model supports it from day one.
