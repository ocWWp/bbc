# Phase I.20 — Multi-Source Ingestion Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task.

**Goal:** Ship the multi-source brain ingestion that design doc §5 always promised. Add `ingestion_sources` + `memory_file_sources` tables, a uniform `SourceAdapter` interface, three adapters (text/url/file), and the UI affordances under the existing dump textarea. Preserve principle #6 (no silent autonomy): every byte still funnels through the proposal queue.

**Output:** After Phase I.20, the onboarding `/welcome` flow accepts three inputs side-by-side — pasted text (current hero), pasted URL (fetched + readability-parsed), or dropped file (`.md` / `.txt`). Each ingestion writes a row in `ingestion_sources`, runs through the existing `extractMemoryProposals` path, and every saved memory cites its source via `memory_file_sources`. An inline paste-detection chip catches URLs typed inside the textarea and offers to fetch them separately.

**Non-goals (deferred):**
- PDF parsing (defer to v1.21 once we pick a parser strategy)
- `raw_chunks` table + pgvector (defer until GitHub/Notion volume justifies)
- OAuth integrations (GitHub, Notion, Linear, Slack) — Phase K
- Bi-temporal columns on `memory_files` — v1.x+
- `/sources` page implementation — stub route only in I.20

**Architecture:**
- Schema: 2 new tables (`ingestion_sources` + `memory_file_sources`) + 1 enum + 1 backfill migration. Pure additive — no breaking changes to `memory_files`.
- Pipeline: `SourceAdapter<TConfig>` interface, three implementations (`text`, `url`, `file`). Adapter runs first → produces `{ rawText, source_id }` → existing `extractMemoryProposals(text)` chain unchanged.
- Harness safeguards (per `docs/research/2026-05-11-brain-ingestion/C-harness-engineering-applied.md`): sandboxed fetcher with SSRF protection, size + MIME allow-list before LLM, PII pre-scrub regex, structured `source: {kind, locator, fetched_at}` provenance auto-populated.
- New supertags: `source_artifact` (a memory-of-a-memory) + `note` (free-form escape valve).
- UI: 3-tile row under textarea (Drop · Paste URL · More sources →) + inline paste-detection chip. No tab-strip; tiles are inline secondary affordances per research track A's UX recommendation.

**Working directory:** Run all commands from repo root.
**Branch:** `phase-i20-ingestion`
**Commit cadence:** One per task. Groups 1–3 land schema + adapter + extractor; Group 4 ships UI; Group 5 layers harness safeguards; Group 6 verifies.

**Research grounding:** `docs/research/2026-05-11-brain-ingestion/{A,B,C,D,SUMMARY}.md`.

---

## Group 1 — Schema + governance (4 tasks)

### Task I.20.1: Migration — `ingestion_sources` table + enums

Create `apps/dashboard/supabase/migrations/0020_ingestion_sources.sql`:

```sql
create type ingestion_source_kind as enum ('text', 'url', 'file');
create type ingestion_status as enum (
  'pending', 'fetched', 'parsed', 'extracted', 'integrated', 'error'
);

create table public.ingestion_sources (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references public.tenants(id) on delete cascade,
  created_by        uuid not null references auth.users(id),
  kind              ingestion_source_kind not null,
  status            ingestion_status not null default 'pending',
  idempotency_key   text not null,
  locator           jsonb not null default '{}'::jsonb,
  content_hash      text,
  byte_size         int,
  error_message     text,
  created_at        timestamptz not null default now(),
  fetched_at        timestamptz,
  owning_layer      text not null default 'manager',
  unique (tenant_id, idempotency_key)
);
create index on public.ingestion_sources (tenant_id, created_at desc);

alter table public.ingestion_sources enable row level security;
create policy "member-read" on public.ingestion_sources for select
  using (tenant_id in (select tenant_id from public.tenant_members where user_id = auth.uid()));
create policy "member-insert" on public.ingestion_sources for insert
  with check (tenant_id in (select tenant_id from public.tenant_members where user_id = auth.uid()) and created_by = auth.uid());
```

Verify the RLS template matches existing tables (`tenant_members` table name, `member-read` policy naming). Adjust to match the repo's convention.

**Commit:** `Phase I.20.1: migration — ingestion_sources table + enums`

---

### Task I.20.2: Migration — `memory_file_sources` join + frontmatter source field

Create `apps/dashboard/supabase/migrations/0021_memory_file_sources.sql`:

