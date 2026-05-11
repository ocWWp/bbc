# Multi-source brain ingestion — synthesis

**Date:** 2026-05-11
**Inputs:** [A — UX patterns](A-ingestion-ux-patterns.md) · [B — data model](B-data-model-architectures.md) · [C — harness engineering](C-harness-engineering-applied.md) · [D — BBC extension plan](D-bbc-extension-plan.md)
**Audience:** Oscar, deciding whether to ship multi-source ingestion as Phase I.20 (pre-launch) or defer.

---

## The headline

The four research tracks **converge on the same answer**, with one productive disagreement on scope:

1. **The textarea stays the hero.** No surveyed product treats unstructured brain-dump as the canonical first input — that's BBC's actual differentiator. Multi-input grids dilute it into Chatbase shape. (Source: A)
2. **Sources become a first-class concept.** Every serious memory product (Mem0, Zep, Cognee, LangMem) has converged on a two-tier model: raw episode → typed nodes, with provenance as 1:many, not a single field. (Source: B)
3. **The lock matrix + proposal queue *are already* the harness.** What's missing is making `source` a structured `{channel, location, author}` triple populated automatically, plus per-source acceptance policies that are queue-gated + Manager-owned. Auto-accept then becomes *delegated*, not *silent* — preserves principle #6. (Source: C)
4. **Phase I undershipped what the design doc §5 promised.** "Upload (Notion/Google Docs URLs + markdown drag)" was always one of the three onboarding paths. Phase I only built one. This is **revealed scope, not new scope**. (Source: D)

The productive disagreement: B wants 4 new supertags + raw_chunks + embeddings + bi-temporal columns right away; D wants the minimum viable slice (sources + join + 1 new supertag) for I.20 and defers the rest. **Recommendation: take D's slice for I.20 and lock in B's longer arc as the v1.x trajectory** — see "Open decisions" below.

---

## Recommended rollout

### Phase I.20 — pre-launch (2-3 day lift)

Ships the design doc §5 promise. Adds plural inputs, single review surface.

**Schema (additive, no breaking changes):**
- `ingestion_sources` table — `id, tenant_id, kind, locator, content_hash, status, owning_layer, idempotency_key, metadata, created_at`. RLS member-read/insert.
- `memory_file_sources` join — `memory_id, source_id, locator JSONB`. RLS via parent.
- Backfill migration — synthetic `text` source per existing `memory_files` row (~30 min, zero risk).
- New supertag: **`source_artifact`** — a memory-of-a-memory. Captures the source itself when extraction can't confidently classify.
- Optional: also add **`note`** — free-form escape valve. Without it the extractor over-categorizes into `glossary`.

**Pipeline:**
- `SourceAdapter<TConfig>` interface — `kind: string; ingest(input): Promise<{ rawText, locator }>`.
- Three adapters: `text` (wraps existing behavior), `url` (fetch + readability + 1MB cap), `file` (`.md`/`.txt`, sha256, 1MB cap; PDF deferred).
- `ingestSource()` server action — runs adapter, writes `ingestion_sources` row, returns `parsed_text + source_id`.
- `extractMemoryProposals(text, sourceId)` — unchanged shape, just threads `sourceId` through.
- `bulkAcceptProposals` — accepts optional `sourceId`, writes `memory_file_sources` rows on accept.

**UI (Phase I dump-step):**
- Keep current split-screen with example brain sidebar.
- Below the textarea: row of 3 secondary tiles — `[ Drop files ]` `[ Paste URL ]` `[ More sources → ]`. Third tile routes to `/sources`.
- **Inline paste-detection chip** (highest-ROI item across the whole survey): when the user pastes a URL inside the textarea, offer a chip "Looks like a URL. Fetch and ingest separately?" Tiptap paste-rule style. Lifts the URL into its own source if accepted.

