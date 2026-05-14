# Persona research — Legal (2026)

> Deep-research agent output, 2026 sources. New role (not in the original 5).
> **Read the liability boundary section before designing this Studio.**

## Summary
Legal at an early-stage startup is not a person — it's a **founder doing legal between other jobs**, backed by **outside counsel**, plus a **fractional GC** ($5-20K/mo) past seed. Work splits into high-volume templatable paperwork the founder self-serves and a smaller set of judgment-heavy items that must go to a lawyer.

## ⚠️ The liability boundary (the #1 design constraint)
The Legal Studio is a **drafting assistant, not a legal advisor.** It produces *first drafts and organized context for counsel* — never legal advice. Crossing that line is unauthorized-practice-of-law (UPL) risk AND a trust killer — it's exactly where AI tools are being sued (OpenAI / Nippon Life, 2026). Legal AI hallucinated 17-34%+ in benchmarks; 1,300+ catalogued hallucination cases, $145K+ in Q1 2026 sanctions. The Studio must:
- Carry a **persistent, unmissable "not legal advice — for attorney review" disclaimer** (first-class UI element, not fine print).
- Frame every output as a **draft**.
- Preserve an editorial/audit trail.
- Actively prompt **"send this to your lawyer"** for counsel-critical categories.
- **Never** tell a founder a document is "safe to use" or "enforceable."

## What they produce / need drafted
- **Templatable (founder self-serves, light counsel review):** mutual/one-way NDAs, contractor/consultant agreements (IP-assignment + work-for-hire), offer letters / standard employment terms, IP assignment agreements, vendor/SaaS agreements, basic privacy policies & ToS, mutual-template customer contracts.
- **Templatable but counsel-critical:** SAFE/financing summaries, board consents, stock plan adoption, cap-table-affecting docs, compliance checklists.
- **Truly needs a lawyer:** anything affecting equity/ownership, financings, regulated verticals, multi-jurisdiction, disputes, non-standard negotiated terms, final sign-off on customer-facing policies.

## Workflow
Gather context first (parties' legal names, one-way vs mutual, scope, purpose, duration, jurisdiction; for contractor: IP assignment; for privacy policy: *what data is actually collected*) → start from a trusted template (Clerky / Common Paper / YC) → fill specifics → self-send if routine + low-risk, else route to counsel. **The bottleneck is step 1** — founders don't know what context to assemble — and cost anxiety on step 4.

## Good vs. risky
**Good:** specific, narrowly-scoped definitions; accurate to actual business practice (a privacy policy must mirror real data flows); standard market terms; correct party names + jurisdiction. **Risky:** vague/overbroad confidentiality, outdated templates copy-pasted without customization, policies that misstate practices, missing IP-assignment clauses. They "know it's safe" through **counsel review** — the editorial accept/edit/reject chain is the defensibility mechanism.

## Design implications for the Legal Studio
- Position as **"draft + triage + counsel handoff,"** never advisor.
- Lead with **context-gathering** (the real founder bottleneck) + a **"needs a lawyer / safe to self-serve" classifier** per document type.
- Output **first drafts with an audit trail**, formatted for easy counsel review.
- **Anchor templates to trusted sources** (YC, Common Paper, Clerky-style) rather than free-generating legal language.
- BBC's existing "never auto-sent" + queue-review posture fits this well — make the disclaimer and the counsel-handoff prompt loud.

## Sources
First Round Review (founder's guide to lawyers), Monu + BizTech Lawyers (fractional GC), PolicyOwn + Entrepreneur Legal (startup legal doc checklists), Stripe (NDAs), Clerky (YC stock plan), Spellbook (AI for startup lawyers + "treat every output as a first draft"), Ironclad Jurist, Pashman Stein + Legal.io + Thomson Reuters (UPL risk, OpenAI suit), ComplianceHub + Stanford HAI (hallucination rates), Termly + ContractsCounsel (privacy policy / lawyer需求).
