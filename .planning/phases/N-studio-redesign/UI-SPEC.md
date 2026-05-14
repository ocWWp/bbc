# Phase N — UI-SPEC (the design contract)

**Status:** Synthesized from 8 persona research briefs + the heuristic audit + the architecture map. This is what the build executes against.
**Supersedes:** the speculative spec structure in `RESEARCH.md`. Companion: `AUDIT.md` (diagnosis), `research/*.md` (evidence).
**Scope:** redesign the 5 existing Studios + scaffold 3 new ones (finance, legal, people/HR). 8 Studios total.

---

## 0. The one finding that drives everything

Across all 8 personas — marketing, founder, engineering, designer, support, finance, HR, legal — the unmet need is **identical**:

> Persistent role-context on screen + grounded, voice-matched output the human edits — **not a blank box.**

Every brief independently said: the bottleneck is no longer *drafting*, it's *context assembly*; current AI tools fail because they don't know the company and force tab-switching; people want their context loaded *beside* the work and want to stay editor-in-chief. BBC's "company brain, role-scoped" thesis is exactly this — but the current build doesn't deliver it. **The redesign's job is to make the architecture finally do what the thesis promises.**

This single finding settles the big design questions:
- **Context-first, not prompt-first.** The sidebar (role context) is not decoration — it's the product.
- **The sidebar must render.** It's defined in `role-shapes.ts` for all 5 roles and rendered by zero pages today. That is the #1 build item.
- **Output must be real.** 4 of 5 Studios render `<pre>` plaintext. That is the #2 build item.
- **Human stays editor-in-chief.** Every Studio's output is a draft the human accepts/edits/rejects. BBC already has this; keep it loud (especially Legal).

---

## 1. Cross-role design contract

These apply to **all 8 Studios**. Per-role sections (§2) only state deltas.

### 1.1 Layout — wire `StudioPageShell`, context-first

- Every Studio page renders `<StudioPageShell role="…">`. The shell + `StudioShell` + `BrainSidebar` + `RecentDrafts` are **already built** (`components/studio/`) — they're just not wired in. Wiring them is plumbing, not new design.
- `StudioShell` grid regions: header (breadcrumb) · `promptSlot` · `sidebarSlot` · `bodySlot` · `recentDraftsSlot`.
- **The wrap was reverted once because it duplicated chrome.** This time, wiring it MUST come with stripping the now-duplicate inline chrome from each client:
  - Remove the inline `RoleSwitcher` — the shell breadcrumb owns role identity.
  - Remove the big "MARKETING STUDIO" overline / page title — breadcrumb owns it.
  - Remove the inline "RECENT" section — `recentDraftsSlot` owns it.
  - The client keeps **only** its action flow (prompt → run → output → review) and slots into `promptSlot` + `bodySlot`.
- `sidebarSlot` renders on every Studio, every state. When the brain is empty, `BrainSidebar` already shows the "Add memories at /brain" empty state — keep that.

### 1.2 Output rendering — kill `<pre>`, one renderer

- **All Studios render output through `OutputBlocks`.** No raw `<pre>`. Marketing already does; the other 4 must.
- `output-blocks.ts` has marketing-shaped kinds (`x_post`, `x_thread`, `linkedin_post`, `blog_draft`, `script`, `threads_post`, `plain`). Add **one structured-document kind** for the non-marketing Studios:
  - **`doc`** — `{ title, doc_type, body_markdown, sections? }`. Renders as a typeset document card (headings, lists, tables, inline `<cite>`), NOT a `<pre>`. `doc_type` is a label chip (ADR, Memo, Spec, Policy, Offer Letter, NDA, Board Financials…).
  - This single kind covers ADRs, RFCs, memos, board financials, specs, policies, offer letters, contracts, help articles. Per-role nuance is in the *template prompt*, not 8 bespoke card components.
  - Keep `plain` only as the degenerate fallback.
- The citation strip (`OutputBlocks` already renders it) stays for every role — citations are core to the BBC thesis.

### 1.3 The review/edit loop

- Every run lands as a `studio_runs` row → accept / reject / edit, surfaced in the body after generation. (Exists for Marketing; the 4 skeletons + 3 new must match.)
- Conversational edit ("this always misses our taglines") → tenant-scoped template override. Exists for Marketing/Engineering/Support; extend to all.

### 1.4 The sidebar — make `role-shapes.ts` load-bearing

`BrainSidebar` renders each role's `sidebarSections`. Today the config exists but renders nowhere. Wiring §1.1 fixes that. Per-role section sets are in §2 — most are already defined correctly in `role-shapes.ts`; the 3 new roles need entries added.

---

## 2. Per-role specs (deltas only)

Each role: **prompt shape · sidebar sections · output kinds · the one thing that matters most.**

### Marketing (the reference — least work)
- Prompt: free-text + template chips + proposal stage (keep). Sidebar: voice · recent decisions · glossary (keep).
- Output: platform cards (keep — this is the bar the others rise to).
- **The one thing:** it already works — just strip duplicate chrome and let the sidebar render. Don't regress it.

### Founder
- Prompt: direct-run + chips (memo / board-update / weekly-recap). Sidebar: recent decisions · team · vendors (keep) — **add a "Last update" item** so the template can carry forward.
- Output: `doc` (Memo, Board Update, Weekly Recap, Investor Update).
- **The one thing:** template carries forward + voice preservation. The Studio should pre-load last month's update and the metric set; output is a 15-min review, not a from-scratch authoring.