```sql
create table public.memory_file_sources (
  memory_id    uuid not null references public.memory_files(id) on delete cascade,
  source_id    uuid not null references public.ingestion_sources(id) on delete cascade,
  tenant_id    uuid not null,
  locator      jsonb not null default '{}'::jsonb,
  confidence   real,
  created_at   timestamptz not null default now(),
  primary key (memory_id, source_id)
);
create index on public.memory_file_sources (source_id);
create index on public.memory_file_sources (memory_id);

alter table public.memory_file_sources enable row level security;
create policy "member-read" on public.memory_file_sources for select
  using (tenant_id in (select tenant_id from public.tenant_members where user_id = auth.uid()));
create policy "member-insert" on public.memory_file_sources for insert
  with check (tenant_id in (select tenant_id from public.tenant_members where user_id = auth.uid()));
```

`tenant_id` is denormalized on the join row to keep the RLS predicate cheap (no subquery to parent).

**Commit:** `Phase I.20.2: migration — memory_file_sources join table`

---

### Task I.20.3: Migration — backfill existing memory_files with synthetic text sources

Create `apps/dashboard/supabase/migrations/0023_backfill_text_sources.sql`:

```sql
-- Every memory_files row that exists today came from a textarea dump or hand-
-- seeded examples. Mark them all as 'text' sources so the join table has rows.
-- The original input was not retained; the backfilled source row is a stub.

with new_sources as (
  insert into public.ingestion_sources
    (tenant_id, created_by, kind, status, idempotency_key, locator, created_at, owning_layer)
  select
    m.tenant_id,
    coalesce(m.created_by, (select id from auth.users limit 1)),
    'text'::ingestion_source_kind,
    'integrated'::ingestion_status,
    'backfill:' || m.id::text,
    jsonb_build_object('backfilled', true, 'note', 'pre-Phase-I.20 row; original input not retained'),
    m.created_at,
    'manager'
  from public.memory_files m
  returning id, idempotency_key, tenant_id
)
insert into public.memory_file_sources (memory_id, source_id, tenant_id, locator)
select
  (select id from public.memory_files where 'backfill:' || id::text = ns.idempotency_key and tenant_id = ns.tenant_id limit 1),
  ns.id,
  ns.tenant_id,
  '{}'::jsonb
from new_sources ns;
```

Validate locally against a dev DB before pushing. If `memory_files` has no rows yet (fresh tenant), this is a no-op.

**Commit:** `Phase I.20.3: migration — backfill text sources for existing memories`

---

### Task I.20.4: ADR-0005 + lock-matrix update

Create `memory/decisions/0005-multi-source-ingestion.md` following the existing ADR style. Cover:

- Context: design doc §5 promised three onboarding paths; Phase I shipped one. Multi-source ingestion is revealed scope.
- Decision: ship URL + file ingestion in I.20; defer OAuth integrations to Phase K; preserve principle #6 by routing all sources through the existing proposal queue.
- Trust model: per `docs/research/2026-05-11-brain-ingestion/C-harness-engineering-applied.md` — sandboxed fetcher, allow-listed schemes, size caps before LLM, structured provenance.
- Rippable vs durable: prompt-injection wrappers + LLM contradiction checks are rippable; the queue gate, PII scrubbing, source attribution, and Lock Matrix are durable.
- Consequences: new tables/columns require RLS extension; future bulk-revert script (`scripts/reject-by-source.sh`) is a follow-on.

Then update `CLAUDE.md` lock matrix table — three new rows:

| What | Edit directly | Propose edits |
|---|---|---|
| `ingestion_sources` rows (`owning_layer: manager`) | Manager | Distribution via `propose_change()` |
| `memory_file_sources` join | Inherits from parent `memory_files` | n/a |
| `external_accounts` (Phase K placeholder) | Manager | n/a |

**Commit:** `Phase I.20.4: ADR-0005 multi-source ingestion + lock-matrix update`

---

## Group 2 — Adapter pipeline (4 tasks)

### Task I.20.5: `SourceAdapter` interface + registry

Create `apps/dashboard/src/lib/ingestion/adapter.ts`:

```ts
export type AdapterResult =
  | { ok: true; rawText: string; locator: Record<string, unknown>; contentHash: string; byteSize: number }
  | { ok: false; error: string };

export interface SourceAdapter<TConfig = unknown> {
  kind: "text" | "url" | "file";
  ingest(input: TConfig): Promise<AdapterResult>;
}

export const adapters: Record<string, SourceAdapter> = {};
export function registerAdapter(a: SourceAdapter) { adapters[a.kind] = a; }
```

