# BBC user-facing product — design doc

**Date:** 2026-05-10
**Status:** Approved for implementation
**Owner:** Oscar (@ocwwp)
**Next:** Implementation plan via `superpowers:writing-plans` skill

---

## 1. Context

BBC has shipped V1 + F1–F4 + the recent productization sweep (multi-tenant DB, RLS, RBAC, invitations, role templates, MCP server, API keys, self-serve signup, Docker self-host, example tenant). Today the dashboard is wired but there is no acquisition surface, no daily-loop reason for a stranger to come back, and no payment path.

This design takes BBC from "code that runs" to "thing strangers sign up for and pay for." It locks the strategic shape, the product anatomy, and the build sequence for v1.0 launch.

---

## 2. Strategic decisions (locked)

| Decision | Value |
|---|---|
| Wedge | **Brain for AI agents.** Sells a shared, governed memory layer that AI agents read/write through MCP, with humans in the review loop. |
| Buyer | **Founder of a 1–10 person AI-native startup.** Technical, budget-conscious, feels the "my agents don't know our voice/vendors/decisions" pain personally. |
| Vision | **AI-staffed company OS.** Each role gets an AI worker grounded in the company brain; humans approve every action via the queue; agents level up; external activity (GitHub, Slack) flows into BBC. |
| v1 role | **Marketing agent.** Visible output, voice spec already in schema, strong wow factor. |
| Aha moment | **Brain dump → BBC structures it → BBC proposes back via the queue.** Dogfoods the proposal protocol on day 1. |
| Daily loop | **All three:** review proposals + add memory manually + watch audit log. Surfaced as a unified dashboard inbox. |
| Onboarding | **Three paths**, routed by what the founder has: brain dump (default), wizard (8 structured questions), upload docs. |
| Monetization | **Flat workspace fee + LLM/tool credits.** Free / $29 Solo Founder / $129 Startup / $399 Scale. "AI staff" mental model. |
| Tool model | **Dynamic providers via existing F4 bindings.** Free tools BBC uses freely; paid tools either BBC-account (credit passthrough +0–10%) or BYO key. Marketplace surface proposes provider swaps. |
| Design direction | **"Brain + Studio."** User picks light/dark/system. Brain/Studio duality is expressed via density + accent color + typography + motion, not light vs dark. |
| Brand | **BB-C = Big Brain Company.** Hero headline: *"Build a Big Brain Company."* |
| Domain | **bbc.tools** (already locked in Phase 0). |

---

## 3. Product anatomy

**13 routes for v1.0**, split into public and authenticated. Each surface has a theme behavior (both light and dark ship — no theme is forced per surface).

### Public (5)
| Route | Notes |
|---|---|
| `/` landing | Dark hero → light mid → dark CTA rhythm |
| `/pricing` | Linear/Vercel comparison table style |
| `/docs` | Hosted Mintlify at docs.bbc.tools |
| `/auth/*` (signin / signup / self-serve / callback / invite) | Magic link primary, Google OAuth secondary |
| `/terms`, `/privacy` | Required for SaaS |

### Authenticated (8)
| Route | Notes |
|---|---|
| `/welcome` | 3-step onboarding (brain dump → structure → first queue) |
| `/dashboard` | Home — the queue triage + activity tabs |
| `/queue/[id]` | Proposal review modal — 3-column: agent draft / brain refs / impact |
| `/studio/marketing` | Task-first agent room (the v1 hero feature) |
| `/memory` | Notion-style typed-object editor with 7 supertags |
| `/memory/map` | Force-directed brain map (Sigma.js) |
| `/team` | Invitations + roles |
| `/settings` | One-page, scrollable: account / billing / API keys / MCP / integrations / danger |
| `/audit` | Append-only log view |
| `/marketplace` | Provider discovery + bind/unbind (role-filtered) |

**Cut from v1.0** (deferred to v1.1+): separate MCP setup page (folded into settings), skill marketplace, additional role agents (eng, ops, sales), n8n-style visual workflow editor.

---

## 4. Theme model

