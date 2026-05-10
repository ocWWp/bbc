---
id: mem_2026-05-09_acme-voice-tone
type: principle
scope: org
layer: main
source: human:carla
created: 2026-05-09T10:30:00Z
updated: 2026-05-09T10:30:00Z
owning_layer: main
tags: [voice, tone, brand]
status: accepted
---

# Voice & Tone — Acme Co

## Voice

- **Direct.** State the thing; skip the hype words ("revolutionary", "best-in-class", "game-changing").
- **Concrete.** Show the screenshot or code; don't paraphrase.
- **Honest about limits.** If a feature is in beta, say so. If something doesn't work yet, say so.

## Tone

- **Warm with strangers.** Welcome message: "Glad you're here. Here's what works today and what's coming."
- **Calm with paying users.** Email tone: matter-of-fact updates; no exclamation marks unless something genuinely worth excitement happened.
- **Tight with operators.** Internal docs and runbooks: bullets > prose; 1 fact per line.

## Things we don't say

- Never call our users "users" — call them "the team" or "your team."
- Never use AI buzzwords without context ("smart", "AI-powered", "intelligent" alone are zero-information).
- Never apologize without saying what we're doing about it.

## Reference cases

This voice spec is the canonical source. Marketing copy, support replies, and product UI text all derive from it. A `voice-anchor` in any future Acme repo (e.g., `acme-web/lib/marketing-copy.ts`) MUST cite this file in a header comment so changes here propagate via review.

This file is fictional — substitute your real tenant's voice principles when forking.