Add a registry index that imports + registers each concrete adapter (the text/url/file files added below).

**Commit:** `Phase I.20.5: SourceAdapter interface + registry`

---

### Task I.20.6: Text adapter (wraps current behavior)

Create `apps/dashboard/src/lib/ingestion/adapters/text.ts`:

```ts
import crypto from "node:crypto";
import { type SourceAdapter, registerAdapter } from "../adapter";

const textAdapter: SourceAdapter<{ text: string }> = {
  kind: "text",
  async ingest({ text }) {
    if (!text || text.length < 80) return { ok: false, error: "Too short (min 80 chars)." };
    if (text.length > 50_000) return { ok: false, error: "Too long (max 50,000 chars)." };
    const contentHash = crypto.createHash("sha256").update(text).digest("hex");
    return {
      ok: true,
      rawText: text,
      locator: { kind: "text", length: text.length },
      contentHash,
      byteSize: Buffer.byteLength(text, "utf8"),
    };
  },
};

registerAdapter(textAdapter);
export { textAdapter };
```

**Commit:** `Phase I.20.6: text source adapter`

---

### Task I.20.7: URL adapter (sandboxed fetch + readability)

Install dependency:
```bash
pnpm --filter @bbc/dashboard add @mozilla/readability linkedom
```

Create `apps/dashboard/src/lib/ingestion/adapters/url.ts`:

```ts
import crypto from "node:crypto";
import { Readability } from "@mozilla/readability";
import { parseHTML } from "linkedom";
import { type SourceAdapter, registerAdapter } from "../adapter";

const MAX_BYTES = 1_048_576; // 1 MB
const TIMEOUT_MS = 10_000;
const PRIVATE_IP = /^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|169\.254\.|127\.|0\.0\.0\.0|localhost)/;

const urlAdapter: SourceAdapter<{ url: string }> = {
  kind: "url",
  async ingest({ url }) {
    let parsed: URL;
    try { parsed = new URL(url); } catch { return { ok: false, error: "Invalid URL." }; }
    if (!/^https?:$/.test(parsed.protocol)) return { ok: false, error: "Only http(s) allowed." };
    if (PRIVATE_IP.test(parsed.hostname)) return { ok: false, error: "Private/loopback addresses blocked." };

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    let html: string;
    try {
      const res = await fetch(parsed.toString(), { signal: ctrl.signal, redirect: "follow" });
      const len = Number(res.headers.get("content-length") ?? 0);
      if (len > MAX_BYTES) return { ok: false, error: "Response too large (>1 MB)." };
      const ct = res.headers.get("content-type") ?? "";
      if (!ct.startsWith("text/html") && !ct.startsWith("text/plain")) {
        return { ok: false, error: `Unsupported content-type: ${ct}` };
      }
      const buf = await res.arrayBuffer();
      if (buf.byteLength > MAX_BYTES) return { ok: false, error: "Response too large (>1 MB)." };
      html = new TextDecoder().decode(buf);
    } catch (e) {
      return { ok: false, error: e instanceof Error && e.name === "AbortError" ? "Fetch timed out (10s)." : "Fetch failed." };
    } finally {
      clearTimeout(timer);
    }

    const { document } = parseHTML(html);
    const article = new Readability(document).parse();
    const text = (article?.textContent ?? document.body?.textContent ?? "").trim();
    if (text.length < 80) return { ok: false, error: "Page content too short after parsing." };

    return {
      ok: true,
      rawText: text,
      locator: { kind: "url", href: parsed.toString(), title: article?.title ?? "" },
      contentHash: crypto.createHash("sha256").update(text).digest("hex"),
      byteSize: Buffer.byteLength(text, "utf8"),
    };
  },
};

registerAdapter(urlAdapter);
export { urlAdapter };
```

DNS rebinding remains a theoretical residual risk; document it in ADR-0005 as accepted for v1 (mitigation = per-source rate limits).

**Commit:** `Phase I.20.7: URL source adapter with SSRF protection + readability`

---

### Task I.20.8: File adapter (.md / .txt only)

Create `apps/dashboard/src/lib/ingestion/adapters/file.ts`:

```ts
import crypto from "node:crypto";
import { type SourceAdapter, registerAdapter } from "../adapter";

const MAX_BYTES = 1_048_576;
const ALLOWED_EXT = /\.(md|markdown|txt)$/i;

const fileAdapter: SourceAdapter<{ name: string; bytes: Uint8Array }> = {
  kind: "file",
  async ingest({ name, bytes }) {
    if (!ALLOWED_EXT.test(name)) return { ok: false, error: "Only .md, .markdown, .txt supported." };
    if (bytes.byteLength > MAX_BYTES) return { ok: false, error: "File too large (>1 MB)." };
    const text = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
    if (text.length < 80) return { ok: false, error: "File content too short." };
    return {
      ok: true,
      rawText: text,
      locator: { kind: "file", filename: name },
      contentHash: crypto.createHash("sha256").update(bytes).digest("hex"),
      byteSize: bytes.byteLength,
    };
  },
};

registerAdapter(fileAdapter);
export { fileAdapter };
```

**Commit:** `Phase I.20.8: file source adapter (.md/.txt)`

---

## Group 3 — Server actions + extractor wiring (3 tasks)

### Task I.20.9: `ingestSource` server action

Update `apps/dashboard/src/app/welcome/actions.ts` — add a new action that runs the adapter, inserts the `ingestion_sources` row, returns `{ sourceId, rawText }` for the existing `extractMemoryProposals` chain. Sketch:

```ts
"use server";
import { adapters } from "@/lib/ingestion/adapter";
import "@/lib/ingestion/adapters"; // index that imports text/url/file

export async function ingestSource(input:
  | { kind: "text"; text: string }
  | { kind: "url"; url: string }
  | { kind: "file"; name: string; bytes: Uint8Array }
): Promise<{ ok: true; sourceId: string; rawText: string } | { ok: false; error: string }> {
  const adapter = adapters[input.kind];
  if (!adapter) return { ok: false, error: "Unknown source kind." };
  const result = await adapter.ingest(input as never);
  if (!result.ok) return { ok: false, error: result.error };

  // Build idempotency key from kind + content_hash so re-ingesting the same content is a no-op
  const idem = `${input.kind}:${result.contentHash}`;
  // Insert into ingestion_sources; on conflict, fetch existing id
  // ... supabase insert with .onConflict('tenant_id, idempotency_key').ignoreDuplicates() + select
  // Return { sourceId, rawText }
}
```

PII pre-scrub (basic regex pass): strip OpenAI keys (`sk-[a-zA-Z0-9]{40,}`), AWS keys (`AKIA[0-9A-Z]{16}`), email password parameters in URLs. Replace matches with `[REDACTED:<kind>]`. Log count of redactions to the source row's `locator.redactions` for audit.

**Commit:** `Phase I.20.9: ingestSource server action with idempotency + PII scrub`

---

### Task I.20.10: `extractMemoryProposals` + `bulkAcceptProposals` source threading

Update `extractMemoryProposals(text, sourceId)`:
- Add `sourceId` param (optional for backward compat).
- Pass source kind + locator into the system prompt as `<source channel="url" location="..." />` so the LLM knows the origin and can adjust trust (e.g., "this came from a webpage, treat positioning claims with appropriate skepticism").

Update `bulkAcceptProposals(proposals, sourceId)`:
- After inserting each `memory_files` row, insert a `memory_file_sources` join row linking it to `sourceId`.
- Populate `memory_files.frontmatter.source = { kind, locator, fetched_at, idempotency_key }` per `memory/_schema.md`.
- Wrap in a transaction so a partial failure doesn't orphan join rows.
- Update source status: `'integrated'` on success, `'error'` on failure.

**Commit:** `Phase I.20.10: thread sourceId through extractor + bulk accept`

---

### Task I.20.11: New supertags — `source_artifact` + `note`

Update `apps/dashboard/src/lib/memory/types/index.ts`:

```ts
export const sourceArtifactFieldsSchema = z.object({
  source_id: z.string().uuid(),
  source_kind: z.enum(["text", "url", "file"]),
  url: z.string().url().optional().or(z.literal("")),
  snapshot_at: dateString.optional(),
  summary: z.string().max(2000).default(""),
});

export const noteFieldsSchema = z.object({
  body: z.string().max(4000).default(""),
  topic: z.string().max(200).optional(),
});
```

