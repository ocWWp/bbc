# Phase N — heuristic audit of the 5 current Studios

**Status:** Done — desk research, no interviews needed. Companion to `RESEARCH.md`.
**Method:** Structural map of all 5 Studio clients + `role-shapes.ts` + `StudioPageShell`, read as code, assessed with a designer's eye. Plus a light landscape scan of 2026 AI-workspace UX patterns.
**Why it exists:** `RESEARCH.md` says Phase N is interview-first. True for the *design* of the redesign — but the *diagnosis* of what's wrong doesn't need users. This is that diagnosis. It also sharpens the interview guide: you now know what to probe.

## Headline finding — it's not "5 inconsistent Studios," it's "1 Studio and 4 skeletons"

The memory (`project_v16_studio_redesign`) framed Phase N around the reverted `StudioPageShell` wrap duplicating chrome. The audit says the real problem is deeper and different:

**Marketing is a fully-designed Studio. Engineering, Founder, Designer, and Support are skeletons that share Marketing's state-machine but almost none of its design.**

| Surface | Marketing | Engineering / Founder / Designer / Support |
|---|---|---|
| Output rendering | Role-specific **preview cards** (`OutputBlocks` → XPostCard, BlogDraftCard, …) + citation strip | Raw **`<pre>` plaintext**, blocks joined by `\n\n` |
| Recent runs | `RecentRunsChips` — label + task + relative age + status dot | Plain text list: `templateId · task · status` |
| Input flow | Proposal stage: describe → candidate workflows → pick | Direct-run: textarea + "Pick a workflow" grid |
| Bespoke polish | rotating placeholders, ActiveOverridesPill, EditWorkflowChat | uneven — see below |

4 of 5 Studios render their output as **unstyled `<pre>` text**. That's not an inconsistency to smooth out — it's the absence of output design.

## Cross-cutting gaps (all 5)

1. **The sidebar is dead config.** `role-shapes.ts` defines `sidebarSections` for every role (Marketing: voice+decisions+glossary; Engineering: decisions+vendors+glossary; Founder: decisions+team+vendors; Designer: voice+decisions+glossary; Support: voice+glossary+decisions). **Zero Studios render a sidebar.** All 5 render directly into a centered `max-w-5xl` container. `StudioPageShell` / `StudioShell` exist, expose a `sidebarSlot`, and are *not used by any page*. The brain-context — the entire point of a role-scoped *brain* workspace — is invisible.
2. **Output rendering has no shared contract.** Marketing has `OutputBlocks`; the other four each hand-roll a `<pre>`. There's no answer to "what does a Founder board-update *look* like when it's done" — it looks like a text dump.
3. **"Recent" has no shared contract.** Same data, two implementations, four of them worse.
4. **Feature distribution is arbitrary, not intentional.** Marketing: proposal flow + overrides + edit chat. Engineering + Support: overrides + edit chat. Support: select-input branching. **Designer: nothing — "minimal, just direct-run."** Designer is the most neglected; there's no evident reason it should have less than Support.

## What this means for Phase N scope

The redesign is **less "redesign," more "finish."** Reframed:

1. **Marketing is the reference implementation.** Phase N's job for the other 4 is largely "bring up to Marketing's bar" — real output rendering, the chip-based recent UI — *then* diverge per role where the role actually needs something different.
2. **Shipping the sidebar is its own workstream.** It's defined and unrendered. Wiring `StudioPageShell` so `sidebarSlot` actually renders `BrainSidebar` from each role's `sidebarSections` is a discrete, high-value task — and it's the thing that makes a "Studio" feel like it's sitting on a brain.
3. **Output design is the hardest open question per role.** A marketing post has an obvious visual form (the platform card). A Founder memo, an Engineering ADR, a Designer spec, a Support reply — what's the *right* rendered form for each? **This is the sharpest thing to take into interviews.** Don't ask "what do you want the Studio to look like" — ask "show me a great one of these you made, and a bad one."
4. **Designer Studio needs the most attention** — it's the thinnest today.

## Landscape notes (2026 AI-workspace patterns → BBC mapping)

Light scan, not a survey. Patterns worth holding in mind during synthesis:

- **Persistent context sidebar** reduces working-memory strain in long sessions — directly validates fixing gap #1. *(Smashing, UX Collective)*
- **Multi-pane co-creation** — prompt/refine/test on the left, the artifact evolving on the right — is the dominant layout. BBC's `promptSlot` + body-as-output split (in `RESEARCH.md` implementation preview) matches this; the audit just says actually *build* it.
- **Scope declaration** — a visible "this agent does X" — manages expectations. BBC's per-role identity should be doing this; today the breadcrumb does it weakly.
- **Human-in-the-loop review + citation confidence** — review/edit loop and showing whether a citation *supports* vs. merely *mentions* a claim. BBC has accept/reject + a citation strip; the "confidence" nuance is a v1.6+ idea, not Phase N.

## What this changes in RESEARCH.md

`RESEARCH.md` stands, with two sharpened inputs:
- The interview guide's "output shape" question becomes the **priority** probe — "show me a great one, show me a bad one" — because output rendering is the biggest gap and the hardest to guess.
- Add an explicit Phase N workstream: **wire the sidebar** (`StudioPageShell.sidebarSlot` → `BrainSidebar`). It's not a design unknown; it's defined config that was never rendered. It can start before interviews finish.

## Sources

- [Where should AI sit in your UI? — UX Collective](https://uxdesign.cc/where-should-ai-sit-in-your-ui-1710a258390e)
- [Designing for Agentic AI: Practical UX Patterns — Smashing Magazine](https://www.smashingmagazine.com/2026/02/designing-agentic-ai-practical-ux-patterns/)
- [The Shape of AI — UX Patterns for AI Design](https://www.shapeof.ai/)
- [AI in Content Design and UX Writing — UXCC](https://uxcontent.com/ai-in-content-design-ux-writing/)
