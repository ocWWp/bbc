---
id: mem_2026-05-12_adr-0008-three-loop-architecture
type: decision
scope: org
layer: main
source: human:oscar
created: 2026-05-12T00:00:00Z
updated: 2026-05-12T00:00:00Z
owning_layer: main
tags: [adr, bbc, architecture, vision, harness-engineering, three-loops, phase-l, phase-m]
status: accepted
supersedes: []
---

# ADR-0008: Three-loop architecture (Ingest → Act → Improve)

## Context

Through Phases A-K, BBC's product framing drifted between several descriptions: "markdown brain protocol", "memory layer for AI agents", "company knowledge structured for agents". Each is true but partial. On 2026-05-12, during the Phase J/K smoke walkthrough on staging, the maintainer (Oscar) articulated the full vision in one paragraph (paraphrased):

> BBC is a place users brain-dump into and BBC structures the brain map for them and for the agents to query. For different roles users can spin up respective agents — either for the user to use or for an assignee to use — so the agents have the company's stuff embedded (decisions, voice, vendors, glossary, anything) plus the best skills fetched daily. BBC also gets improved over time with user analytics and a general signal of how companies operate, and the user's company actually grows faster with BBC helping, because it's more AI-native and would improve over time, since BBC will have improvement proposals for the company.

That paragraph contains three discrete loops:

1. **Ingest** — unstructured input becomes typed, human-reviewed memory
2. **Act** — role-scoped agents query the memory and produce work for the user or an assignee
3. **Improve** — BBC observes how the team uses the brain + external signals + benchmark data and files improvement proposals back into the queue, targeting the host company's operations (not just BBC's own code)

These are not three products. They are three loops on top of one schema. The same `memory_files` table feeds all three. The same `queue_items` + `accept_proposal()` flow gates all three. The same `bindings` table parameterizes which provider plays which role for any of them.

This ADR makes that framing canonical, so every future phase plan can answer "which loop does this serve?" and "what does this loop's verify/correct gate look like?"

## Decision

Adopt the three-loop framing as BBC's product architecture. Reorganize the roadmap, the README narrative, and future phase plans around it.