Add to `supertagSchemas` + `SUPERTAGS` + `supertagMeta` (with accent colors — pick distinct hues that don't collide with existing: `source_artifact: "slate"`, `note: "stone"`).

Update `apps/dashboard/src/lib/memory/extractor/prompt.ts` system prompt to describe when to use each:
- `source_artifact` — when the source itself is the memory (e.g., "this README is our brand guide"), distinct from the facts extracted from it.
- `note` — free-form prose that should be remembered but doesn't fit elsewhere. Use sparingly; prefer typed supertags when possible.

**Commit:** `Phase I.20.11: add source_artifact + note supertags`

---

## Group 4 — UI (4 tasks)

### Task I.20.12: Tile row under textarea (Drop · Paste URL · More sources)

Update `apps/dashboard/src/app/welcome/_steps/dump-step.tsx`:
- Below the textarea, above the char counter + button: a 3-column tile row.
- Each tile: rounded card, border, ~80px tall, icon + label + subhint.
- "Drop files" → hidden `<input type="file" accept=".md,.txt,.markdown" multiple>` with drag-over visual.
- "Paste URL" → opens an inline modal-popover with a single input + Fetch button.
- "More sources →" → routes to `/sources` (stub page added in I.20.14).
- Keep the existing example brain sidebar; tile row sits between textarea and char counter.

On a successful URL fetch or file drop, append a `SourceChip` above the textarea showing kind + name + remove button. Each chip carries its own `sourceId` (returned from `ingestSource`).

Multiple chips allowed. The "Structure my brain →" button changes copy when chips exist: "Structure my brain + N source(s) →" and on submit, calls `extractMemoryProposals` once per source plus once for the textarea text, sequentially.

**Commit:** `Phase I.20.12: dump-step tile row + source chips`

---

### Task I.20.13: Inline paste-detection chip

When the user pastes a single URL into the textarea (clipboard content matches `^https?://\S+$` after trim, length < 500):
- Show a chip beneath the textarea: "Looks like a URL — fetch it as a separate source?" with two buttons: `[Keep as text]` `[Fetch]`.
- `Fetch` removes the URL from the textarea (replaces with empty), calls `ingestSource({ kind: "url", url })`, and adds the resulting chip.
- `Keep as text` dismisses the chip; URL stays inline and gets extracted as normal text.
- Use a paste event handler on the textarea — no need for Tiptap.

**Commit:** `Phase I.20.13: inline paste-detection chip for URLs`

---

### Task I.20.14: Stub `/sources` route

Create `apps/dashboard/src/app/sources/page.tsx` — a minimal page accessible only to signed-in users. For I.20 it shows:
- Header: "Sources"
- Section 1: "Direct" — same three tiles as dump-step (Drop / URL / Paste text → routes to `/welcome` if not already onboarded).
- Section 2: "Connected" — disabled rows for GitHub, Notion, Linear, Slack each with `coming v1.21` / `v1.22` / `v1.23` badges.
- Section 3: "Recent ingests" — table of `ingestion_sources` for the tenant (server component fetches via `cookies()` Supabase client + RLS), columns: kind · locator · status · created_at · # proposals (count from join).

This is the v1.x landing pad for connectors per the research SUMMARY. I.20 ships only the read view.

**Commit:** `Phase I.20.14: /sources page (read-only ingestion history)`

---

### Task I.20.15: Review-step source attribution

Update `apps/dashboard/src/app/welcome/_steps/review-step.tsx`:
- Each proposal card shows a small source attribution chip above the title: `from URL · acme.com/handbook` (truncated) or `from file · README.md` or no chip for direct text.
- Brain preview panel (right side) shows a `Sources` footer line: "Drawn from 1 URL + 2 files" (count by kind from active sources). Updates as user toggles checkboxes.

**Commit:** `Phase I.20.15: source attribution on review cards + preview footer`

---

## Group 5 — Harness safeguards (1 task)

### Task I.20.16: Manager-owned source policies + ops docs

Create three Manager-owned memory files (per harness checklist item 5):

- `memory/ops/ingestion/text.md` — trust tier (high; user-typed), expected fact shape (anything), default acceptance (always human review).
- `memory/ops/ingestion/url.md` — trust tier (medium; user-attested, third-party content), expected fact shape (product/voice/decision/glossary common), default acceptance (always human review), SSRF/timeout caveats from the URL adapter docstring.
- `memory/ops/ingestion/file.md` — trust tier (medium; user-attested), expected fact shape (depends on file kind), default acceptance (always human review).

Each file uses the standard frontmatter from `memory/_schema.md` with `owning_layer: manager`. Body is short — 5-10 lines each.

These files satisfy harness item 5 ("Is there a memory/ops/ingestion/<source>.md describing the trust tier and expected fact shape?") and become the seed for richer per-source policies in Phase K.

**Commit:** `Phase I.20.16: Manager-owned ingestion source policies`

---

## Group 6 — Verification (2 tasks)

### Task I.20.17: Type-check + production build

```bash
pnpm exec tsc --noEmit
pnpm --filter @bbc/dashboard build
```

Both must pass. Fix any failures before next task.

**Commit:** none (verification gate).

---

### Task I.20.18: Browser smoke test (preview mode)

With dev server running, visit `http://localhost:3000/welcome?preview=1` and verify:

1. **Tile row renders** under textarea — 3 tiles, hover states, keyboard-focusable.
2. **URL paste flow** — click "Paste URL" → inline popover opens → enter a real URL (use `https://anthropic.com/news` or similar) → Fetch → chip appears above textarea → click "Structure my brain" → review step shows proposals with `from URL · …` attribution.
3. **File drop flow** — drag a small `.md` file onto the "Drop files" tile → chip appears → submit → review step shows proposals with `from file · …` attribution.
4. **Inline paste-detection** — paste `https://example.com/foo` directly into the textarea → chip "Looks like a URL — fetch it as a separate source?" appears → click Fetch → URL is removed from textarea and added as a chip above.
5. **Source remove** — click × on a chip → chip disappears, button copy reverts.
6. **Light + dark** — toggle theme, verify all tiles + chips + popover + paste-detection legible in both modes.
7. **Brain preview footer** — toggle checkboxes on review step, verify "Drawn from N source(s)" count updates.
8. **Done step source recap** — verify done step lists items grouped by supertag (existing behavior unchanged).
9. **Idempotency** — fetch the same URL twice → second attempt either no-ops (existing source returned) or shows "already ingested" hint.
10. **Error paths** — try `http://localhost/something` → blocked with "Private/loopback addresses blocked"; try a `.pdf` drop → "Only .md, .markdown, .txt supported"; try an empty URL field → form validation.

Screenshot the dump-step with chips visible, the URL popover, the paste-detection chip, and the review step with attributions. Save under `/tmp` so we don't pollute repo.

**Commit:** none (verification only).

---

## Summary

| Group | Tasks | What ships |
|---|---|---|
| 1. Schema + governance | I.20.1–I.20.4 | 3 migrations + ADR-0005 + CLAUDE.md lock matrix |
| 2. Adapter pipeline | I.20.5–I.20.8 | `SourceAdapter` interface + text/url/file adapters with SSRF + size caps |
| 3. Server actions + extractor | I.20.9–I.20.11 | `ingestSource` + threading + 2 new supertags (`source_artifact`, `note`) |
| 4. UI | I.20.12–I.20.15 | Tile row, paste-detection chip, `/sources` stub, source attribution on review |
| 5. Harness safeguards | I.20.16 | Manager-owned per-source policy memory files |
| 6. Verification | I.20.17–I.20.18 | Type-check, build, browser smoke |

**Total: 18 tasks, ~2-3 days of planned work (single session).**

**Risks:**
- **URL fetcher SSRF**: the IP allow-list relies on hostname matching, not resolved IP. DNS rebinding is a residual risk; mitigated by per-tenant rate limits. Documented in ADR-0005.
- **PDF deferred**: users will paste a PDF and get an error; copy must make the deferral obvious. Mitigation: tile labels read `.md .txt` not "files."
- **Source backfill on prod DB**: requires existing rows to have a `created_by`. If any are NULL, the migration fallback (`select id from auth.users limit 1`) is sketchy. Verify against prod schema before pushing.
- **Idempotency conflicts on URL re-fetch**: if content changes between fetches the hash differs and we get a new source row. Acceptable for v1 — user can manually de-dupe via `/sources`.

**Phase I.20 is complete when:**
1. All 18 tasks committed atomically on `phase-i20-ingestion`.
2. Type-check + build clean.
3. Smoke test in I.20.18 passes all 10 verifications.
4. A user pastes a URL or drops a `.md` file in `/welcome` and gets typed proposals back, attributed to the source, queue-gated, with provenance written to `memory_file_sources`.
5. ADR-0005 + 3 ops policy files committed.
6. Lock matrix in CLAUDE.md updated.
7. Branch merged to `main`.

---

## After I.20

Per research SUMMARY rollout:
- **Phase J — Marketing Studio v1** (2 weeks, hero feature). Studio reads from `memory_files`; doesn't depend on I.20's ingestion. Sequencing argument for I.20-first: launch demo strength + queue stress test.
- **Phase K — OAuth integrations** (~1.5 weeks, post-launch). GitHub + Notion + Linear, all queue-first, all `external_accounts`-table-driven. Adds `initiative` + `conversation` supertags.
- **v1.x+** — `raw_chunks` + pgvector, bi-temporal columns, Slack, browser extension.
