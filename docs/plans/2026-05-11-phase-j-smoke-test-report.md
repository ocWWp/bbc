# Phase J.17 — Browser smoke test report

**Branch:** `phase-j-marketing-studio`
**Date:** 2026-05-11
**Env:** local dev, stub Supabase mode (no `NEXT_PUBLIC_SUPABASE_URL`)

## What was verified locally

1. **Type-check** — `pnpm exec tsc --noEmit` clean. ✓
2. **Production build** — `pnpm --filter @bbc/dashboard build` succeeds.
   `/studio/marketing` appears in the route table as `ƒ` (dynamic). ✓
3. **Dev server boots** — `pnpm dev --port 3001` starts cleanly. ✓
4. **Unauthenticated redirect** — visiting `/studio/marketing` while signed
   out returns HTTP 307 → `/auth/signin?callbackUrl=%2Fstudio%2Fmarketing`.
   The signin page loads without runtime errors. ✓ *(Caught one stale path
   in the same pass: the page redirected to `/auth/sign-in` with a `next=`
   param; the real route is `/auth/signin` with `callbackUrl=`. Fixed in
   the follow-up commit.)*

## What requires staging to verify

The 10 plan verifications need three things this env doesn't provide:
- A running Supabase project (so RLS auth + DB inserts work)
- A real `ANTHROPIC_API_KEY` (so `proposeWorkflows` / `runWorkflow` /
  `proposeOverride` produce real LLM output)
- A signed-in user with non-empty `memory_files` for that tenant (so the
  brain summary has content + citations are possible)

Once those three are in place, each item below is the explicit pass criterion.

| # | Plan check | Pass criterion |
|---|---|---|
| 1 | Task entry | Typing "draft a launch tweet for our v1.0 announcement" + submit shows 2-4 candidate cards. Each card has a label, "Option N" tag, rationale, and arrow chip. |
| 2 | Pick + run | Picking "Single X post" reveals a configuring card with Angle (required) + Tone (default "match brand voice"). Filling Angle and clicking Run shows the running skeleton, then the X-card preview. |
| 3 | Citations | Output contains at least one `[N]` superscript. Clicking navigates to `/memory/[id]`. The citation strip below lists cited memories with type chips. |
| 4 | Accept / reject | Clicking Approve or Reject swaps the action strip to "Accepted · ready to ship" (or "Rejected · saved for context") + "New task" button. The DB row's `status` flips accordingly. |
| 5 | Recent chips | After accepting, refresh the page. The "Recent" row above the textarea shows a chip with template label + truncated task + relative age. Clicking pre-loads the configuring stage with the saved inputs. |
| 6 | Edit chat | Clicking "Edit this workflow" opens the overlay. Typing "always include our product taglines" + propose change shows the structured override (kind + summary + value detail). Save persists. Running the workflow again hits the `overridesClause` merge — verify the rendered output reflects the customization. The ConfigureStage pill shows "1 customization". |
| 7 | Cross-platform campaign | Picking that template emits multiple OutputBlocks in the canvas (X + LinkedIn + Threads, depending on what the LLM emits per the `which platforms` input). All blocks render in their correct platform cards. |
| 8 | Light + dark | Toggle the theme (Nav has ThemeToggle). All seven preview cards remain legible. Studio-accent dots/buttons follow the theme. |
| 9 | No-brain edge case | Drop the user's `memory_files` to zero, run a workflow. The output should still render content but the citation strip is empty (filtered to 0). |
| 10 | LLM failure | Temporarily set `ANTHROPIC_API_KEY=invalid`. Submitting from any stage shows the action-specific error string in the destructive callout. A row is still inserted in `studio_runs` with `status='error'` and `error_message=...`. |

## Migrations gate

Before any of the above passes, apply Phase J migrations against staging:

- `0023_studio_runs.sql` — table + `studio_run_status` enum + 3 RLS policies
- `0024_studio_template_overrides.sql` — table + `studio_override_kind` enum
  + 3 RLS policies

Same pattern as the I.20 checklist at
`docs/plans/2026-05-11-phase-i20-migration-checklist.md`.

## Branch diff summary

17/17 plan tasks committed:

```
J.1   Migration: studio_runs
J.2   Migration: studio_template_overrides
J.3   ADR-0006 + lock-matrix
J.4   Template interface + shared prompt fragments
J.5   Ten hand-authored templates + registry
J.6   proposeWorkflows server action
J.7   runWorkflow + citation validation
J.8   acceptStudioRun / rejectStudioRun / editStudioRun
J.9   Seven platform preview cards + CitedText
J.10  OutputBlocks renderer + citation strip
J.11  /studio/marketing task entry + candidate grid
J.12  Mini-onboarding + canvas + action strip
J.13  Recent runs quick-launch chips
J.14  proposeOverride + saveStudioTemplateOverride + EditWorkflowChat
J.15  ActiveOverridesPill + override deactivation
J.16  Type-check + production build green
J.17  Smoke test (this report) + signin-redirect fix
```

## Next gates before Phase K

1. Apply both Phase I.20 + Phase J migrations to staging.
2. Run the 10 smoke-test verifications above on a staging deploy with a
   seeded brain.
3. Merge `phase-j-marketing-studio` → `main`.
4. Open Phase K plan (marketplace + MCP writes + Stripe).