### Engineering
- Prompt: direct-run + chips (ADR / vendor-swap / tech-debt). Sidebar: recent decisions · vendors · glossary (keep) — recent decisions is **load-bearing** here (prior ADRs are the context).
- Output: `doc` (ADR, Vendor-Swap Memo, Tech-Debt Review) — ADR uses Context/Decision/Consequences structure.
- **The one thing:** force capture of **alternatives-not-chosen**. It's what AI omits and reviewers demand. The ADR template must require it.

### Designer
- Prompt: direct-run + chips (visual-spec / ui-copy / brand-entry). Sidebar: voice · recent decisions · glossary (keep) — voice is load-bearing.
- Output: `doc` (Visual Spec, Brand Guideline) + a UI-copy variant set.
- **The one thing:** specs must **scaffold all states** (empty/loading/error/success/disabled/overflow) — the documented #1 handoff gap. Also: Designer Studio is the thinnest today — this is also its parity build (add overrides + edit chat).

### Support
- Prompt: direct-run + chips (reply / churn-save / bug-ack / incident / feature-req) + the existing select inputs. Sidebar: voice · glossary · recent decisions (keep).
- Output: `doc` for replies/macros + escalation-packet output.
- **The one thing:** macro library + escalation-packet generation are first-class. Human controls send — keep "never auto-sent" loud.

### Finance *(new Studio)*
- Prompt: direct-run + chips (board-financials / budget-memo / investor-numbers / expense-policy / runway-analysis). Sidebar: recent decisions · vendors · **+ a metrics/actuals section** (new — see §3).
- Output: `doc` (Board Financials, Budget Memo, Investor Update) — default structure **what / why / what-it-means + timing-vs-structural** tags.
- **The one thing:** the wedge is the **narrative-around-numbers**, not the ledger. Show its work (only 14% of CFOs trust AI accounting unaided; 97% want human oversight).

### Legal *(new Studio)*
- Prompt: direct-run + chips (NDA / contractor-agreement / IP-assignment / ToS-privacy / employment-terms). Sidebar: recent decisions · team · glossary.
- Output: `doc` (NDA, Agreement, Policy) — anchored to trusted templates (YC/Common Paper/Clerky-style), with an **audit trail**.
- **The one thing — hard constraint:** the Legal Studio is a **drafting assistant, NOT a legal advisor**. A persistent, unmissable "not legal advice — for attorney review" banner is a **first-class UI element**, not fine print. Every output is a draft. A per-doc-type "needs a lawyer / safe to self-serve" classifier. Never say "safe to use" or "enforceable." (UPL is live litigation in 2026.)

### People/HR *(new Studio)*
- Prompt: direct-run + chips (job-description / offer-letter / onboarding-plan / review-template / comp-band-rationale). Sidebar: team · recent decisions · glossary · **+ comp-bands section** (new).
- Output: `doc` (JD, Offer Letter, Handbook Section, Review Template).
- **The one thing:** behavior-based scaffolding (the specificity bar) + **bias/sensitivity flagging**, and for PIP/exit/termination docs, a "send this to counsel" prompt (shares Legal's triage pattern).

---

## 3. What the 3 new Studios need scaffolded

Per the existing add-a-role pattern (`role-shapes.ts` entry, template registry, `page.tsx` route, `AppNav` wiring, role-keyed redirect, tests):

- **`role-shapes.ts`** — 3 new entries. Finance accent: a green distinct from Engineering's emerald (try slate/teal). Legal: a serious neutral (slate/indigo). People/HR: a warm tone (rose/coral). Each with `defaultChips` + `sidebarSections`.
- **New sidebar sections** — `metricsSection` (Finance) and `compBandsSection` (HR) need adding to `role-shapes.ts` and `brain-summary.ts` (or a graceful empty state until those memory types exist).
- **Template registries** — `finance-templates/`, `legal-templates/`, `hr-templates/` — modeled on the existing `eng-templates/` etc. **Seed-template content is the highest-leverage part** — a role with weak seeds looks empty.
- **`template-id.ts`** — 3 new role prefixes.
- **Routes** — `app/studio/finance/`, `/legal/`, `/hr/` + `AppNav` + role-keyed root redirect.
- **Tests** — role-shapes chip↔template integrity, AppNav role-keyed visibility, route guards.
- **Legal disclaimer component** — a shared `<LegalDisclaimerBanner/>` the Legal Studio always renders.

---

## 4. Build sequencing

Highest-leverage first — this is the order tasks #4-6 execute:

1. **Add the `doc` block kind** to `output-blocks.ts` + a `DocCard` preview component. Unblocks every non-marketing Studio's output.
2. **Wire `StudioPageShell` into all 5 existing pages + strip duplicate chrome.** The single biggest "looks like a real product" change. Sidebar finally renders.
3. **Point the 4 skeleton Studios' output at `OutputBlocks`** (kill `<pre>`). Normalize recents via `RecentDrafts`.
4. **Designer Studio parity** — add overrides + edit chat.
5. **Scaffold the 3 new Studios** — Finance → Legal → People/HR (per §3). Seed templates are the bulk of the effort.
6. **Verify** — 535+ tests green, type-check clean, visual smoke of all 8.

Steps 1-4 make the *existing* product not-miserable. Step 5 makes it a *company*. Both ship under Phase N.
