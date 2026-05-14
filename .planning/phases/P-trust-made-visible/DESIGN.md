# Phase P — Trust, Made Visible (v1.6)

> Design doc from brainstorming, 2026-05-14. Next step: implementation plan (`PLAN.md`).
> Provenance: triggered by maintainer wanting to "copy competitors" (Claude for Small Business + play.fast/templates). Shaped by 4 research agents (trust / UX / agent-instructions / connectors) + a codex strategy review that read the repo and corrected several assumptions.

## Thesis

BBC already has the moat — typed memory, citations, the accept/reject queue, **and** a 6-connector framework (`apps/dashboard/src/lib/connectors/`: github, linear, gmail, drive, notion, webhook — all with tests). All of it is buried. v1.6 is one move: **surface what's already built.** No new infrastructure bets.

The competitor lens: Anthropic's Claude for Small Business and play.fast/templates sell *promised* safety ("trust our auditors"). BBC's structural difference — OSS, BYOK, every output cited, human accept/reject queue, no background autonomy — is *verifiable* safety. But today BBC buries its own primitives: citations show up only at the end, the queue reads as a dev feature, nobody can see where their data goes. "Wrap it better" = stop burying them.

## Positioning

**Technical-founder wedge, non-technical-friendly interface.** Aim connector priority (GitHub/Linear-native) and verifiability messaging at technical founders like 8azi. But the UI itself stays plain-language and simple enough that a non-technical teammate navigates it without help — labeled fields, no jargon on screen, no raw markdown.

## Decisions locked

- **Templates:** curated depth per role, not breadth. No 100-template chase, but each Studio's gallery must feel capable on first load. (Maintainer call, after codex pushed back on "zero new templates" — a thin gallery kills perceived capability.)
- **Buyer:** technical wedge + simple UX balance (above).
- **Sequencing:** codex's Option A-modified (below).

## Build sequence

### 1. Gallery + plan-before-run
Flat, searchable gallery becomes the home screen. Role is a **filter chip, not a gate**; templates cross-listed under every relevant role. Cards show plain one-liner + output type + which memory the template reads. A *curated depth* pass ensures each of the 8 Studios feels capable on first load.

New **plan step**: after picking a template + inputs, show "here's what I'll do + the candidate memory I'll pull from" → user confirms → generation runs.

> Correction (codex): the plan step is **distinct from** the accept/reject queue. Plan = *intended retrieval scope + candidate sources, before generation*. Queue = *produced output + its real citations, after generation*. Do not collapse them — final citations only exist post-generation.

### 2. Surface + harden the GitHub connector end-to-end
Code exists (`lib/connectors/github.ts`). Wire it into: a visible "Connect" action in the gallery/library, the ingest → propose-typed-memory → accept/reject flow, and a real lifecycle UX (resync, last-sync status, "why did this memory appear?", disconnect, delete source). GitHub **PAT** path — lowest friction, BYOK-native. This step proves the ingest loop is *legible*.

> Correction (codex): "API-key tier = GitHub/Linear" was wrong — GitHub is PAT, Linear is OAuth. GitHub goes first precisely because it's PAT-only.

### 3. Studio Playbooks
Each Studio gets an editable plain-language **playbook** (role, tone, what to cite, when to ask) as labeled UI fields — never raw markdown. Fix the SKILL-parser role/schema mismatch first (codex caught the parser's roles are narrower than the 8 Studios). Stored underneath with versioning + diff + provenance, routed through the existing propose/accept queue. Every run shows a **receipt**: which playbook fired, which memory it cited, what it produced.

> Correction (codex): don't fixate on the "SKILL.md" filename/brand. What matters is versioning, diff review, provenance, prompt-injection scanning, rollback.

### 4. Expand the other built connectors
Linear, Gmail, Drive, Notion — code exists, add the same lifecycle UX as GitHub. OAuth-based (`google-oauth.ts` exists), more friction, hence later. Full connector lifecycle: revoke, resync, delete source, stale/duplicate memory handling, PII consideration, rate-limit and sync-failure surfacing.

### 5. Trust surface — last
Assembled from **real artifacts**, not a brochure: source list, run receipts, queue history, provider bindings, credential locations, last/failed syncs. "Where your data lives" panel. "Nothing runs in the background" indicator. One-click trust report — a generated artifact.

> Correction (codex): a trust surface built before there's activity to show is security theater. It goes last because by then receipts/logs/source-lists exist to populate it honestly.

## Corrections baked in (from codex review)

- **Honest data-handling claim.** Not "data never leaves your infra" — that's false (BYOK LLM calls and connectors send data to *configured* providers). Honest version: "BBC itself holds nothing; data only goes to the providers *you* configure, with scoped previews and audit trails."
- **No progressive delegation.** A "Draft → Draft+notify → Auto-send" toggle contradicts the no-background-autonomy principle. Cut from v1.6 entirely.
- **Cold-start is a first-class risk.** Small businesses don't have clean memory. The first 15 minutes must produce value from messy docs/URLs/repos/paste-dumps — relates to step 1 (gallery first-run) and step 2 (connector gets real data in fast).
- **Distribution.** AGPL + self-host + BYOK is not adoption gravity on its own. A fast hosted-demo path to first cited output is needed.

## Out of scope for v1.6

- Template breadth (the 100-template chase) — curated depth only
- New connectors beyond the 6 that already exist
- Any background autonomy / progressive delegation
- Cross-tenant / marketplace features

## Open risks to carry into PLAN.md

- Connector lifecycle edge cases (revoke/resync/stale/dedup/PII/rate-limits/failures) are real scope, not polish.
- Citations ≠ correctness — conflict handling, source confidence, missing-memory detection, "could not verify" behavior still needed (likely beyond v1.6, but name it).
- SKILL-parser role/schema mismatch must be fixed before Playbooks ship as universal across 8 Studios.
