# Phase I — Onboarding Magic Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the existing static `/welcome` explainer tour with a 3-step magic-moment onboarding: brain-dump → Claude-extracted typed proposals → animated reveal → bulk accept. This is the "oh, I get it" moment — the demo you'd show in a launch tweet.

**Output:** After Phase I, a fresh sign-up types or pastes a paragraph about their product/voice/team into `/welcome`, sees BBC structure it into typed memory items in real time, and clicks "Accept all" to populate their brain in one motion.

**Architecture:**
- LLM: Claude Sonnet 4.6 via `@anthropic-ai/sdk` with tool use for strict JSON output
- Server action `extractMemoryProposals(text)` — single round-trip, returns `{ proposals: Array<{ type, title, fields, body }> }`
- Client: framer-motion stagger for the reveal animation; client-side edit-before-accept; bulk accept fires Phase H's `createBlankItem` + `updateMemoryItem` in a loop
- Recovery: simple "continue onboarding" React Email template using Phase G's `sendEmail`

**Working directory:** Run all commands from repo root.
**Branch:** `phase-i-onboarding`
**Commit cadence:** One per task. Group 1 sets up extraction, Group 2 builds the UI, Group 3 wires bulk accept, Group 4 ships recovery email, Group 5 verifies.

---

## Group 1 — LLM extractor (4 tasks)

### Task I.1: Install Anthropic SDK + env example

```bash
pnpm --filter @bbc/dashboard add @anthropic-ai/sdk
```

Update `apps/dashboard/.env.example` to add:
```
# === Anthropic (onboarding extractor) ===
# From https://console.anthropic.com/settings/keys
ANTHROPIC_API_KEY=
```

**Commit:** `Phase I.1: install @anthropic-ai/sdk + ANTHROPIC_API_KEY env`

---

### Task I.2: Define extractor types + zod validation

Create `apps/dashboard/src/lib/memory/extractor/types.ts`:
- `Proposal` type: `{ type: Supertag, title: string, fields: unknown, body: string }`
- `ProposalsResponseSchema` — zod array validator using `supertagSchemas`

**Commit:** `Phase I.2: define extractor proposal schema`

---

### Task I.3: System prompt + tool definition

Create `apps/dashboard/src/lib/memory/extractor/prompt.ts`:
- System prompt explaining the 7 supertags + when to use each
- Tool definition with strict JSON schema matching `Proposal[]`
- Few-shot examples for tricky cases (when to use `voice` vs `product`, when to split paragraphs into multiple items)

**Commit:** `Phase I.3: extractor system prompt + tool schema`

---

### Task I.4: Server action `extractMemoryProposals`

Create `apps/dashboard/src/app/welcome/actions.ts`:
- `extractMemoryProposals(text: string): Promise<{ proposals: Proposal[] } | { error: string }>`
- Calls Claude Sonnet 4.6 via `@anthropic-ai/sdk` with `tools: [extractProposalsTool]` and `tool_choice: { type: "tool", name: "extract_proposals" }`
- Validates response against `ProposalsResponseSchema`
- Falls back to empty array on validation failure with `error` field set
- Rate-limited via simple in-memory check (max 5 extractions per user per minute)

**Commit:** `Phase I.4: extractMemoryProposals server action`

---

## Group 2 — Onboarding stepper UI (5 tasks)

### Task I.5: Replace WelcomeTour with onboarding shell

Rewrite `apps/dashboard/src/app/welcome/page.tsx` + `WelcomeTour.tsx` → `Onboarding.tsx`:
- 3-step stepper: `dump` → `review` → `done`
- Progress indicator at top (3 segmented bars, animated fill)
- Skip button (top-right) saves `bbc.welcome.skipped=1` in localStorage and routes to `/`
- Wraps a framer-motion AnimatePresence so steps slide in/out

**Commit:** `Phase I.5: replace WelcomeTour with 3-step onboarding shell`

---

### Task I.6: Step 1 — Brain dump textarea

Create `apps/dashboard/src/app/welcome/_steps/dump-step.tsx`:
- Big textarea (16 rows, monospace-leaning prose), autofocus
- Placeholder rotates between 3 prompts via framer-motion every 4s:
  - "We're a developer-tools startup helping early-stage founders ship faster..."
  - "Our voice is direct and lowercase. We never use the word 'leverage'..."
  - "Our team is Sarah (PM), Alex (engineering), and Mei (design)..."
- Character counter (700-2000 sweet spot)
- "Structure my brain →" submit button (disabled below 100 chars, brain accent above)

**Commit:** `Phase I.6: brain-dump textarea with rotating placeholder + char counter`

---

### Task I.7: Loading state with extractor progress

Create `apps/dashboard/src/app/welcome/_steps/extracting-step.tsx`:
- Shows after submit, before results arrive
- Animated "Structuring..." with 3 phases that fade in: "Reading your brain", "Identifying patterns", "Almost there..."
- Each phase shows for ~2s — total ~6s budget (matches Sonnet 4.6 latency for ~1k tokens)
- Brain accent shimmer effect via framer-motion

**Commit:** `Phase I.7: extracting loading state with phased status copy`

---

### Task I.8: Step 2 — Animated reveal of proposals

