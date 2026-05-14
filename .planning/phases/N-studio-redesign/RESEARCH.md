# Phase N — Studio redesign (research)

**Status:** Research phase — interviews not yet run. No PLAN.md until synthesis is done.
**Belongs to:** Loop 2 (per ADR-0008). The Studios are Loop 2's user-facing surface.
**Predecessor:** Phases J / K / L+ shipped 5 Studios (marketing, founder, engineering, designer, support). The v1.5 `StudioPageShell` wrap (Tasks 17-22) was **reverted** before launch — it fought the existing clients.
**Successor:** Phase N implementation (PLAN.md, role-by-role), then new Studio roles — see `project_hr_legal_studios_idea` in session memory. New roles must be born into Phase N's shape, so **Phase N precedes any new role.**

## Why this exists

The v1.5 `StudioPageShell` wrap was code-first, and that's exactly why it landed confusing. User reaction at pre-launch: *"Marketing studio looks pretty bad, I got confused when I looked at it."* It was reverted; the shell components stay built but unwired.

The wrap duplicated chrome the existing clients already had:

| Surface | Shell adds | Existing client already has | Result |
|---|---|---|---|
| Breadcrumb | role chip + tenant + template | inline RoleSwitcher | duplicate nav |
| Sidebar | brain-context panel | nothing visually linking to it | floating panel |
| Page identity | breadcrumb chip | "MARKETING STUDIO" overline + big title | competing page chromes |
| Drafts | full-width drafts list | inline "RECENT" card section | same data, twice |

Phase N is **not** a code task that starts cold. It starts with research, then per-role specs, then code. Writing code first is the mistake we already made.

## Method — three steps

1. **Per-role user research.** 5 interviews per role minimum, ~30 min each. Five roles → ~25 interviews. Talk to people who actually hold the role (founder, marketing, support, engineering, designer) — not proxies.
2. **Synthesis into per-role specs.** One `UI-SPEC-<role>.md` per Studio. These become the design contract Phase N implementation builds against.
3. **Then code.** Implement spec-by-spec inside the existing (reverted-but-built) StudioShell scaffold. The Tasks 17-22 components — `StudioShell`, `RecentDrafts`, `BrainSidebar`, `StudioPrompt`, `CitationChip` — stay; Phase N composes them per the specs.

## Interview guide

Same spine for every role; the role-specific probes change. Keep it conversational — these are the seed questions, not a script to read verbatim.

**Warm-up — the actual job**
- Walk me through the last thing you made for work that took real thought. What was it, who was it for?
- How often do you produce that kind of output? Daily, weekly, ad hoc?

**The workflow**
- Before you start writing/making it, what do you gather first? Where does that live today?
- What's open on your screen while you work? What are you flipping between?
- Where do you get stuck or slowed down?

**What "good" looks like**
- How do you know a draft is done? What separates a good one from a mediocre one?
- Who reviews it, and what do they push back on?

**Context on screen**
- If a tool could surface 3 things next to you while you write, what 3 things?
- What context do you currently have to go *hunting* for?

**The review/edit loop**
- When something's wrong with a draft, how do you fix it — rewrite, tweak, start over?
- Do you reuse past work as a starting point? How do you find it?

**Role-specific probes** (examples — expand per role during prep)
- Founder: board updates vs. strategic memos vs. weekly recaps — different enough to need different screens?
- Marketing: how much does platform (X / LinkedIn / blog) change the workflow vs. just the output format?
- Engineering: ADRs vs. tech-debt reviews vs. vendor-swap proposals — what context does each need?
- Support: is it one-off replies, macro authoring, or escalation summaries — and are those the same surface?
- Designer: visual specs vs. brand-guideline entries vs. UI-copy passes — shared workflow or three things?

## What synthesis produces

One `UI-SPEC-<role>.md` per Studio. Each spec must define:

- **Prompt shape** — what the role's input UI is. (Marketing today: textarea + template chips. Founder: direct-run. These will diverge.)
- **Sidebar shape** — what brain context sits next to the work. Marketing wants voice + recent decisions + glossary; Founder might want active deals + upcoming meetings; Engineering might want recent ADRs + component owners. `role-shapes.ts` already supports per-role `sidebarSections` — the spec decides what goes in them.
- **Output shape** — how a run renders. (Platform cards for marketing; what's the equivalent for the others?)
- **Review/edit loop** — accept/reject/edit flow, and how conversational overrides surface.
- **Citation surfacing** — how cited memory shows inline + in the strip.
- **"Recent" feel** — how past runs present as quick-launch starting points.

## Implementation preview (what the specs feed)

So research stays anchored to what Phase N code will actually do:

1. **Promote prompt to `StudioShell.promptSlot`** — each role's input UI moves out of the body client into a per-role component. Body becomes output-only.
2. **Strip duplicated chrome** — remove inline RoleSwitcher, the "MARKETING STUDIO" overline, the inline "RECENT". The shell owns identity, nav, and drafts.
3. **Redesign sidebar per role** — use the `role-shapes.ts` `sidebarSections` that already exists but isn't meaningfully populated.
4. **Decide if `/studio` (the chooser route) still exists** — if breadcrumb + role-switcher chips in the shell head are enough, kill it.
5. **Per-role accent treatment** — extend the single breadcrumb dot color into button hover, sidebar heading borders, citation chip hover, so each Studio actually *feels* distinct.

## Open questions for Phase N kickoff

- **Recruitment** — do we have access to 5× each role, or do we start with the roles where we have interviewees and stagger the rest?
- **Marketing first?** — it's the only Studio users have actually seen. Strong case to spec + ship Marketing's redesign first as the proof, then fan out.
- **`/studio` chooser** — decide before implementation, not during (item 4 above).
- **Sequencing vs. new roles** — `project_hr_legal_studios_idea` wants HR/Legal (or whatever real demand surfaces). Confirmed: those wait until Phase N gives them a shape to be born into.
