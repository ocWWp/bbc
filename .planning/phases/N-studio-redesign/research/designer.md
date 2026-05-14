# Persona research — Designer (2026)

> Deep-research agent output, 2026 sources. Scope = the *writing/spec* side of design.

## Summary
"Designer of one" / founding designer wearing product + brand + content + systems hats. The writing/spec side (specs, UI copy, design-system docs, rationale) is real, frequent, chronically under-tooled. AI gets to 70-80% fast but never produces brand-accurate, context-aware, production-ready output. Their writing is also a *translation* act — making design legible to eng and the rest of the company. **Design opportunity: a workspace holding design system + brand voice + prior patterns on screen while they write.**

## What they produce
- **Visual/design specs for handoff** — overview, flow, screen-by-screen component specs, **all states (empty, loading, error, success, disabled, overflow)**, responsive behavior, data/API needs, accessibility notes, acceptance criteria. The **#1 real-world gap is behavioral documentation** — what happens logged-out, on API failure, on empty data.
- **UI copy / microcopy passes** — labels, errors, tooltips, empty states, onboarding; variant sets respecting character limits.
- **Design system documentation** — usage guidelines (write these *before* visual specs), component anatomy + states, do's/don'ts, voice guidelines, token refs.
- **Brand guideline entries** — voice (constant) vs tone (varies by user emotional state), terminology rules.
- **Design rationale write-ups** — the "why": alternatives considered, tradeoffs, argumentation.

## Workflow
Gather context first (who the user is + their emotional state at this journey point, brand voice rules, design-system constraints/terminology, prior patterns) → draft (AI-assisted to 70-80%) → refine for tone/accuracy/accessibility → document states + behavior → hand to eng. Increasingly *continuous* — eng involved early, iterative chunks. On screen: Figma, design system/Storybook, brand voice doc, the PRD/ticket, an AI tab.

## Good vs. mediocre
Mediocre microcopy: `Error 404: Resource not found in database query`. Good: `We couldn't find that page. Let's get you back on track` — situation-aware, plain language. Good docs answer 4 questions per component (looks like / when to use / how it behaves / how to implement) and **cover every state**. "Done" = all states + behavior documented, accessibility specified, voice-consistent, findable in <1 min.

## Workspace preferences
Context **persistent on-screen while writing** — design system, brand voice, prior approved copy — not re-pasted. Character-limit awareness, state checklists, single source of truth syncing design↔code. Hate: generic AI output, brand-voice drift across screens, copy-pasting between tabs, AI that ignores accessibility unless prompted.

## Design implications for the Designer Studio
- Treat **design system + brand voice + prior approved patterns as always-loaded context**.
- **Scaffold specs with all states + behavior pre-structured** — directly fixes the documented #1 handoff gap.
- Flag accessibility gaps automatically.
- Act as a synced single source of truth for UI copy.
- NOTE (from heuristic audit): Designer Studio is currently the thinnest of the 5 — this persona work is also its parity build.

## Sources
Eric Wong UX Writing Guide 2026, Figma/LogRocket (Figma AI limits), Miro + figmatoazure (handoff/behavioral-doc gap), First Round Review (founding designer role), Anton Sten/Medium (solo designer day), wpdean/ParallelHQ (design-system docs), Frontitude/Ditto (context-aware copy tools), r/UXDesign frustrations.
