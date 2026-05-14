# Persona research — Support / CX (2026)

> Deep-research agent output, 2026 sources.

## Summary
Support at a 5-50 person startup is a "team of one to three" — often the first non-eng/non-founder hire. Generalists: support + QA + product-feedback conduit + docs writer. Day is **reactive, interrupt-driven** — a live queue across email/chat/Slack, punctuated by incidents. Measured on FRT (<40s chat, <4h email), FCR (70-79% good), CSAT (80%+ strong) — and increasingly AI deflection rate + handoff quality. **Design opportunity: a single-pane workspace where context is always visible beside a draft, AI drafts grounded + voice-matched, human is unambiguously editor-in-chief.**

## What they produce (each has distinct tone/format)
- **Customer replies** — the bulk. Personalized, specific, acknowledge-then-solve, mirror the customer's tone.
- **Saved replies / macros** — they author *and maintain* the library; macro hygiene is real work.
- **Churn-save messages** — warm, low-pressure, value-reframing.
- **Bug-ack replies** — prompt acknowledgment + info-gathering + honest ETA.
- **Incident communications** — terse, factual, frequent status updates.
- **Feature-request acks** — thank, be transparent about roadmap, don't close the door.
- **Internal escalation packets** to eng — full context (error, repro, account, what was tried).
- **KB/docs updates** — repeat tickets → articles.

## Workflow
Ticket arrives → gather context first (customer history/account, past tickets, product docs, known-issues, increasingly an AI summary) → draft (from AI suggestion or macro) → personalize → send. Open simultaneously: conversation thread, customer/CRM panel, KB, macro library. Friction = context-switching across systems.

## Good vs. robotic
Good = acknowledges frustration before solving, **specific** (names, timelines, exact next steps), owns the issue, natural language, varies phrasing. Robotic = "I apologize for any inconvenience," "that's our policy," vague timelines, scripted sameness. **A technically correct answer in the wrong tone makes customers angrier.** Review is mostly real-time, self-directed — rarely a second person.

## Workspace preferences
Context **without tab-switching** — customer history, past tickets, known issues, docs in one view beside the reply box. Macro library one keystroke away. Hate: generic drafts they rewrite from scratch, hallucinated product/account details, wrong tone, forgotten mid-conversation context, broken handoffs.

## Design implications for the Support Studio
- Single-pane: context always visible beside the draft surface.
- AI produces **grounded, voice-matched first drafts the human edits** — not autonomous responses (customer-side AI backlash is real and rising).
- **Macro library + escalation-packet generation are first-class**, not afterthoughts.
- Human unambiguously controls what gets sent (BBC already does this — "never auto-sent" is in the role blurb; keep it loud).

## Sources
Lorikeet CX + Intercom + Bluetweak (FRT/FCR/CSAT benchmarks + emerging AI metrics), First Round Review (early CX hiring), Pylon (founder-led support scaling wall, escalation packets), Gorgias (phrases to use/avoid), Emailmeter (templates), AnswerConnect + Yahoo Finance (AI backlash 54%→59%, 85% prefer humans), Zendesk/Kustomer (copilots), Intryc (QA 4C framework).
