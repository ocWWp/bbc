# Persona research — Engineering (2026)

> Deep-research agent output, 2026 sources.

## Summary
The persona is a **staff+ engineer / eng lead** — most senior IC, 1st-10th engineer, still hands-on but distinctive value is *horizontal influence*: aligning people who don't report to them on technical decisions. **The pain isn't writing the doc — it's getting seven people from four teams to show up with context and leave feedback the same week.** AI lacks the context they carry in their heads and can't explain *why* a design was rejected. **Design opportunity: a *decision workspace*, not a chat box.**

## What they produce
- **ADRs** — one decision each, append-only. Nygard format: **Context / Decision / Consequences** + Status + Alternatives considered + increasingly a review trigger. 1-2 pages, in-repo, numbered, markdown.
- **RFCs / design docs** — broader, seek feedback before building. Problem → Proposed Solution → per-component detail → tradeoffs → alternatives → risks. "A one-page RFC beats a 10-page doc no one reads."
- **Vendor evaluations & tech-debt reviews** — increasingly framed in business/financial terms (cost-of-doing-nothing, options compared). AI-generated code is now a named debt driver.

## Workflow
Gather context first (prior ADRs, codebase, constraints, the unwritten rules) → draft from template → circulate to pre-readers → async review where approvers sign/object → refine → design-review meeting. On screen: repo, prior decision log, the doc, a DM thread chasing reviewers.

## Good vs. mediocre
**Good** maps the tradeoff instead of selling the decision — specific, concise, honest about consequences and what was *not* chosen. **Mediocre/rejected**: "brochure language," after-the-fact justification for a politically-locked decision ("engineers smell it immediately"), 10-page docs nobody reads. "Done" = approvers signed, consequences explicit, status set.

## Workspace preferences
Context **on-screen while writing**: prior decision log, relevant codebase files, constraints, the template. Lightweight markdown, in-repo, diffable, indexed. Hate process bureaucracy and chasing reviewers in DMs — want review status + pre-reader feedback inline.

## Design implications for the Engineering Studio
- Feel like a **decision workspace**, not a chat box.
- Pull in **prior ADRs/RFCs as visible context** (the sidebar's `recentDecisionsSection` is exactly right — make it load-bearing).
- Draft into **real ADR/RFC templates** — Context/Decision/Consequences, tradeoff-mapped.
- **Force capture of alternatives-not-chosen** — the thing AI omits and reviewers demand.
- Track review/approver status; never produce "brochure language."

## Sources
LeadDev (staff eng reality), adr.github.io + Fowler + AWS (ADR format), Pragmatic Engineer (RFCs/design docs + AI tooling 2026 survey: staff+ lead agent adoption at 63.5%), InfoQ QCon 2026 (tech debt framing), The New Stack ("context is AI coding's real bottleneck").