**Loop 1 — Ingest.** Brain-dumps (text / URL / file) become typed memory entries. Status: shipped end-to-end (Phases H + I.20 + J's welcome flow).

**Loop 2 — Act.** Role-scoped agents read the brain and produce work. Each role template (founder, admin, engineering, marketing, design, viewer) eventually gets its own agent. Status: first instance shipped (Marketing Studio, Phase J). Expansion to other role agents is Phase L+ work.

**Loop 3 — Improve.** BBC observes operational signal + external skill registries + opt-in cross-tenant benchmarks. BBC files proposals back into the queue. Proposals target the host company's operations (decision gaps, missing rubrics, vendor consolidation, hiring patterns, etc.). The Sentry/Linear-driven "BBC fixes BBC's own code" loop is one narrow instance of this; the general case is BBC proposing changes to the company that runs BBC. Status: not built. Phase M.

## Mapping to harness engineering

The four jobs of a harness, per [[reference_harness_engineering]] — **constrain, inform, verify, correct** — distribute across the loops:

| Job | Loop 1 | Loop 2 | Loop 3 |
|---|---|---|---|
| Constrain | RLS, owning_layer, tenant scope | per-role API key scopes, role_templates | proposals MUST land in the existing queue; no out-of-band writes |
| Inform | 9 typed supertags + memory_relations | role-agent prompts read the brain map | observation buffers + external skill registries + (opt-in) benchmark data |
| Verify | human-reviewed accept at the queue | accept/reject per Studio run | accept/reject per improvement proposal — same gate as user proposals |
| Correct | extractor revisions next dump | re-run with edited inputs / overrides | the host company implements the proposal → BBC observes the result → next round of proposals takes that into account |

Loop 3's "correct" is the longest feedback cycle and the most valuable. It's also the most dangerous if the constrain layer leaks. Every Loop 3 capability must answer "what stops this from running away?" with a concrete primitive (queue gate, audit log entry, kill-switch) before it lands.

## Implementation order

1. **v1 (PR #1)** ships Loop 1 fully + the first Loop 2 agent. Already done; awaiting merge.
2. **Phase L — Landing + Show HN.** Story tells the three-loop arc; people grok the wedge (Loop 1) and the compounding (Loops 2-3 promised in roadmap). No new code surface beyond the landing site.
3. **Phase L+ — Second role agent.** Ship the founder or engineering agent. Proves Loop 2 is a pattern, not a special case. This is the "BBC is a *platform* for role agents" moment.
4. **Phase M scope ADR.** Before any Loop 3 code, write a follow-up ADR scoping which signals BBC may observe per-tenant, where the kill-switch lives, what cross-tenant data (if any) crosses the privacy floor.
5. **Phase M.1 — Self-modifying core.** Narrow target: Sentry alerts + Linear tickets against BBC itself + auto-fix bot opens PRs against `main` of this repo. All proposals still flow through the queue; no autonomous merge. This is "BBC fixes BBC."
6. **Phase M.2 — Company improvement proposals.** The real Loop 3 wedge. BBC proposes changes to the host company's operations. The user's company gets better the longer BBC runs.

## Consequences

### Governance

- **No silent autonomy stays absolute.** Every Loop 3 proposal — including BBC-on-BBC ones — lands in the existing queue and waits for a human accept. This is non-negotiable and re-states CLAUDE.md principle #6 against the higher-autonomy scope this ADR opens.
- **Loop 3 needs a new memory supertag**, probably `incident` or reuse `note`, to represent observed-but-not-yet-acted operational signal. Captured in `memory_files` like everything else.
- **Bindings table grows** with `error-observer`, `task-tracker`, `code-author`, `skill-marketplace`, `benchmark-provider` roles. Hermes Agent is a candidate `code-author` (and possibly other `*-agent` roles). None of these are bound in v1.

### Roadmap

- **The old phase-letter-suffix scheme (A-Z) is misleading** going forward. Better to label phases with their loop number: L1.x, L2.x, L3.x. Keep existing phase letters for historical work (H, I.20, J, K).
- **F1-F4 don't go away.** F1 (credibility ranker) and F2 (OOP skill inheritance) become Loop 2 building blocks. F3 (shadow brain failover) is Loop 1 reliability infrastructure. F4 (provider interface) underwrites all three loops.

### Risk

- **Loop 3 is high-trust.** Bad proposals against the host company (especially around vendor choices or hiring) could cause real damage if accepted without scrutiny. The queue gate is the protection; the proposal voice must be diagnostic, not directive. Phase M's UI work probably includes a "BBC observed X — consider Y" framing that explicitly invites disagreement.
- **Cross-tenant benchmark data is the most monetizable feature** ever conceived for BBC. Under ADR-0007 (no monetization in v1) it must ship free. If the maintainer's status changes and a commercial path opens, this is where the line will be drawn between OSS and paid. Worth capturing in a future ADR before that line gets blurry.
- **Solo operator constraint.** Every Loop 3 capability must work for ONE person to maintain. No "platform team" requirements.

## Related

- [[0001-bbc-v1-scope]] — original V1 scope; this ADR extends rather than replaces
- [[0004-two-deployment-modes]] — file-mode + DB-mode coexist; both must support all three loops
- [[0006-marketing-studio-architecture]] — the first Loop 2 instance
- [[0007-oss-first-agpl-deferred-commercialization]] — the visa-driven OSS pivot that makes the Loop 3 monetization question deferred-not-foreclosed
- `reference_harness_engineering` (session memory) — the design article that maps cleanly onto this framing
- `project_bbc_full_vision` (session memory) — the maintainer's full vision paragraph that prompted this ADR