Create `apps/dashboard/src/app/welcome/_steps/review-step.tsx`:
- Receives `proposals: Proposal[]` from server action result
- Each proposal renders as a card (TypeChip + title + body preview + per-supertag field highlights)
- Stagger entrance: 80ms delay per card, spring physics
- Each card has inline edit (click title to rename) + dismiss button (X) + per-card hover state
- Top-right counter: "{n} items ready"
- Bottom CTA: "Accept all" (brain accent, big) + "Edit one by one" (subtle)

**Commit:** `Phase I.8: animated reveal of extracted proposals with edit/dismiss`

---

### Task I.9: Step 3 — Success state

Create `apps/dashboard/src/app/welcome/_steps/done-step.tsx`:
- Confetti-like reveal (just framer-motion scale + opacity, no particle lib)
- Stats summary: "{n} items added to your brain"
- 2 CTAs: "Open my brain →" (routes to /memory) + "Show me around →" (routes to /memory/[first-id])

**Commit:** `Phase I.9: success step with stats + CTAs`

---

## Group 3 — Bulk accept (3 tasks)

### Task I.10: `bulkAcceptProposals` server action

Add to `apps/dashboard/src/app/welcome/actions.ts`:
- `bulkAcceptProposals(proposals: Proposal[]): Promise<{ created: number; firstId: string | null; errors: string[] }>`
- For each proposal: insert directly into `memory_files` with status='active' (skip the createBlankItem indirection — this is the bulk path)
- Returns count + first ID (for "Show me around" CTA)
- Wrapped in a single supabase call where possible (insert multiple rows at once)

**Commit:** `Phase I.10: bulkAcceptProposals server action`

---

### Task I.11: Wire Accept all + transition to done

In `review-step.tsx`:
- "Accept all" button triggers `bulkAcceptProposals` in a transition
- On success, advance to `done` step with the count + firstId
- On error, show error chip, keep proposals visible for retry

**Commit:** `Phase I.11: wire bulk accept + state transitions`

---

### Task I.12: Per-card field tweaks before accept

Allow inline edits on the review step:
- Click title → contentEditable
- For voice: edit register dropdown inline
- For decision: tweak status dropdown
- For team: edit name field
- Changes update local state; flushed during bulkAcceptProposals

**Commit:** `Phase I.12: per-card inline edits before bulk accept`

---

## Group 4 — Recovery email (2 tasks)

### Task I.13: Continue-onboarding email template

Create `apps/dashboard/src/emails/continue-onboarding.tsx` using React Email + Phase G's shared shell:
- Subject: "Your brain is waiting"
- Body: One paragraph + CTA button to `/welcome`
- Footer: signature + unsubscribe

**Commit:** `Phase I.13: continue-onboarding React Email template`

---

### Task I.14: `sendContinueOnboarding` helper + lifecycle hook

Add to `apps/dashboard/src/lib/email.ts`:
- `sendContinueOnboarding(to: string, tenantSlug: string)` — typed wrapper around Resend
- For v1: NOT auto-scheduled. Just a manual helper that can be called from an admin script later. Add a TODO for the cron job (separate phase).

**Commit:** `Phase I.14: sendContinueOnboarding email helper`

---

## Group 5 — Verification (2 tasks)

### Task I.15: Type-check + production build

```bash
pnpm --filter @bbc/dashboard type-check
pnpm --filter @bbc/dashboard build
```

Both must pass. Fix any failures before next task.

**Commit:** none (verification gate).

---

### Task I.16: Browser smoke test

With dev server running:
1. Visit `/welcome` (unauth → redirects to signin, that's fine — we want the visual quality of the page)
2. Mock-load `/welcome` while signed in — verify stepper progress fills, textarea autofocuses, placeholder rotates
3. Type 200+ chars, click "Structure my brain" — verify extracting state appears
4. Verify review step animation (one card per ~80ms)
5. Dark mode: toggle theme, verify legibility on textarea + cards
6. Accept all → done step → verify CTAs route correctly

Screenshot each step. Visual quality bar: should feel as polished as Linear's onboarding.

**Commit:** none (verification only).

---

## Summary

| Group | Tasks | What ships |
|---|---|---|
| 1. LLM extractor | I.1–I.4 | Anthropic SDK installed, system prompt + tool definition, `extractMemoryProposals` action |
| 2. Stepper UI | I.5–I.9 | 3-step shell, brain-dump textarea, extracting loader, animated proposal reveal, success state |
| 3. Bulk accept | I.10–I.12 | Bulk insert action, wired CTA, per-card inline edits |
| 4. Recovery email | I.13–I.14 | React Email template + send helper (no cron yet) |
| 5. Verification | I.15–I.16 | Type-check, build, browser smoke |

**Total: 16 tasks, ~1.5 weeks of planned work (executed in this session).**

**Risks:**
- LLM latency variance — if Claude takes >10s the extracting state feels broken. Mitigation: phased copy ("Almost there...") gives the impression of progress.
- Extraction quality on short dumps — the 100-char minimum is arbitrary; may need to bump to 200 if results are sparse.
- Bulk accept could hit RLS row limits — mitigate with a per-batch chunk of 20.

**Phase I is complete when:**
1. All 16 tasks committed atomically.
2. Type-check + build clean.
3. Smoke test in I.16 passes (visual quality bar met).
4. A real signed-in user can paste 300+ chars and get 3+ typed proposals back within 10s.
