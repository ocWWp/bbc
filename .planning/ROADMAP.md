# ROADMAP — BBC

> **BBC is the company brain.** Three compounding loops on top of one schema. Loop 1 ingests, Loop 2 acts, Loop 3 improves. v1 ships Loop 1 end-to-end and the first Loop 2 instance; Loops 2-3 are the multi-year roadmap.

The full product vision lives at `memory/decisions/0008-three-loop-architecture.md` (ADR-0008) and a longer narrative in the maintainer's session memory. This doc is the engineering map.

---

## The three loops

```
┌────────────────────────────────────────────────────────────────────────┐
│  Loop 1 — INGEST                                                       │
│  brain-dump → typed memory map → human-reviewed → committed            │
│                                                                        │
│      ◀── feeds ──                                                      │
│                                                                        │
│  Loop 2 — ACT                                                          │
│  role-scoped agents query the brain → produce work for the user        │
│  (Marketing Studio is the first concrete instance)                     │
│                                                                        │
│      ◀── informs ──                                                    │
│                                                                        │
│  Loop 3 — IMPROVE                                                      │
│  BBC watches how the team uses the brain + external signals →          │
│  files improvement proposals back into the same queue →                │
│  proposals target the COMPANY's operations, not just BBC's code        │
└────────────────────────────────────────────────────────────────────────┘
```

Every BBC capability eventually lives in one of these three loops.

---

## Loop 1 — Ingest **(shipped)**

Brain-dumps in, typed memory out. The wedge.