**User picks Light / Dark / System (default).** Both modes ship from day 1. The "Brain + Studio" duality is expressed via secondary signals that work in either mode:

| Signal | Brain surfaces (dashboard, queue, audit, settings, MCP) | Studio surfaces (marketing studio, memory editor, onboarding, marketplace) |
|---|---|---|
| Density | Dense rows, tabular figures, monospace IDs | Generous whitespace, prose-width measure |
| Accent | Cool — lime / green | Warm — coral / pink |
| Type | Sans body + Fira Code for IDs/timestamps | Sans body, slightly larger leading |
| Motion | Snappy 150ms transitions | Softer 250ms, staggered list reveals |
| Layout | Sidebar + dense canvas, Cmd+K primary | Split-pane or single-column, generous padding |

Tokens: same type scale, spacing scale, component shapes across both modes. Only color tokens swap.

**Reference brands (one per surface):**
- Landing hero — **Sana AI** (dramatic dark, product-floating)
- Dashboard shell + nav — **Linear** (dark/light discipline)
- Queue / audit / governance — **Adaline + Vercel Dashboard**
- Marketing studio — **Jasper** (chat + canvas split)
- Memory editor — **Notion + Cursor**
- Onboarding brain-dump — **HubSpot brand-voice wizard + WRITER "Tune Your Voice"**
- Marketing copy / voice — **Cursor + Linear + Anthropic**
- Pricing — **Linear + Vercel**

**Soul:** Linear's discipline + Sana's drama + Cursor's confidence.

---

## 5. Day-0 founder journey

Target: **10 minutes from landing → "holy shit it sounds like me."**

```
LANDING ────► SIGNUP ────► ONBOARDING ────► FIRST QUEUE ────► FIRST DRAFT
 30 sec        30 sec        4–5 min          2 min            2 min
   │            │              │                │                 │
   ▼            ▼              ▼                ▼                 ▼
  Wow #0       Wow #1         Wow #2           Wow #3           AHA
"Big Brain    "Friction-     "Watch BBC      "Accept the     "It actually
 Company"      less in"       structure       brain in 30s"   sounds like me"
                              my dump"
```

**Step 1 — Landing.** Hero, 8 sections, dark/light rhythm. Primary CTA: *Get started · Free*.

**Step 2 — Signup.** One field (email) + Google OAuth. Magic link or autoconfirm. No password. Lands in `/welcome`.

**Step 3 — Onboarding (`/welcome`)**, 3 steps:
- **1. "Tell us about you"** (30s) — company name, product one-liner, founder role
- **2. "The brain dump"** (2–3 min) — one big textarea with toggle for *Wizard* (8 structured questions) or *Upload* (Notion/Google Docs URLs + markdown drag)
- **3. "Watch BBC build your brain"** (60–90s) — LLM parses → animated staggered reveal of typed memory proposals → "BBC found 12 items in your dump" → *Review your brain →*

**Step 4 — First queue review (`/dashboard`).** Bulk *Accept all from onboarding* + per-item review modal. Coaching banner: *"Your agents read from this next."*

**Step 5 — First marketing agent draft (`/studio/marketing`).** Single textarea: *"What do you want to do today?"* → agent proposes 2–4 workflow cards → pick → mini-onboarding card (first time only) → run → queue items appear with live X/LinkedIn/Threads previews → AHA.

**Day-1+ daily loop:** email digest if queue has items → open dashboard → triage queue → draft in studio → edit memory occasionally. Sessions 5–10 minutes.

**Free → paid triggers:** 500 brain items reached · 200 credits used · MCP write needed · teammate invite needed · 14-day activation nudge.

**Recovery paths:** mid-onboarding bounce email at 1h/24h · doesn't dump enough → wizard fallback · upload fails → manual paste.

---

## 6. Marketing Studio v1 (task-first)

The hero feature. **Task-first, not workflow-first.** Founder states a task; BBC proposes 2–4 candidate workflows from an internal library; founder picks; mini-onboarding (first use); run.

**One textarea, one button per interaction.** No upfront forms.

### Internal workflow library (10 templates, hand-authored)

