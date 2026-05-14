# BBC — Persona-Aware Navigation, Moat, and Launch Surfaces (Design)

**Date:** 2026-05-13
**Status:** Brainstorm complete — ready for implementation plan
**Authors:** Oscar (product) + Claude (brainstorm partner) + Codex (adversarial review) + web research
**Context:** Pre-launch audit (`.gstack/qa-reports/qa-report-bbc-dashboard-2026-05-13.md`) found that BBC's landing page and in-app surfaces fail the IQ-80 non-technical founder test, and that invited teammates see the same dense nav as admins — confusing them within 60 seconds. This design fixes both, aligns the self-improvement promise with what v1.5 actually ships, names BBC's moat in one sentence, picks Hermes Agent as the post-launch agent runtime, and locks the off-the-shelf security baseline.

---

## What BBC actually is (one paragraph)

A web product (Next.js on Cloudflare Workers). Open source, AGPLv3, self-hostable; hosted demo available at maintainer expense. Users plug in their own AI provider keys (BYOK) at `/settings/keys` — BBC never holds credit, never bills. Data flows two ways: **inbound** via the Connectors framework (Notion, GitHub, Drive, Gmail, Linear, generic webhooks) that pulls company data into the typed brain through the human-reviewed queue; **outbound** via the MCP server at `/api/mcp` + REST shim at `/api/v1/brain/*` that lets any AI tool (Claude, Cursor, ChatGPT) read the same brain with cited responses. In-app, the brain powers 5 role-shaped Studios — marketing, eng, founder, designer, support — each pre-loaded with company memory and pre-equipped with the role's tool bundle. Every change to the brain (from humans, agents, or BBC itself) passes through the same Accept/Reject queue. No silent autonomy.

---

## The moat, in one sentence

> **BBC gives every role in your team an AI agent that's pre-loaded with your company's typed brain, pre-equipped with role-shaped tools, and gets sharper daily as BBC fetches and assesses new skills + tools from the open AI ecosystem. You own all the credentials. Agents talk to each other through a swappable runtime. Every change to your brain is human-reviewed.**

The five-layer moat, in priority order:

1. **Typed memory + queue gate (Loop 1).** Notion has typed nodes but no AI structure. Claude Projects / Glean / NotebookLM have AI context but no typing and no review gate. BBC has both. **Wedge.**
2. **Role-tool bundles + F4 bindings.** Per-role profiles (`memory/ops/profiles/*.yaml`) with curated default tool stacks, swappable per tenant. Vendor-agnostic, role-specialized, outcome-ranked. **Unfair advantage vs Custom GPTs / Claude Projects.**
3. **OOP skill inheritance (F2).** Skills extend abstract bases; tenants specialize via `replace`/`add`/`remove`. Not flat — a real type system for prompts.
4. **Daily skill discovery + propagation (Phase N, new).** Crawl Reddit / X / GitHub releases / npm / MCP registries → trust-assess via F1 ranker + injection sandbox → propagate good ones to tenant Library → if user has BYOK key for premium tools (Higgsfield, Replicate, premium MCPs), route the agent through their key. **Web research confirmed (May 2026): nobody ships the full loop.** Components exist (PulseMCP, MCP Skills, agentskill.sh, x402); nobody glues them. Real gap.
5. **MCP + REST.** Every AI tool reads the same brain. One source of truth. Day-1 utility.

Plus AGPLv3 + self-host: trust hygiene, not differentiation, but absence would kill the technical sale.

---

## Problem

Three persona leaks, in priority order:

1. **Persona A (non-technical founder, cold landing).** Current landing copy is engineer-fluent ("nine supertags · one Postgres row per memory · MCP · AGPLv3"). A non-technical person closes the tab in 20 seconds.
2. **Persona B (invited teammate — marketer / designer / eng).** Lands on the same dashboard as the admin. Sees nav routes (`/queue`, `/memory`, `/bindings`) that mean nothing to them. No clear "where do I do my job" pathway. Retention risk = highest.
3. **Persona C (admin / founder running BBC).** Current product roughly serves them. Not the leak.