**Harness applied (from C's checklist):**
- Source provenance auto-populated as `{kind, locator, author}`, never user-supplied free-text.
- Sandboxed fetcher: dedicated HTTP client, allow-list `http(s)://`, 1MB + 10s timeout cap, no redirects to private IPs.
- PII/secret pre-scrub before any prompt construction (regex first pass).
- Size + MIME allow-list enforced *before* the LLM sees content.
- `memory/ops/ingestion/url.md` + `memory/ops/ingestion/file.md` — Manager-owned trust-tier docs.
- ADR-0005 — "Multi-source ingestion + provenance" — locks the policy.

**Lock-matrix additions** (CLAUDE.md):

| What | Edit directly | Propose edits |
|---|---|---|
| `ingestion_sources` rows (`owning_layer: manager`) | Manager | n/a |
| `memory_file_sources` join | Inherits from parent `memory_files` | n/a |
| `external_accounts` (Phase K) | Manager | n/a |

### Phase J — Marketing Studio (unchanged, 2 weeks)

**Does not depend on multi-source ingestion.** Studio reads from `memory_files`; it doesn't care how rows got there. Two phases can ship in either order. The argument for I.20 first: a launch demo that says "paste your README" is more visceral than "paste a paragraph."

### Phase K — deep integrations (~1.5 weeks, post-launch)

Bundles with Marketplace + MCP writes + Stripe.

- `external_accounts` table — `tenant_id, provider, oauth_token (encrypted), scopes, status, connected_at`.
- OAuth callback routes for GitHub, Notion, Linear.
- Three adapters, queue-first. Per-source acceptance policy doc in `memory/ops/ingestion/<source>.md`.
- New supertags from B/D consensus: **`initiative`** (Linear epics, GitHub milestones) + **`conversation`** (Slack threads, preserves multi-speaker structure).

### v1.x+ — full B trajectory

- `raw_chunks` table + pgvector embedding column on `memory_files` (hybrid retrieval becomes possible when GitHub/Notion volume justifies it).
- Bi-temporal columns on `memory_files` — `valid_from`, `valid_to`, `superseded_by`.
- Add **`event`** + **`person`** supertags (today `team` is the only place to put either, and that's wrong once Slack/GitHub ingest produce hundreds of identities).
- Slack adapter (heaviest OAuth flow; defer until paid tier justifies it).
- Browser extension (Mymind/Guru-style capture) — only if usage data shows recurring "I wish I could save this" friction.

---

## Open decisions

| # | Question | My recommendation | Reasoning |
|---|---|---|---|
| 1 | Sequence: I.20 first or J first? | **I.20 first.** | Design doc §5 already promised it; stronger launch demo; J doesn't depend on it but ingestion volume *will* stress-test the queue and inform J's input patterns. |
| 2 | I.20 supertag additions: just `source_artifact`, or also `note`? | **Both.** | `note` costs 5 minutes and gives the extractor a sane escape valve. Without it, miscategorization to `glossary` will be a steady noise source through launch. |
| 3 | Include raw_chunks + embeddings in I.20? | **Defer.** Stub only `sources` + join. | At 1-10 person scale, typed queries cover known questions; semantic search becomes useful only when GitHub/Notion arrive with volume. Schema stays additive; adding pgvector later is one migration. |
| 4 | Paste-detection chip in I.20? | **Yes.** | A flagged it as the single highest-ROI item across the entire survey. Directly answers user frustration without adding new top-level UI. Lift: ~half day with Tiptap or a custom paste handler. |

---

## What's next

If you want to ship I.20:

1. I write `docs/plans/2026-05-11-phase-i20-multi-source-ingestion.md` (~30 min) using the same compact style as the Phase I plan.
2. Branch `phase-i20-ingestion`, execute task-by-task per D's punch list (12 items, mostly migrations + adapters + UI tabs).
3. Visual verify via `?preview=1`.
4. Merge to main.

If you want to ship Phase J (Marketing Studio) first and defer I.20 to after J:

1. Same routine, just write the J plan first.
2. I.20 sits as a documented backlog item with this synthesis as the spec.

Either path works architecturally. The synthesis above + the four research docs give whoever picks up the work in the next session a complete starting brief.