The agent draws from this internal list — users never see it as a menu. Agent picks the relevant subset based on the task.

1. Single X post
2. Tweet thread
3. Threads post
4. LinkedIn announcement
5. Cross-platform campaign (multi-output)
6. Reel / short script
7. Blog post draft
8. Voice consistency check
9. Hashtag strategy
10. Custom (free chat — fallback)

### Editing workflows
**Conversational only.** No form-based editor in v1. User says *"This workflow always misses my product taglines — fix it"* → agent updates the prompt template → saves as the user's version. Visual canvas editor → v1.1.

### Output
Every workflow run produces queue items. Queue items show:
- What the agent wrote
- Which brain items it cited (clickable)
- What changes if accepted (status, downstream effects)
- Approve / Reject / Edit

### Live previews
Drafts render in canvas as the actual platform card (X post mock with avatar/handle/timestamp; LinkedIn card; Threads card). Visual = trustworthy.

### Recent / favorites
After first run, workflow shows as a quick-launch chip below the textarea: *"Run again: Cross-platform campaign"*. No config UI required.

---

## 7. Memory structure (typed objects + free-form blocks + relations)

**Tana-inspired hybrid.** Reject pure-block (Roam — backlinks scale poorly), reject pure-typed-databases (Notion — too rigid for narrative voice). Locked after deep research of Obsidian / Roam / Logseq / Mem0 / Tana / Capacities / Heptabase / Notion + GraphRAG and Mem0 papers.

### Data model

```
memory_item:
  id, tenant_id, type, title, slug, status, source,
  scope, layer, owning_layer,
  fields: jsonb        # type-specialized strongly-typed fields
  body_blocks: jsonb[] # Notion-style ordered blocks
  embedding: vector

memory_relation:
  src_id, dst_id, kind, tenant_id, created_at, created_by
  # kind: cites | supersedes | implements | exemplifies | owned_by
```