| Phase | What it shipped | Status |
|---|---|---|
| 01 — bootstrap | Repo skeleton, `.planning/`, top-level READMEs | ✅ shipped |
| 02 — memory-schema | Frontmatter spec; one seed per category | ✅ shipped |
| 03 — claudemd-trio | Main + Manager + Distribution CLAUDE.md with precedence rule | ✅ shipped |
| 04 — queue-protocol | `propose.sh` / `accept.sh` / `reject.sh`, append-only audit | ✅ shipped |
| 05 — leaf-bootstrap | `_template`, `bootstrap-leaf.sh`, 8azi-web stub | ✅ shipped |
| 06 — verification | End-to-end walkthrough passes | ✅ shipped |
| H — typed memory schema | 9 supertags (voice, decision, glossary, vendor, product, team, skill, source_artifact, note), memory_relations | ✅ shipped (PR #1) |
| I.20 — multi-source ingestion | text / URL / file adapters, `ingestion_sources` provenance | ✅ shipped (PR #1) |

**Open Loop 1 work** (post-v1):
- Better extractor recall — more supertags caught per dump
- Conflict resolution UI when an extracted memory disagrees with an existing one
- Richer relation kinds beyond the 5 we ship with
- Connector inputs: Notion import, GitHub repo scan, Slack export

---

## Loop 2 — Act **(first instance shipped; expansion in progress)**

Role-scoped agents that have the brain pre-loaded. Each agent serves a role (founder, engineering, marketing, design, …) and operates on behalf of the role-holder or an assignee.

| Phase | What | Status |
|---|---|---|
| J — Marketing Studio | First Loop 2 agent: typed templates, cited output, accept/reject runs, conversational overrides | ✅ shipped (PR #1) |
| K — OSS launch surface | BYOK at `/settings/keys`, `/marketplace` provider directory, Cloudflare deploy path, AGPLv3 README | ✅ shipped (PR #1) |
| L — Landing + docs + MCP | Landing page at `/landing`, Mintlify docs scaffold (`docs/`), MCP server at `/api/mcp` + REST shim at `/api/v1/brain/*`, role-tool-bundle catalog (L1) wired into Studio model resolution | ✅ shipped (uncommitted) |
| L+ — Engineering Studio | Role-3 agent: ADRs, vendor swap proposals, tech-debt reviews. 3 templates. Same unified run viewer as Marketing. | ✅ shipped (uncommitted) |
| L+ — Founder Studio | Role-4 agent: strategic memos, board updates, weekly recaps. 3 templates. | ✅ shipped (uncommitted) |
| L+ — Designer Studio | Role-5 agent: visual specs, brand guideline entries, UI copy passes. 3 templates. | ✅ shipped (uncommitted) |
| L+ — Founders-of-founders agent | Cross-tenant template marketplace, shared playbooks (opt-in) | 🔮 long horizon |

**Open Loop 2 work:**
- Per-role API key scopes (today scopes are `read`/`write`/`admin`; per-role would let a marketing key only see marketing-relevant memory)
- Per-role queue review UX (the marketing agent shouldn't see eng's proposals)
- L1.1 — split `llm-provider` role into `llm-provider-fast` + `llm-provider-quality` so propose/run can resolve different adapters (still blocked on granularity decision)
- Hermes Agent binding as a candidate runtime for any role agent ([memory/decisions/0008-three-loop-architecture.md](../memory/decisions/0008-three-loop-architecture.md))

---

## Loop 3 — Improve **(scoped via ADR-0009; not yet built)**

BBC watches the team use the brain + external signals + benchmark data → files improvement proposals back into the same queue. **Proposals target the company's operations, not just BBC's code.**

This loop is what makes BBC compound. It cannot exist before there are users; the launch (Phase L) is the prerequisite. Scope is now pinned by [ADR-0009](../memory/decisions/0009-loop-3-scope.md): 5 observation classes, 5 proposal classes, per-tenant only in v1, daily-scan cadence, max 3 proposals per scan.

| Phase | What | Status |
|---|---|---|
| M — Self-modifying core | BBC observes Sentry / Linear / its own queue activity → files BBC-on-BBC proposals (broken queries, schema drift, missing memories). Auto-fix bot opens PRs; humans accept via queue. | 🟡 designed (ADR-0008, ADR-0009) |
| M+ — Company improvement engine | BBC observes per-tenant brain usage + acceptance patterns → files proposals about the host company's operations (decision gaps, missing rubrics, vendor consolidation opportunities) | 🟡 designed-in-vision (ADR-0008) |
| M+ — Skill marketplace | Daily pull of new agentic skills/patterns from OSS registries → proposes additions matched to tenant's role mix | 🟡 designed-in-vision |
| M+ — Benchmark provider | Opt-in, aggregated cross-tenant operational signal ("companies your size typically have X documented") | 🟡 designed-in-vision; needs privacy ADR |

**Hard prerequisites before any Loop 3 code:**
- Phase L ship + at least 50 active self-hosters or hosted-demo tenants
- ✅ ADR explicitly scoping which signals BBC may observe per-tenant — done as [ADR-0009](../memory/decisions/0009-loop-3-scope.md)
- Privacy ADR for any cross-tenant benchmark feature (still pending; not blocking Loop 3 v1 since it's per-tenant only)

---

## Designed-but-not-built primitives (cross-loop)

These predate the three-loop framing. Each fits inside one loop; see notes.

- **F1 — Tool credibility ranker** [DESIGNED, not built] — Five-stage pipeline (profiles → hard-constraint filter → trust scoring → ranker formula → learning loop). **Belongs to Loop 2:** the role agents need to pick the right tool/skill for a job. Build sub-phases: F1-build-1..4.
- **F2 — OOP skill inheritance** [DESIGNED, not built] — Abstract skill bases, `extends:`, override modes (`replace`/`add`/`remove`), polymorphic resolution by caller layer. **Belongs to Loop 2:** role agents specialize their skill set; this is the type system for that. Build sub-phases: F2-build-1..4.
- **F3 — Shadow brain failover** [DESIGNED, not built] — Versioned JSONL log + heartbeat + 6-step promotion. **Belongs to Loop 1:** the ingest path's reliability story. Build sub-phases: F3-build-1..5.
- **F4 — Provider interface** [DESIGNED, not built] — Roles + adapters + bindings, no-vendor-names-in-prose, decommission ceremony. **Belongs to all three loops** — every external dep gets a binding. Build sub-phases: F4-build-1..4.

---

## Migration phases (operations, not product)

Migrate existing 8azi repos onto BBC. Separate from the three-loop work.

- **M1 — 8azi-web as leaf** — point `distribution/8azi-web/` at the real repo
- **M2 — 8azi-api as leaf** — same for the API
- **M3 — 8azi-market as leaf** — new workstream slots in via `_template`

These get done when the maintainer's own company needs them. Not on the v1 critical path.

---

## What's next, in order

1. **Merge PR #1** (33 commits: Phases H, I.20, J, K, Cloudflare swap, smoke fixes, ADR-0008/roadmap)
2. **Phase L — Landing + docs + Show HN** — most of the work is content (landing page + Mintlify), not code
3. **Phase L+ — Second role agent** — pick founder or engineering, build it as the proof that Loop 2 is a pattern, not a special case
4. **Phase M scope ADR** — formalize Loop 3 architecture before any code
5. **Phase M.1 — Self-modifying core** (BBC fixes BBC) — narrower target, lower risk than full company-improvement
6. **Phase M.2 — Company improvement proposals** — the real Loop 3 wedge

---

## Open questions still to resolve

| Loop | Question | Default if unanswered |
|---|---|---|
| 1 | Conflict resolution when extractor produces a memory that contradicts an existing one? | Surface side-by-side; reject by default; require human override. |
| 1 | Wikilinks across memory files — Tana-style? | Yes, already in via `memory_relations` schema. Tighten link picker UX in L+. |
| 2 | One MCP server per role, or one server with per-role API key scopes? | One server, per-role scopes (already in `api_key_scope` enum). |
| 2 | Per-tenant cost cap on hosted-demo Anthropic credits? | Soft cap via env var (`BBC_DEMO_DAILY_LIMIT_USD`); hard fail with BYOK nudge. |
| 3 | Privacy floor for cross-tenant benchmark data? | Opt-in only, k-anonymity k≥5, no raw memory bodies cross tenant boundaries — needs ADR. |
| 3 | Who owns Loop 3 proposals — admin role only, or any member? | Default admin-only; revisit if power users want delegation. |
