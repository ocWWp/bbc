# BBC v1.5 launch — design doc

**Status:** approved, ready to plan
**Branch:** `phase-j-marketing-studio` (PR #1, 80 commits ahead of main)
**Target ship:** mid-July 2026 (~9 weeks from 2026-05-12)
**Authors:** ocwwp + Claude
**Supersedes:** the implicit "merge PR #1 and ship" plan in `.planning/ROADMAP.md` §"What's next, in order"

## Why this doc exists

The roadmap as written had BBC v1 shipping immediately after PR #1 merge: "Phase L — Landing + docs + Show HN — most of the work is content, not code." A brainstorm on 2026-05-12 expanded the scope: instead of shipping a "1 studio + 1 marketplace + landing" v1, BBC ships **v1.5** with a unified Library, an external skill-import path (SKILL.md / agentskills.io), a connector framework with 8 launch connectors, and a Loop 3 v1 recommendation surface (single-tenant + cross-tenant signal). The result is a launch that positions BBC as **the open ecosystem-consuming company brain**, not as "another Marketing Studio."

This doc captures the design. Implementation planning happens in a follow-up (executed by the `writing-plans` skill).

## §1 — Positioning & scope

### One-line pitch
**"BBC is the open company brain. Typed memory × any agent skill × any connector. AGPL, self-host, BYOK."**

### Three pillars
1. **Memory** — typed, queryable, human-reviewed (Loop 1, shipped). 9 supertags + relations.
2. **Skills** — role-scoped agents, importable from the agentskills.io ecosystem. 5 built-in + import-from-URL + curated packs.
3. **Connectors** — typed-aware data ingestion. 8 at launch + MCP framing.

### Loop 3 v1 at launch
- **Single-tenant recommendations**: rule-based proposals of skills/connectors matched against tenant profile + memory gaps
- **Cross-tenant signal**: aggregated anonymized "companies your size typically have X" recommendations, gated by a privacy ADR (k-anonymity ≥5)

### Audience
**Startup founders + indie hackers.** Hosted demo URL = foot in the door. Self-host link = conversion. Launch post lives at the intersection of "OSS / self-host / BYOK" (indie hooks) and "structure your startup's work" (founder hooks).

### Out of scope for v1.5 (deferred to v1.x+)
- Hybrid retrieval / vector search (defer until tenants hit ~5K items; current brain-summary + prompt caching handles v1.5)
- Self-modifying core (BBC-on-BBC PRs from Sentry/Linear watchers)
- Daily-scan Loop 3 cadence + 3-proposals-per-day cap from ADR-0009
- "Founders-of-founders" cross-tenant skill marketplace
- Real-time team chat in BBC (MCP framing covers the value)

## §2 — Library (the unified marketplace UX)

### Route
- `/marketplace` → 308 redirect to `/library`
- `/library` is the new home for browsing extensibility

### Three categories
| Category | Content | State today |
|---|---|---|
| **Skills** | Agent role templates (SKILL.md). 5 built-in + import + curated packs. | NEW for launch |
| **Connectors** | Typed-aware data ingestion adapters. | NEW for launch |
| **Providers** | LLM / DB / email / hosting vendors. Current `/marketplace` content. | Shipped; moves under this tab |

### "Recommended for you" surface (Loop 3 v1)
- Top band on `/library`, above the categories
- Algorithm v1: deterministic rule-based, no LLM
  - **Skill recommendations**: match new SKILL.md packs against tenant's role profile (`memory/ops/profiles/*.yaml`)
  - **Connector recommendations**: triggered by detected memory gaps (e.g., 5+ decisions but no GitHub → suggest GitHub)
  - **Cross-tenant signal**: "Companies in your cohort typically have X" — gated by privacy ADR
- Every recommendation generates a queue **proposal** (audit trail) AND surfaces in the band
- "Why this?" explanation on every recommendation — one paragraph backed by what BBC observed

### Card and detail-surface requirements
Captured in detail in the separate Claude Design prompt at `docs/plans/2026-05-12-library-claude-design-prompt.md`. Key non-visual requirements:
- Typed-schema mapping on every card (Skills: "Reads: voice, product, decision"; Connectors: "Writes: decision, vendor, note")
- Search-first; category filter; "Installed" pill; "Recommended" badge
- Detail drawer/modal/page shows source repo, license, last updated, `firstUseInputs` preview, OAuth scope summary, install button with permission preview
- Mobile-first: card grid collapses, detail surface becomes full-screen sheet
- Keyboard-navigable; Escape dismisses detail; search input first-focusable

### Simplicity + user segmentation
The Library serves two audiences with different needs:
- **Founders / curated path**: prefer "what should I install today?" — defaults surface 3–5 curated recommendations, starter packs, and category-filtered top picks
- **Indie hackers / power-user path**: prefer full control — explicit "Show all" expands density, surfaces filters, exposes the URL import primitive

Implementation guidance for the designer: surface curated content first (founders' default), make power-user controls discoverable but not loud (indie hackers find them and stay). One UI, two effective experiences.

## §3 — Skills layer

### Format choice: SKILL.md (agentskills.io standard)
Single decision: BBC's first-party skill format is **SKILL.md** per the agentskills.io specification. Adopted by Anthropic, OpenAI Codex, Cursor, GitHub Copilot, and Hermes as of late 2025 / early 2026. Importing SKILL.md gets BBC access to the consolidated ecosystem with a single parser.

### File shape on disk
```
my-skill/
  SKILL.md                  ← required, frontmatter + body
  templates/                ← optional, prompt fragments
  scripts/                  ← optional, future tool callouts (sandboxed)
```

### SKILL.md frontmatter → BBC Studio template mapping
| SKILL.md field | BBC template field | Notes |
|---|---|---|
| `name` (kebab-case, ≤64 chars) | `template.id` | Direct |
| `description` | `template.hint` + auto-trigger copy | Drives surface in Library card |
| `when_to_use` | `template.label` + UX copy | Optional |
| `allowed-tools` | `template.tools` (stored, surfaced when tools layer ships) | Tools layer is post-launch |
| `arguments` | `template.firstUseInputs[]` (each → `{id, label, required, kind}`) | Defines studio-run UX |
| body markdown | `template.buildPrompt()` source | `{{input}}` and `{{brain.voice}}` interpolated |
| `metadata.bbc.retrieval` | `template.retrieval` | **BBC extension** — see §5 |

### BBC-specific extension: retrieval declaration
```yaml
metadata:
  bbc:
    retrieval:
      required_types: [voice, product]              # always fully loaded
      contextual_types:                              # semantically filtered (v1.5+)
        - { type: decision, top_k: 5 }
        - { type: prior_artifact, top_k: 3 }
      expand_relations: true                         # 1-hop relation expansion
```

When absent, BBC defaults to current `brain-summary.ts` behavior. When present, BBC honors the declaration. v1.5 ignores `top_k` and loads all rows from declared buckets; future hybrid retrieval activates `top_k` without changing the template format. This is forward-compatibility-by-design.

### Importer tiers
- **Tier 1 (launch):** SKILL.md (agentskills.io) + Claude Code subagent format (`.claude/agents/*.md`). Same parser, 90% overlap. Covers `anthropics/skills`, OpenAI Codex skills, Cursor skills, Hermes skills, inference.sh's 250+ skills.
- **Tier 2 (v1.1+):** `agency-agents` adapter (~30 LoC) — maps `color`/`emoji`/`vibe` frontmatter to BBC equivalents. Unlocks 147 ready-made personas.
- **Tier 2 (v1.1+):** CrewAI `agents.yaml` adapter — Python-adjacent founders.
- **Skip:** Custom GPTs (no portable export), AutoGen (code-only), LangChain Hub (programmatic API only).

### Importer mechanics
- Three entry points: paste URL, browse curated pack (Library card click), drop file
- URL parsing supports `github://owner/repo`, `github://owner/repo/path/SKILL.md`, raw `https://github.com/...`
- Pulls via GitHub API (anonymous; rate-limit handled)
- Validates frontmatter required fields (`name`, `description`)
- **Sandboxes the body**: in v1.5, only the markdown prompt is used. Script execution is not in scope.
- Registers into the tenant's `tenant_skills` table
- Skill appears in `/library` Skills tab as "Installed ✓"
- Studio route auto-generates: `/studio/{role}/{skill-id}` if no native route exists; otherwise injects into the role's template list

### Built-in 5 studios re-exported as SKILL.md packs
The 5 built-in studios (Marketing, Engineering, Founder, Designer, Support) get re-exported as SKILL.md packs in `examples/example-tenant/skills/`. This:
- Eats own dog food (proves the format)
- Gives developers something to fork
- Loads automatically as seed skills when someone clones BBC

### Schema additions
```sql
create table tenant_skills (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references tenants(id),
  source_url      text,
  source_kind     text,                 -- 'github' | 'manual' | 'builtin' | 'recommended'
  skill_name      text not null,
  skill_role      text,                 -- from metadata.bbc.role if declared
  manifest        jsonb not null,       -- parsed frontmatter
  body            text not null,
  installed_at    timestamptz default now(),
  installed_by    uuid not null references auth.users(id),
  active          boolean default true,
  unique (tenant_id, skill_name)
);

create index tenant_skills_role_idx on tenant_skills (tenant_id, skill_role) where active = true;
```

Plus `recommended_skills` table for Loop 3 v1 (BBC-suggested but not yet installed).

## §4 — Connectors layer

### Connector interface
```typescript
interface Connector {
  id: string                                        // 'notion', 'github', 'linear', 'webhook-generic'
  name: string
  description: string
  writes_to: SupertagType[]                         // ['decision', 'note', 'glossary']
  oauth_scopes?: string[]
  authenticate(tenant_id, redirect_url): Promise<AuthURL>
  complete_auth(tenant_id, code): Promise<ConnectionState>
  sync(tenant_id, state, since?: Date): AsyncIterator<MemoryProposal>
  sync_schedule: 'on_demand' | { interval_minutes: number }
  permission_summary: string                        // shown in install drawer
}
```

A connector emits **MemoryProposals**, never direct writes. Every proposal lands in `/queue` for human review. Preserves CLAUDE.md non-negotiable #6 (no silent autonomy).

### Launch tier (8 connectors)

| Connector | Writes to | Effort | Notes |
|---|---|---|---|
| **Notion** | `note`, `decision`, `glossary`, `product` | 2–3d | Killer demo: "Import your Notion workspace → typed memory in 30 sec." |
| **GitHub** | `decision` (ADRs), `note` (PRs), `team`, `source_artifact` | 2d | READMEs, ADRs, PRs/issues. Indie + technical founders. |
| **Linear** | `decision`, `note`, `product` (cycles/projects) | 2d | Eng-flavored startups. |
| **Generic Webhook** | configurable; default `note` | 1d | The cheat code. Any SaaS with outbound webhooks works. |
| **Slack** | `note` (messages), `decision` (pinned/threaded) | 5–7d | App review gating; submit week 1. |
| **Gmail** | `note` (threads), `decision` (search-pinned), `team` (contacts) | 3d | Google OAuth verification needed. |
| **Discord** | `note` (messages), `team` (members) | 3d | Indie-hacker communities. |
| **Drive** | `note` (docs), `source_artifact` (files) | 3d | Founder docs. Google OAuth shared with Gmail. |
| **MCP inbound** (positioning) | `note`, `decision` | 0d | Already shipped; framed as "BBC remembers what you tell Claude." |

### v1.1+ ladder (post-launch)
- Figma (v1.2)
- Calendar / RSS (v1.2)
- Cloudflare D1 / Slack DMs / Twitter or X (v1.3)

### Source → supertag mapping (the killer differentiator)
Every connector ships with an explicit mapping declared in its manifest. Shown on the install drawer. Example for Notion:
```
Notion page property `type: decision`  →  memory_files where type='decision'
Notion page with no `type` property    →  memory_files where type='note'
Notion property `Title`                 →  memory_files.title
Notion property `Date`                  →  memory_files.fields.decision_date
Notion blocks (markdown)                →  memory_files.body
```
Users can override the mapping before first sync (advanced).

### Trust-through-preview first-sync flow
1. Click Install → OAuth → BBC fetches a sample (10 pages/messages/etc.)
2. **Preview**: shows typed-memory rows BBC would create
3. User confirms → full sync runs
4. Proposals land in `/queue` for review
5. Users review/reject before anything commits to memory

Critical for trust: users don't always know what's in their Notion/Slack/Drive.

### Generic Webhook detail
- Each tenant gets a unique URL: `https://{instance}/api/v1/webhooks/{tenant}/{webhook_id}`
- Webhook accepts arbitrary JSON
- User defines a mapping in the install drawer (JSONPath-style expression language): "Field `X` → `title`, field `Y` → `body`, set type = `note`"
- Mapping evaluation in v1.5 is read-only; no scripts, no eval
- Fires → BBC creates memory proposal → queue
- One connector unlocks Zapier, Make, n8n, IFTTT, Hookdeck, any cron job, any custom integration

### Schema additions
```sql
create table tenant_connectors (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references tenants(id),
  connector_id        text not null,
  oauth_credentials   jsonb,                          -- encrypted via BBC_SECRET_ENCRYPTION_KEY
  mapping             jsonb not null,
  sync_state          jsonb,
  active              boolean default true,
  last_sync_at        timestamptz,
  last_sync_status    text,                           -- 'ok' | 'error' | 'partial'
  installed_at        timestamptz default now(),
  installed_by        uuid not null references auth.users(id),
  unique (tenant_id, connector_id)
);
```

## §5 — Retrieval, Loop 3, timeline

### Retrieval (deferred to v1.5 backlog; forward-compat now)
**v1.5 launch ships with NO new retrieval system.** Reasoning:
- Current `brain-summary.ts` handles <500 items per tenant fine
- Anthropic prompt caching makes brain-summary effectively free on repeat queries
- 200K context + caching means tenants up to ~500 medium items work in raw long-context
- Vector search on <100 items (typical demo / new tenant) is noisier than type-bucketed slice

**Forward-compat:**
- Template `retrieval` declaration ships now (§3) — templates can declare needs
- v1.5 just loads everything declared (no semantic ranking)
- When tenants cross ~5K items or recall@10 drops: add **hybrid Postgres** (tsvector + pgvector + RRF in one SQL CTE). Pure Postgres, no new infra.
- When ~50K items: add **cross-encoder reranker** (`bge-reranker-v2-m3`) + **pgvectorscale (DiskANN)** for index scale
- Default embedding model when activated: **EmbeddingGemma-300M via Ollama** (300M, Apache 2.0, OpenAI-API compat, ships in self-host image)

Documented as **ADR-0010 retrieval architecture** (to be written before code, post-launch).

### Loop 3 v1 (at launch)
**Single-tenant recommendations:**
- Skill recommendations from new SKILL.md packs matched against tenant profile (`memory/ops/profiles/*.yaml`)
- Connector recommendations triggered by memory gaps (e.g., 5+ decisions but no GitHub → suggest GitHub)
- Tool/provider recommendations from `memory/ops/providers/*.yaml` based on role usage
- Each recommendation = queue proposal + Library surface card + "Why this?" explanation

**Cross-tenant signal (added in §5 scope expansion):**
- Aggregated anonymized signal: "Companies in your cohort typically have X"
- **Cohort** = same size band + similar role-mix in profiles
- **Privacy floor** (ADR-0010-privacy, to write before code):
  - k-anonymity ≥ 5: no signal computed from fewer than 5 comparable tenants
  - No raw memory bodies cross tenant boundaries
  - Tenant opts in to be in the cohort signal; default off
  - All aggregations server-computed; clients see only aggregated counts/percentages
- **Surface**: second band in Library: "Common at your stage"
- **Effort**: 2 weeks (3d ADR + 5d schema + aggregation pipeline + 4d surface + 2d privacy review)

**Out of scope for v1.5 Loop 3:**
- Self-modifying core (BBC-on-BBC PRs)
- Daily-scan cadence with 3-proposals-per-day cap (ADR-0009 framing)
- LLM-in-the-loop recommendations (v1.5 is pure rules)

## §6 — Timeline

| Week | Theme | Deliverables |
|---|---|---|
| **1** | Foundation + cleanup | PR #1 merged to main. `/graph` deleted. `/marketplace` → `/library` route rename + 308 redirect. Slack OAuth app submitted to review. Demo tenant fixture drafted. Cloudflare deploy verified. Schema migrations for `tenant_skills`, `tenant_connectors`, `recommended_skills` shipped. ADR-0010 (retrieval) + ADR-0010-privacy (cross-tenant) drafted. |
| **2** | Skills layer | SKILL.md parser. Studio template `retrieval` declaration support. Import-from-URL flow. 5 built-ins re-exported as SKILL.md packs. Library Skills tab functional with import. |
| **3** | Connector framework + 3 connectors | Connector framework. Notion + GitHub + Generic Webhook shipped. Trust-through-preview first-sync flow. OAuth credential encryption verified. |
| **4** | More connectors | Linear + Gmail + Discord + Drive shipped (Google OAuth for both Gmail+Drive). |
| **5** | Slack + single-tenant Loop 3 | Slack (assuming review approved by now) + Loop 3 single-tenant recommendation algorithm + Library "Recommended for you" surface. |
| **6** | Cross-tenant Loop 3 + privacy ADR | ADR-0010-privacy finalized. Cohort-aggregation pipeline. "Common at your stage" band. Privacy review (third-party-ish — at minimum a careful re-read with the ADR as checklist). |
| **7** | Library design integration | Apply Claude Design output to Library route. Animations, density, mobile breakpoints. Dogfood end-to-end (signup → install skill → install connector → run studio → review queue). |
| **8** | Landing copy + launch post + docs | Landing page copy refresh for three pillars + Loop 3 tease. Launch post draft (HN + Twitter + blog). Mintlify docs updated for connectors + skills. Demo tenant final polish. |
| **9** | Buffer + launch | Buffer. Final bug bash. Type-check + lint clean. Test coverage pass. Ship Slack if review approved. Public launch. |

**Realistic ship: ~9 weeks from 2026-05-12 = ~2026-07-14 (mid-July 2026).**

## §7 — Risks tracked

| Risk | Mitigation |
|---|---|
| Slack OAuth app review delays past week 9 | Submit week 1 to maximize lead. Escalate week 5. If still pending at launch, ship without Slack; add it as the first v1.1 connector. |
| Connector OAuth complexity eats more than budgeted | Start with Notion (simplest auth) to shape the framework; refactor framework after Notion before building GitHub. |
| Demo tenant fixture feels fake | Dogfood on a real-ish fictional startup with 50+ memories across 6+ types; cross-check every studio + every connector produces good output. |
| Loop 3 v1 over-promises | Algorithm stays deterministic and rule-based. No LLM in the recommendation loop. "Why this?" explanations are template strings backed by observed counts, not LLM-generated. |
| Cross-tenant privacy review surfaces showstoppers | ADR drafted week 1; reviewed week 6 before code lands; if blocked, cross-tenant signal moves to v1.1 with a privacy revisit. |
| Branch divergence from main | Merge PR #1 to main week 1; subsequent work happens on `main` directly or short-lived feature branches. |
| Scope creep | This doc + the writing-plans output are the gate. Anything not in §1–§5 needs an explicit doc amendment + scope decision. |

## §8 — Launch-day artifacts

1. **Hosted demo URL** — pre-seeded fictional startup brain. Runs fast. "Reset demo" button.
2. **AGPL OSS GitHub repo** — public, README + LICENSE + quickstart + `examples/example-tenant/skills/` populated.
3. **Landing page** — refreshed copy: three pillars + Loop 3 tease + cohort/aggregation positioning.
4. **Mintlify docs** — self-host, BYOK, importing skills, building connectors, the SKILL.md spec extension.
5. **Launch post** — HN top-level + Twitter thread + blog post on the user's own site.
6. **30-second demo video** — signup → install Notion connector → run Marketing studio → cited output.
7. **30-second connector-import demo** — paste github URL → SKILL.md parsed → skill installed → run from /studio.

## Open items handed off to writing-plans

The next step is to invoke the `writing-plans` skill to break this design into:
- Per-week deliverables as task lists
- Per-deliverable dependency graph
- Branch + commit cadence (merge PR #1 first, then short-lived branches)
- Test plan per major surface
- Migration plan for the three new tables
- ADR drafts (0010-retrieval, 0010-privacy)

This doc is the **input** to that planning. Changes here require explicit amendment.

## Appendix — Companion artifacts produced this session

- `docs/plans/2026-05-12-library-claude-design-prompt.md` — product-requirements prompt for Claude Design (UX-only)
- This doc — `docs/plans/2026-05-12-bbc-launch-design.md`

## Related references

- Vision memory: `~/.claude/projects/-Users-ocwwp-Desktop-BB-C/memory/project_bbc_full_vision.md`
- ADR-0008: `memory/decisions/0008-three-loop-architecture.md`
- ADR-0009: `memory/decisions/0009-loop-3-scope.md`
- Roadmap: `.planning/ROADMAP.md`
- Main CLAUDE.md: `/CLAUDE.md` (precedence rules)
- Dashboard CLAUDE.md: `apps/dashboard/CLAUDE.md`
- Research outputs (this session; transcripts in /tmp): connector-naming, RAG architecture, agent-template ecosystem