### Why this hybrid wins
- Type is first-class — agent asking *"what's our voice?"* runs deterministic `WHERE type='voice' AND status='active'`. No semantic-search lottery.
- Per-type `fields` (jsonb) lets each supertag have its own schema without table-per-type rigidity.
- Free-form `body_blocks` gives founders the Notion editing UX they expect.
- Explicit `memory_relations` table makes brain-map cheap and lets agents traverse multi-hop (GraphRAG showed 3.4× accuracy lift on multi-hop tasks).
- `embedding` column enables hybrid retrieval: type-filter first, vector rerank within type (Mem0's published 91.6 LoCoMo approach).

### Concrete deltas to existing `memory_files` schema
1. Add `fields` (jsonb) + `body_blocks` (jsonb[]) columns
2. New table `memory_relations`
3. Each typed supertag gets a form schema in the UI

### Seven v1.0 supertags
voice · decision · glossary · vendor · product · team · skill

---

## 8. Brain map (`/memory/map`)

**Library: Sigma.js + Graphology**, WebGL force-directed, ForceAtlas2 in a WebWorker. Cytoscape blocks main thread above ~3k nodes; D3-force needs hand-rolled React glue; react-flow is for flowcharts.

### UX decisions
- **Default view: local graph** (2-hop neighborhood around current item). Global graph behind a button — the Obsidian community consensus is that global graphs are "thumbnail content," pretty but useless.
- Color by type (voice=coral, decision=lime, glossary=violet, vendor=amber)
- Size by inbound-reference count
- Cluster by Louvain community detection, pre-computed for layout stability across sessions
- Hide orphan nodes by default with "show 47 orphans" toggle
- Edit a node → related nodes pulse (the live feedback loop is the marketing demo)

### Three anti-patterns avoided
1. Graph as primary interface — it's a wow demo + secondary nav, not a primary surface (Heptabase tried; stayed niche).
2. MCP agent writes that bypass the queue — never. Every agent write goes through `propose → accept`.
3. Single "page" type that holds everything — start with 7 typed supertags; add carefully (each type is a contract with every downstream agent).

---

## 9. Landing page (`/`)

8 sections, dark/light/dark rhythm:

1. **Hero** (dark) — *"Build a Big Brain Company."* + sub + dual CTA (Get started · Free / Watch demo · 90s) + animated brain map + queue-approval visual
2. **Social proof** (dark) — logos / waitlist count / testimonial placeholder
3. **Three wow moments** (light) — onboarding magic / agent at work / queue review
4. **How it works** (light) — 4 numbered steps (drop in voice → connect agents → review queue → audit)
5. **Brain map embed** (light) — interactive demo
6. **Your stack, your choice** (dark) — dynamic providers differentiator + tool logo grid
7. **Pricing teaser** (light) — 4 tier cards + link to /pricing
8. **Final CTA** (dark) — *"Hire your first AI worker today."*

Voice: confident, technical-but-warm (Cursor + Linear + Anthropic blend). Short sentences. No buzzwords. Speaks directly to "you".

---

## 10. Pricing (`/pricing`)

Monthly + Annual toggle (17% off annual — standard).

| | **Free** | **Solo Founder** | **Startup** | **Scale** |
|---|---|---|---|---|
| Price | $0 | $29/mo | $129/mo | $399/mo |
| Seats | 1 | 1 | up to 10 | up to 50 |
| LLM + tool credits | 200 | 3,500 | 20,000 | 75,000 |
| Brain items | 500 | unlimited | unlimited | unlimited |
| MCP | read-only | read+write | read+write | read+write |
| Provider integrations | 1 | 3 | unlimited | unlimited |
| Audit log retention | 30 days | 1 year | 1 year | forever |
| Tool marketplace | view only | propose swaps | propose swaps | priority new tools |
| SSO / custom voice fine-tune | — | — | — | ✓ |
| Overage | — | $0.012/credit | $0.012/credit | $0.012/credit |

**Credit definitions:**
- 1 post draft ≈ 3 credits
- Full campaign plan ≈ 30 credits
- Voice review ≈ 1 credit
- Blog post ≈ 15 credits
- Higgsfield 5s clip ≈ 50 credits (passthrough +15%)

**Calibration:** ~70% gross margin on Claude Sonnet pricing. Reprice quarterly as token costs fall (pass ~30% of savings to customers as larger bundles, keep 70% as margin).

---

## 11. Dynamic tools + marketplace

Leverages your existing F4 architecture (provider-roles + bindings.yaml).

### How tools work
- **Free / OSS tools** (n8n self-host, free APIs) — BBC uses freely; no user setup; included in price.
- **Paid tools** — per-tool choice:
  - **BBC's account (default)** — no setup, charged as credits, transparent 0–10% markup
  - **BYO key** — user adds in `/settings/integrations`, free of credit charge

### `/marketplace` surface
Role-filtered view (uses Phase 5 RBAC):
- Admin/founder: sees everything, binds/unbinds, approves credit spend
- Marketing member: sees Marketing-role tools, requests bindings via queue
- Engineering member: sees Engineering-role tools (when shipped)
- Viewer: read-only

For each role: active providers + status + alternatives BBC recommends (with reasons — cheaper, faster, free).

### Differentiator
**No other AI workforce platform is vendor-agnostic.** Higgsfield today, the cheaper option tomorrow — without rewriting prose. This is a core differentiator on the landing page.

---

## 12. Build sequence

Six phases (labeled G–L after existing F0/F1–F4/Y/Z work), ~6–8 weeks.

### Phase G — Foundation (1 week, parallel-friendly)
- Design system: tokens, type, color, spacing for dark + light
- Lock components: Button, Input, Modal, Card, Toast, Dialog, Cmd+K palette
- Terms / Privacy / cookie banner
- Sentry + PostHog wired in dashboard
- Email transactional via Resend (invite, signup, queue-digest)

### Phase H — Brain editor + relations (1.5 weeks)
- Migration: add `fields` jsonb + `body_blocks` jsonb[] to `memory_files`
- New table: `memory_relations`
- `/memory` editor: Notion-style block editor, 7 typed forms
- CRUD + relation traversal endpoints (used by Studio later)
- Migrate `examples/example-tenant/` content into new schema

### Phase I — Onboarding magic (1.5 weeks)
- `/welcome` flow: 3-step stepper
- LLM extractor: brain-dump text → typed memory proposals (system prompt + evaluator)
- Animated reveal of structured items (staggered fly-in)
- Bulk-accept flow ("Accept all from onboarding")
- Recovery emails for bounces

### Phase J — Marketing Studio v1 (2 weeks, hero feature)
- `/studio/marketing` — task-first single-textarea entry
- 10 internal workflow templates (hand-authored prompts in versioned files)
- Workflow proposal layer (LLM picks 2–4 cards from task)
- Mini-onboarding card per first-use
- Live X / LinkedIn / Threads preview cards in canvas
- Run → queue items appear in `/dashboard`
- Conversational workflow editing (chat overlay)

### Phase K — BYOK onboarding + marketplace + MCP writes (1.5 weeks)

**Rewritten 2026-05-11 per ADR-0007.** Originally "Marketplace + MCP writes + Stripe". Monetization layer dropped: BBC is AGPLv3 OSS in v1, no Stripe, no paywall, no credit metering. The marketplace stays but as a *provider directory*, not a revenue surface — users plug in their own keys (BYOK) and pay the upstream provider directly.

- `/welcome` flow extended with BYOK setup: paste Anthropic key, paste Supabase URL (or click "Use the hosted demo"), pick LLM model preference. Stored encrypted per-tenant in `external_accounts`.
- `/marketplace` with role-filtered view. Each provider card shows: role (llm-provider, video-gen, etc.), supported adapters (Anthropic, Higgsfield, n8n, …), credibility score (F1 once built), bind/unbind. **No "Add credits" CTA; no plan upsell.**
- Bind/unbind providers writes to `bindings` (already exists in schema). Provider keys live in `external_accounts` per-tenant.
- MCP write tools (read + write through queue protocol). Unchanged from the original Phase K scope — this is product surface, not monetization.
- **One-click self-host:** "Deploy to Vercel" button on the README. Forking + setting 3 env vars stands up a tenant in ~5 min.
- Hosted demo at bbc.tools with **per-IP rate limits** (3 Studio runs/day) and a shared founder-funded Anthropic key. Treat the hosted Anthropic spend as a marketing-budget line, not COGS.

### Phase L — Landing + brain map + docs + polish (1.5 weeks)
- Landing page (8 sections) — pitch shifts from "SaaS that scales with you" to "open-source brain for your startup"
- ~~Pricing page~~ → **"Self-host vs hosted demo" comparison page** + AGPL FAQ
- Brain map (`/memory/map`) — Sigma.js + Graphology + Louvain clustering
- Mintlify docs at docs.bbc.tools
- GitHub repo polish: README, CONTRIBUTING, CODE_OF_CONDUCT, issue + PR templates
- End-to-end QA on golden path
- Soft launch checklist (HN "Show HN", Product Hunt, IH, X, OSS communities)

---

## 13. Launch sequence

```
Week 1–8         Build (Phases G → L)
Week 8 (T-2)     Private beta: 20 hand-picked AI-native founders.
                 Self-host or hosted demo. Feedback Slack channel. Daily fixes.
Week 9 (T-1)     Public beta: open self-serve signup at bbc.tools.
                 OSS launch on Show HN + r/selfhosted + IH.
Week 10 (T-0)    GA: GitHub repo public, Product Hunt, soft-launch on X.
                 No paid acquisition (no revenue → no acquisition budget).
                 Weekly retro + metric dashboard.
```

### v1.0 success metrics (T+30 days)

OSS-launch metrics replace SaaS revenue metrics. The funnel is "GitHub stars → cloners → self-hosters → daily active brains," not "signups → paid conversions."

| Metric | Target | Why it matters |
|---|---|---|
| GitHub stars | 1,000 | Proxy for awareness in the OSS founder/AI dev audience |
| Forks + clones | 200 | Proxy for self-host intent |
| Hosted-demo signups | 500 | Funnel of people trying before self-hosting |
| Hosted-demo activated (brain dump done) | 200 (40%) | Same activation bar as the original SaaS plan |
| First Studio draft (aha) | 120 (60% of activated) | The product moment |
| Self-host installations (telemetry opt-in) | 50 | Proxy for "this is sticky enough to self-host" |
| Contributors with merged PRs | 5 | Proxy for community formation |
| 14-day retention (hosted demo) | 25% | Unchanged from original plan |

There is no MRR target in v1. Commercial relicensing (hosted enterprise tier, SLA-backed cloud) is deferred to v1.x and gated by ADR-0007 → maintainer's legal status.

---

## 14. Risks + mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| LLM extraction quality (brain-dump → typed proposals) | Aha moment dies if items miss or mis-type | Hand-tune system prompt, evaluate on 50 fake dumps before launch, log all extractions for refinement |
| Marketing Studio task-first UX feels chatty, not productive | Activation drops if founders expect Jasper feel | Beta-test empty-state copy, add prompt chips as fallback, measure time-to-first-draft |
| Hosted-demo Anthropic spend exceeds the marketing budget | Maintainer eats the bill personally | Per-IP daily caps + global daily cap + automatic disable when the cap is hit + on-screen "demo limit reached, self-host for unlimited" |
| Sigma.js performance at scale | Brain map jank at 500+ nodes | ForceAtlas2 in WebWorker, Louvain pre-cluster, hide orphans |
| Permissive fork by a competitor selling BBC as SaaS | Erodes future commercial option | AGPLv3 (already in `LICENSE`) — any hosted offering must open-source modifications. Same lever Plausible + Cal.com use. |
| AGPL scares enterprise contributors | Lower community velocity | Accept the tradeoff. The contributors AGPL repels are mostly those who want to commercialize *your* code. Per ADR-0007. |

---

## 15. Out of scope for v1.0

Deferred to v1.1 or later, called out so we don't drift:
- Additional role agents (engineering, ops, sales, customer support)
- Visual n8n-style workflow editor
- Skill marketplace (separate from provider marketplace)
- GitHub / Slack / Linear deep integrations beyond MCP
- Shadow brain failover activation (F3 scaffolding stays cold-deployed)
- Multi-region deployment
- Mobile app
- Public API beyond MCP
- Compliance tier (SOC2, DPA, custom contracts)
- Custom voice fine-tuning execution (UI exists in Scale tier; runs are manual until v1.1)

---

## 16. Open questions for implementation

These don't block design approval but need decisions during Phase G:
1. Final color tokens — pick the exact lime + coral shades (probably tailwind lime-400 + rose-400, verify contrast in both modes)
2. Headline font choice — Geist Mono pair, Inter, Sora? Lock during design system phase
3. Resend vs Postmark for email — Resend is the safe call (better DX, BBC's existing example provider)
4. PostHog vs Mixpanel for product analytics — PostHog (open source, better self-host story)
5. Hosting target for landing page — Vercel (same as dashboard) vs static export

---

## Appendix A — Reference research

- **Pricing**: Lindy / Devin / Cursor / n8n / Notion / Bardeen / Cline / Mem0 surveyed. Hybrid (flat + credits) is what's working in 2025–2026. Pure per-seat dropped 21%→15% YoY for agent products. Pure usage drives month-4–8 cancellations.
- **Memory structure**: Tana supertags + Mem0 schema + Microsoft GraphRAG + Anthropic knowledge-graph cookbook synthesis. Typed objects + free-form blocks + explicit relations table is the winning shape.
- **Visualizer**: Sigma.js + Graphology + ForceAtlas2 in WebWorker. Local graph default, global secondary. Louvain pre-clustering.
- **Reference apps surveyed**: Sana AI, Adaline, Vapi, ClickUp, Jasper, Copy.ai, WRITER, HubSpot, GoFundMe, ElevenLabs, Chatbase.

## Appendix B — Approval trail (this session)

This design was developed over an interactive brainstorming session on 2026-05-10. All sections were proposed and explicitly approved by Oscar (@ocwwp). Key decisions logged section-by-section in the conversation transcript.
