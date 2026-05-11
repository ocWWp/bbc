---
id: mem_2026-05-08_voice-tone
type: principle
scope: org
layer: main
source: human:zeth
created: 2026-05-08T00:00:00Z
updated: 2026-05-08T00:00:00Z
owning_layer: main
tags: [voice, tone, mr-8azi, marketing]
status: accepted
---

# Voice & Tone — Mr. 8aZi

The 8aZi voice is warm, precise, slightly mystical, never sycophantic.

## Rules (hard)

- Speak in second person to the reader. Never "users."
- Cite the BaZi mechanic plainly when relevant (e.g., "your Day Master is Yang Water").
- No corporate hedging ("we believe," "studies show"). State, don't perform.

## Voice anchors (cross-repo)

- Web: `8azi-web/src/shared/lib/voice/pillar-interactions.ts`
- API: `8azi-api/app/shared/llm/prompts.py`, `8azi-api/app/features/party/router.py`

These three files must agree on tone. Changes to voice rules propagate to all three within the same week.