Plus: the landing page promises Loop 3's dramatic form ("the brain quietly files proposals back about what your company should do next"). v1.5 actually ships a rule-based recommender. The gap is a trust burner on day 2.

---

## The six-stage user arc

### Stage 1 — Cold founder lands on `/landing`

In 5 seconds: *what is this, for whom, why now*.

- **Hero copy (replaces current):** "Your AI doesn't know your company. BBC fixes that. One shared brain. Every AI tool — Claude, ChatGPT, Cursor, your role-specific assistants — cites the same answers."
- **Hero visual:** 4-second loop. *Before:* AI: "who's our designer?" → "I don't have access to your team data." *After:* AI: "Sarah Lin, per `team/sarah.md`, last decision 3 days ago."
- **Primary CTA:** "Try the demo →" (hosted, free, no infra).
- **Secondary CTA:** "Self-host →" (kept for the technical buyer).
- **Below the fold:** the technical story (supertags, Postgres, MCP, AGPLv3) stays — that's where Persona C reads.
- **Self-improvement framing:** "BBC learns. It watches what your team actually accepts and rejects, and suggests improvements you can approve with one click." (Vague-but-true; doesn't name version.)

### Stage 2 — Founder seeds the brain

`/welcome` becomes one task, one screen.

- **Top:** "Acme's brain is empty. Paste your stuff to get started."
- **Center:** one big paste box.
- **Below:** "or → import from Notion · Drive · GitHub" (connector buttons; show only those wired).
- **After paste:** extractor runs → "I found 12 decisions, 5 vendors, 3 people, your voice register. Want to review them?"
- **Review screen:** clean card grid. "Accept all" + per-card accept/reject.
- **End state:** "Your brain has 20 memories. **Spin up your first Studio →**" routes to `/studio` picker.

### Stage 3 — Founder invites their team

- `/settings/team` → invite form: email + role dropdown (marketing / eng / designer / founder / viewer).
- Email: "Oscar invited you to Acme's brain on BBC. Your role: Marketing. [Join Acme →]" — tenant-branded.
- Invitee lands on tenant-aware sign-in that already knows where to send them post-auth.

### Stage 4 — Teammate's first 30 seconds (retention-critical)

**Top-level nav for teammates: three routes only.**

| Route | What it is | Why |
|---|---|---|
| **Studio** | Default landing. The role-shaped AI workspace. Prompt-first / hybrid (prompt box + template chips + recent drafts beneath). The Studio's main surface *is* conversational — there is no separate "AI Chat" panel. | The teammate's whole job lives here. |
| **Brain (read-only)** | A browseable, filterable view of all memories (voice / decisions / vendors / team / etc). Teammate can read any memory and "Flag this" (files a proposal to admin queue). Cannot edit. | Kills the epistemic anxiety of "where does my draft's answer come from?" — they can click any citation chip and see the source. Codex called this out as load-bearing. |
| **Inbox** | Two explicit channels visible at the top: *Mentions & comments* (people stuff — urgent), *From BBC* (admin replies on your flags + Loop-3 suggestions if admin opted you in). | One inbox keeps nav tight; two channels prevent the "Queue 2.0 guilt pile" failure mode. |

**Studio front-door shape (hybrid prompt-first):**

```
+-------------------------------------------+
|  Marketing Studio  ·  Acme                |
+-------------------------------------------+
|  +-------------------------------------+  |
|  |  What would you like to write?      |  |
|  +-------------------------------------+  |
|                                           |
|  Start from: [Tweet thread] [LinkedIn]    |
|             [Blog] [Launch] [Reel] [+]    |
|                                           |
|  ---                                      |
|  Recent drafts:                           |
|   · 'iOS launch tweet' (yesterday)        |
|   · 'Pricing page LinkedIn' (Mon)         |
+-------------------------------------------+
```

**Per-studio role-shaping (shared skeleton, different chrome).** Same skeleton across all 5 Studios: same nav, same prompt position, same draft layout, same citation chip style. Different chips, different sidebar content, different defaults, different colors / icons. This prevents the "five mediocre products" risk while still letting Marketing Studio *feel* different from Engineering Studio.

**Citation chips.** Each chip in a draft is clickable (→ Brain page for that memory) and has a "Flag this" inline button (files a proposal). The Brain page is the *only* memory inspection surface for teammates.

**What teammates never see:** `/queue`, `/bindings`, `/settings/team`, `/settings/keys`, `/library` (templates accessible inside Studio via a `+` menu; skills + connectors are admin-only). Loop-3 suggestions are admin-only by default — admin can opt teammates in per-tenant.

### Stage 5 — Daily rhythm

The default route `/` is **role-aware**:

- **Teammate `/`** → redirects to `/studio/<their-role>`.
- **Admin `/`** → renders **Home dashboard**:
  - Brain health: *"47 memories · 3 awaiting review · last seed 4d ago"*
  - Queue summary: pending proposals, inline Accept/Reject
  - Loop-3 today: 0-3 suggestions (post-M.1)
  - Activity from team: who shipped what, who flagged what

**Visit cadence:**
- Teammate: daily, 5-20 min, lives in Studio.
- Admin: ~weekly, longer sessions, focused on governance.

### Stage 6 — Self-improvement made visible

**v1.5 surface (what ships at launch):**
- `/library`'s "Recommended for you" band — rule-based skill + connector suggestions (already built per W4-2..W4-5).
- Queue rejection memory: when admin rejects a Loop-3-style suggestion, BBC stores the reason and does not re-propose for 14 days.

**Post-launch (Phase M.1 + M.2):**
- Daily-scan Loop 3 produces `prop_loop3_*` items in admin queue, max 3/day per tenant.
- Cross-tenant benchmark proposals require a privacy ADR (deferred per ADR-0009).

**Landing copy stays version-agnostic** ("BBC learns. Watches what your team accepts/rejects, suggests improvements you approve.") — true for v1.5, scales to M.1/M.2 without rewrite.

---

## Adversarial review (codex)

Codex consult run on the initial recommendation (Studio · Inbox · Library · Help). Verdict surfaced six load-bearing concerns:

1. Hiding `/memory` increases epistemic anxiety — citation chips alone are not enough. **Fixed:** added Brain (read-only) as a teammate route.
2. "Help" as a top-level route will rot into a junk drawer. **Fixed:** dropped from nav; contextual help everywhere, `?` icon in corner.
3. Linear/Cursor analogy is half-broken — those are user-owned workspaces; BBC is organizational authority mediated by AI. **Acknowledged:** added Brain inspection, kept role separation.
4. One Inbox becomes Queue 2.0 (undifferentiated guilt pile). **Fixed:** explicit two-channel split inside Inbox.
5. Role-shaped chrome could produce five mediocre products. **Fixed:** shared skeleton + role-specific chrome (not "different everything").
6. Loop-3 in teammate Inbox = governance creep. **Fixed:** admin-only by default; teammate opt-in.

Verdict survives the review with revisions. Load-bearing assumption: *Persona B mostly wants to produce role-specific work, not inspect or govern the brain.* If early users mostly ask "where did this come from?" → Brain (read-only) catches it. If they ask "can I change this?" → that's a future ADR.

---

---

## The AI layer (v1.5 honest + Phase N target)

**Today (v1.5):** every Studio calls `resolveRoleTool("llm-provider")` and routes through the tenant's binding. Default binding `memory/ops/providers/anthropic-claude-sonnet.yaml` = Claude Sonnet 4.6 for runs, Claude Haiku 4.5 for cheap propose-steps. BYOK at `/settings/keys`. The Studios are **structured prompts → Claude → cited response**, one-shot. They are NOT autonomous agents and they do NOT talk to each other yet.

**This is fine for launch.** Loop 1 + the prompt-based Loop 2 + the typed brain + MCP + REST is the wedge. Multi-agent is the second chapter.

**Phase N (post-launch, the moat phase) introduces:**

1. **`agent-runtime` role contract** in F4, distinct from `llm-provider`. Studios that need autonomy (eng opens a real PR, founder runs an outreach campaign) bind an `agent-runtime`; one-shot Studios stay on `llm-provider` only.
2. **Default `agent-runtime` binding: Hermes Agent** ([github.com/nousresearch/hermes-agent](https://github.com/nousresearch/hermes-agent), MIT, Nous Research, v0.9). Reasons: aligned philosophy (persistent memory + skills that self-improve from experience), BYOK across many model providers (matches BBC's vendor-neutral stance), MIT/OSS matches AGPL ethos. **We do NOT build a native runtime.** Less maintenance, not more.
3. **Pin to a specific Hermes version.** Pre-1.0 risk is real; mitigation is the F4 binding layer — if Hermes stalls, swap to LangGraph by editing one YAML.
4. **First inter-agent capability:** Marketing-agent → Designer-agent thumbnail handoff. Proof the substrate works.
5. **Agents read the brain via the same MCP server** other tools use. The brain is one source of truth for human users, external AI tools, and BBC's own internal agents.

**Daily skill-discovery + auto-routing of premium tools** lands in Phase N too. Plain English:

> BBC scans Reddit / X / GitHub releases / npm / MCP registries every day. The F1 ranker + injection sandbox assess each new skill or tool. The good ones land in your tenant's Library. The bad ones get blocked. If a tool is premium (Higgsfield, Replicate, a paid MCP server) and you've already plugged your own API key at `/settings/keys`, BBC routes the agent through your key. **BBC never holds credit, never charges. The user owns every credential.** Per ADR-0007 (no monetization in v1).

---

## Security — adopt off-the-shelf, do not reinvent

BBC is the brain of the company. A breach is catastrophic. Same principle as the agent runtime: **bind, don't build.** Use best-in-class security tools rather than rolling our own primitives.

| Layer | Tool | Status in BBC today |
|---|---|---|
| Network edge | Cloudflare WAF + OWASP Core Rule Set + rate limit + bot management | We're on CF Workers — turn the WAF rules on |
| Database row access | Supabase RLS | **Already enforced** — every `memory_files` row gates on `tenant_id` |
| Secrets at rest | `BBC_SECRET_ENCRYPTION_KEY` + libsodium | **Already there** at `apps/dashboard/src/lib/encryption.ts` |
| Secrets rotation | Doppler or 1Password CLI | Not adopted — add post-launch |
| Static analysis | Semgrep + GitHub Advanced Security | Not adopted — free for OSS, add to CI |
| Dependency vulnerabilities | Dependabot + Socket | Dependabot likely on; add Socket for supply-chain |
| Supply chain integrity | OpenSSF Scorecard + Sigstore | Not adopted — public OSS hygiene |
| Runtime audit | Cloudflare audit logs + Supabase logs | **Already on** |
| Auth | Supabase Auth + invite-only signup trigger | **Already enforced** — `tenant_invitations` blocks uninvited signups |
| PII / data scope | ADR-0009 Loop 3 privacy floor | **Already in spec** — no PII in Loop 3 proposal bodies |
| Disclosure | `.well-known/security.txt` + `SECURITY.md` | Not set up — add before launch |

**Pre-launch security checklist (under 1 day total, off-the-shelf, free):**

1. Add `.well-known/security.txt` + `SECURITY.md` with disclosure policy (15 min).
2. Enable Cloudflare WAF + OWASP Core Rule Set (30 min).
3. Add Semgrep CI workflow (`semgrep ci`, free OSS tier) — catches SQL injection, XSS, auth bypass patterns (1 hr).
4. Add Socket as a dependency-PR commenter (free for OSS, 15 min).
5. `npm audit` + Dependabot sweep, fix anything CVSS≥7 before launch (1–3 hrs).
6. Threat-model session — write `docs/security/THREAT-MODEL.md` documenting STRIDE for each surface (queue, Studio runs, MCP server, REST shim, ingest). 2 hrs.
7. Add OpenSSF Scorecard to the repo (15 min).

**Structural advantage:** BBC's "no silent autonomy" principle (Main `CLAUDE.md` #6) is itself a security guarantee. Every change to typed memory is human-reviewed via the queue. There is no path for an attacker (or a hallucinating agent) to write to the brain without a human gate. That property is rare in AI products and worth naming.

---

## Loop 3 gains a sixth observation class — security drift

Per ADR-0009, Loop 3 observes queue activity, memory access, run accept/reject ratios, bindings churn, ingestion coverage. Add a sixth class:

**Security drift.** Plain examples:
- "Your `anthropic` API key was added 90 days ago. Rotate?"
- "Skill `image-gen-v2` triggered the prompt-injection sandbox 4 times this week. Block?"
- "External account `notion-acme` has had 3 auth-expired errors. Re-auth or remove?"
- "Cloudflare WAF blocked 1,200 requests from one IP this week. Review?"

Same Loop 3 discipline: BBC observes, proposes via the queue, human accepts or rejects. Security becomes a self-reinforcing layer of the same loop. Per-tenant only in v1; cross-tenant security benchmarks deferred to a privacy ADR.

This addition needs an amendment to ADR-0009 before Phase N.1 ships.

---

## Out of scope (deferred)

- Team chat / comments on drafts (mentioned as a "communication surface" — handled via Inbox channels for v1; richer collaboration TBD).
- Sandbox sharing of brain (give an outsider a scoped peek) — TBD.
- Mobile-shaped layouts — separate audit/work pass.
- The `/welcome` redesign past the paste-box single-task version — handled in this design but full visual treatment lives in `/design-shotgun` per audit phase 3.

---

## Implementation surfaces (for `writing-plans`)

This design implies code changes across roughly these areas:

1. **Landing page rewrite** (`apps/dashboard/src/app/landing/_components/Hero.tsx` + `data.ts` + `VsVector.tsx` + `Walkthrough.tsx`) — new hero copy, new visual, primary CTA flip, Loop-3 copy update.
2. **Role-aware default route** (`apps/dashboard/src/middleware.ts` + a new `/home` route) — admin lands on dashboard; teammates land on their Studio.
3. **Role-aware nav** (`apps/dashboard/src/components/AppNav.tsx`) — conditional rendering based on `actor.role`. Teammates see 3 routes, admin sees full set.
4. **Brain (read-only) route** (`apps/dashboard/src/app/brain/page.tsx` + a new `/brain/<id>` view) — re-uses memory queries with `requireRole(viewer)`. "Flag this" file-a-proposal action.
5. **Studio shell refactor** — shared skeleton + per-role chrome. Each studio gets its own chips/sidebar/colors. Hybrid prompt-first layout replaces current template-grid.
6. **Inbox route** (`apps/dashboard/src/app/inbox/page.tsx`) — two channels: mentions/comments + from-BBC.
7. **Admin Home dashboard** (`apps/dashboard/src/app/home/page.tsx`) — brain health, queue summary, Loop-3 today (placeholder until M.1), team activity.
8. **`/welcome` simplification** — collapse current 5+ zones into single paste-or-import task.
9. **Citation chips clickable** — link to `/brain/<memory_id>` from inside draft renders.
10. **Loop-3 admin/teammate visibility flag** — new `tenant_settings.loop3_teammate_visibility` column or scope flag on `tenant_members`.
11. **Security baseline pre-launch** — `.well-known/security.txt`, `SECURITY.md`, Cloudflare WAF rules, Semgrep + Socket CI workflows, OpenSSF Scorecard config, `docs/security/THREAT-MODEL.md`. Mostly config + docs, not code.
12. **(Phase N) `agent-runtime` role contract + Hermes Agent binding** — add `memory/ops/provider-roles/agent-runtime.yaml` + `memory/ops/providers/nous-hermes-agent.yaml` + binding plumbing. Slots into the existing F4 layer.
13. **(Phase N) Daily skill-discovery crawler** — new service that scans Reddit / X / GitHub releases / npm / MCP registries; existing F1 ranker + skill-injection sandbox assess output; results propagate to tenant Library via existing install path.
14. **(Phase N) BYOK premium-tool routing** — agent runtime reads tenant's `secrets` table to find user-provided premium-tool keys (Higgsfield, Replicate, premium MCPs) and routes through them. No new payment infrastructure.

Most v1.5 items are surface-level (UI + routing). The structural changes are (3) role-aware nav, (4) Brain read-only route, and (5) Studio shell refactor. Items 12–14 are Phase N and post-launch.

---

## Sequencing recommendation

**Pre-launch (must ship in v1.5):**

1. **Security baseline** (off-the-shelf — security.txt, Cloudflare WAF, Semgrep, Socket, npm audit, threat-model doc, OpenSSF Scorecard) — under 1 day total.
2. **Landing rewrite** (Stage 1) — 1-2 days, content-heavy.
3. **Role-aware nav + default route + Brain (read-only)** (Stage 4 core) — 2-3 days. The retention play.
4. **Studio shell refactor — shared skeleton + per-role chrome** (Stage 4 polish) — 5 sessions of `/design-shotgun`, one per studio, then implementation. Largest line-of-code change.
5. **`/welcome` simplification** (Stage 2) — 1 day.
6. **Admin Home dashboard** (Stage 5) — 2 days.
7. **Inbox route** (Stage 4 + Stage 6 surface) — 2 days.
8. **Citation chips clickable + Flag-this** (Stage 4 + Stage 6 plumbing) — 1 day.
9. **Loop-3 visibility flag + admin-opt-in surface** (Stage 6) — 1 day.

Total v1.5 polish: ~2-3 weeks, parallelizable across UI vs route plumbing.

**Post-launch (Phase N — the moat phase):**

10. **`agent-runtime` role contract in F4** + bind Hermes Agent as default. Pin version.
11. **First inter-agent capability:** Marketing-agent → Designer-agent thumbnail handoff.
12. **Daily skill-discovery crawler** — Reddit / X / GitHub releases / npm / MCP registries. Drop into existing F1 ranker + skill-injection sandbox. Propagate good ones into tenant Library.
13. **BYOK premium-tool routing** — when user has plugged a Higgsfield / Replicate / paid-MCP key, agents route through their key. No BBC-side payment.
14. **Loop 3 security-drift observation class** — amend ADR-0009 first, then ship the observation + proposal types.

---

## Related

- `.gstack/qa-reports/qa-report-bbc-dashboard-2026-05-13.md` — the audit that surfaced these problems.
- `memory/decisions/0007-oss-first-agpl-deferred-commercialization.md` — AGPL, no monetization, BYOK only.
- `memory/decisions/0008-three-loop-architecture.md` — three-loop framing.
- `memory/decisions/0009-loop-3-scope.md` — what Loop 3 may observe and propose; this design proposes amending it to add the "security drift" observation class.
- `~/.claude/projects/-Users-ocwwp-Desktop-BB-C/memory/project_bbc_full_vision.md` — the canonical product vision.
- `docs/plans/2026-05-12-bbc-launch-plan.md` — the week-by-week launch plan; this design slots in as a redirected scope of W8 (landing) + the audit phase-3/4 work + a new Phase N for the moat capabilities.
- [github.com/nousresearch/hermes-agent](https://github.com/nousresearch/hermes-agent) — proposed default `agent-runtime` binding for Phase N.
- [pulsemcp.com](https://www.pulsemcp.com/) · [mcpskills.io](https://mcpskills.io/) · [agentskill.sh](https://agentskill.sh) — closest existing pieces of the daily-skill-discovery loop; BBC's Phase N glues them with the F1 ranker and per-tenant propagation.
