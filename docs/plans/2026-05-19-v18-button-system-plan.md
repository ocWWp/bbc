# v1.8 Button System Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Consolidate three coexisting button systems (.btn-primary/--paper-accent, shadcn --primary, .home-pilot --home-accent + brain/studio variants) into one monochrome white-on-dark / black-on-light primary token system, while preserving per-type identity colors on role chips, memory tags, and recommended badges.

**Architecture:** Token-first CSS consolidation. Add a `--btn-*` token block to `globals.css`, alias shadcn's `--primary` to it, rewrite the existing four button rule sites to consume the tokens, delete `brain`/`studio` variants from `ui/button.tsx` and migrate their 7 callsites to `variant="default"`. Upgrade citation chips to inherit `--t-<type>` color from the cited memory's type. Zero changes to the 35+ callsites that already use `bg-primary` or `.btn-primary` — they auto-conform via the token aliases.

**Tech Stack:** Next.js 16, React 19, Tailwind CSS (custom variants via `@custom-variant dark`), shadcn/ui (class-variance-authority), framer-motion, vitest + testing-library, next-themes.

**Design doc:** `docs/plans/2026-05-19-v18-button-system-design.md`

**Branch:** `design/v18-button-system` (design doc already committed at `36bef43`). Continue on this branch.

---

## Phase 1 — Tokens (additive, zero callsite impact)

### Task 1: Add `--btn-*` token block to `globals.css`

**Files:**
- Modify: `apps/dashboard/src/app/globals.css` — add new block after line 87 (after `--paper-accent-soft` light-mode block) AND inside the `.dark` block near line 172 (after `--paper-accent-soft` dark override)

**Step 1: Locate insertion points**

Run: `grep -n "paper-accent-soft" apps/dashboard/src/app/globals.css`
Expected: shows two lines — the light-mode definition (~line 85) and the dark override (~line 172).

**Step 2: Insert light-mode tokens**

Inside the existing `:root` block (the paper-palette area, after the line containing `--paper-accent-soft: #f3d9c8;`), add:

```css
  /* ============================================================
     v1.8 BUTTON SYSTEM — single source of truth.
     Primary auto-inverts in dark mode via the --paper-ink / --paper
     flip already defined in the .dark block below.
     ============================================================ */
  --btn-primary-bg:        var(--paper-ink);
  --btn-primary-fg:        var(--paper);
  --btn-primary-hover-bg:  var(--paper-ink-2);
  --btn-primary-border:    transparent;
  --btn-focus-ring:        color-mix(in oklab, var(--paper-ink), transparent 50%);

  --btn-secondary-bg:      transparent;
  --btn-secondary-fg:      var(--paper-ink);
  --btn-secondary-border:  var(--paper-rule-2);
  --btn-secondary-hover-bg: color-mix(in oklab, var(--paper-ink), transparent 95%);

  --btn-ghost-bg:          transparent;
  --btn-ghost-fg:          var(--paper-muted);
  --btn-ghost-hover-bg:    color-mix(in oklab, var(--paper-ink), transparent 92%);
  --btn-ghost-hover-fg:    var(--paper-ink);

  --btn-disabled-opacity:  0.4;
```

**Step 3: Insert dark-mode override**

Inside the existing `.dark` block (the paper-palette dark area, after `--paper-accent-soft: #3a2417;`), add:

```css
  /* v1.8 button system — hover wants brighter in dark, but
     --paper-ink-2 in dark mode goes darker (#d8d3c2). Override
     to nudge brighter on hover. Other --btn-* tokens auto-invert. */
  --btn-primary-hover-bg:  #ffffff;
```

**Step 4: Add shadcn aliases**

Inside the shadcn `:root` block (the oklch tokens area near line 46 where `--primary: oklch(0.205 0 0);` is defined), REPLACE the `--primary` and `--primary-foreground` lines with:

```css
  --primary:               var(--btn-primary-bg);
  --primary-foreground:    var(--btn-primary-fg);
```

Inside the shadcn `.dark` block (near line 140 where `--primary: oklch(0.922 0 0);` is defined), REPLACE the dark `--primary`/`--primary-foreground` lines with:

```css
  --primary:               var(--btn-primary-bg);
  --primary-foreground:    var(--btn-primary-fg);
```

The `var()` indirection inherits from the `--paper-*` token flip — no second dark override needed.

**Step 5: Verify build**

Run: `pnpm --filter @bbc/dashboard build`
Expected: build succeeds, no CSS errors, no Tailwind errors.

**Step 6: Commit**

```bash
git add apps/dashboard/src/app/globals.css
git commit -m "feat(buttons): add --btn-* token block + shadcn --primary aliases

Pure additive — no rule changes yet. Tokens read from existing --paper-*
variables so they auto-invert in dark mode. Subsequent commits rewrite
the four button-rule sites to consume these tokens."
```

---

## Phase 2 — Rewrite generic `.btn-*` rules

### Task 2: Rewrite `.btn-primary` + `.btn.primary` + `.btn-ghost` to use tokens

**Files:**
- Modify: `apps/dashboard/src/app/globals.css:304-310` (and surrounding rules — find the exact end of the `.btn-*` block)

**Step 1: Locate existing rules**

Run: `grep -n "btn-primary\|btn-ghost\|btn\.primary\|btn-secondary" apps/dashboard/src/app/globals.css`
Expected: rules near line 304-330. Read the full block (Read tool, lines 295-340) to see the current paint logic.

**Step 2: Replace with token-driven rules**

Replace the existing `.btn-primary`, `.btn.primary`, `.btn-ghost` rules (including their `:hover`, `:focus-visible`, and `:disabled` variants) with:

```css
/* v1.8 button system — all primaries use --btn-primary-* tokens.
   See docs/plans/2026-05-19-v18-button-system-design.md. */
.btn-primary,
.btn.primary {
  background: var(--btn-primary-bg);
  color: var(--btn-primary-fg);
  border: 1px solid var(--btn-primary-border);
  transition: background 120ms ease, transform 80ms ease;
}
.btn-primary:hover,
.btn.primary:hover {
  background: var(--btn-primary-hover-bg);
}
.btn-primary:focus-visible,
.btn.primary:focus-visible {
  outline: 2px solid var(--btn-focus-ring);
  outline-offset: 2px;
}
.btn-primary:disabled,
.btn.primary:disabled,
.btn-primary[aria-disabled="true"],
.btn.primary[aria-disabled="true"] {
  opacity: var(--btn-disabled-opacity);
  cursor: not-allowed;
}

.btn-ghost,
.btn.ghost {
  background: var(--btn-ghost-bg);
  color: var(--btn-ghost-fg);
  border: 1px solid transparent;
  transition: background 120ms ease, color 120ms ease;
}
.btn-ghost:hover,
.btn.ghost:hover {
  background: var(--btn-ghost-hover-bg);
  color: var(--btn-ghost-hover-fg);
}
.btn-ghost:focus-visible,
.btn.ghost:focus-visible {
  outline: 2px solid var(--btn-focus-ring);
  outline-offset: 2px;
}
.btn-ghost:disabled,
.btn.ghost:disabled {
  opacity: var(--btn-disabled-opacity);
  cursor: not-allowed;
}
```

If the existing block has a `.btn-secondary` rule, add a matching token-driven one. If not, add a fresh one:

```css
.btn-secondary,
.btn.secondary {
  background: var(--btn-secondary-bg);
  color: var(--btn-secondary-fg);
  border: 1px solid var(--btn-secondary-border);
  transition: background 120ms ease, border-color 120ms ease;
}
.btn-secondary:hover,
.btn.secondary:hover {
  background: var(--btn-secondary-hover-bg);
  border-color: var(--paper-ink);
}
.btn-secondary:focus-visible,
.btn.secondary:focus-visible {
  outline: 2px solid var(--btn-focus-ring);
  outline-offset: 2px;
}
.btn-secondary:disabled,
.btn.secondary:disabled {
  opacity: var(--btn-disabled-opacity);
  cursor: not-allowed;
}
```

**Step 3: Build + type-check**

Run: `pnpm --filter @bbc/dashboard build && pnpm --filter @bbc/dashboard type-check`
Expected: both pass.

**Step 4: Run existing tests**

Run: `pnpm --filter @bbc/dashboard test --run`
Expected: all green. If any test snapshots break on color values, update them — the visual change is intended.

**Step 5: Visual smoke (manual)**

Start `pnpm --filter @bbc/dashboard dev`, sign in, click through /settings/log, /memory, /library landing — surfaces using `.btn-primary`. Confirm primaries render in monochrome (dark mode: white/cream; light mode: near-black).

**Step 6: Commit**

```bash
git add apps/dashboard/src/app/globals.css
git commit -m "feat(buttons): rewrite .btn-primary/.btn-ghost/.btn-secondary to use tokens

Removes --paper-accent from the generic button rules. All callsites
using .btn-primary class auto-pick-up monochrome paint."
```

---

## Phase 3 — /home chrome (`home-send` + `session-rail-new-chat`)

### Task 3: Rewrite `.home-pilot .home-send` to monochrome primary

**Files:**
- Modify: `apps/dashboard/src/app/globals.css:4946` (and the `:hover`/`:disabled` variants at ~4952-4965)

**Step 1: Locate existing rule**

Run: `grep -n "home-send" apps/dashboard/src/app/globals.css`
Expected: 3-5 hits around line 4946.

**Step 2: Replace with token-driven rule**

Replace the existing `.home-pilot .home-send` + its `:hover`/`:disabled` rules with:

```css
/* Primary CTA — monochrome via --btn-primary-* tokens. */
.home-pilot .home-send {
  background: var(--btn-primary-bg);
  color: var(--btn-primary-fg);
  border: 1px solid var(--btn-primary-border);
  font-weight: 600;
  transition: background 120ms ease;
}
.home-pilot .home-send:hover {
  background: var(--btn-primary-hover-bg);
}
.home-pilot .home-send:focus-visible {
  outline: 2px solid var(--btn-focus-ring);
  outline-offset: 2px;
}
.home-pilot .home-send:disabled {
  opacity: var(--btn-disabled-opacity);
  cursor: not-allowed;
}
```

**Step 3: Build + visual smoke**

Run: `pnpm --filter @bbc/dashboard dev`. Open /home in dark and light mode. Send button should read as primary monochrome — no green, hover lifts cleanly.

**Step 4: Commit**

```bash
git add apps/dashboard/src/app/globals.css
git commit -m "feat(home): rewrite Send button to monochrome via --btn-primary-* tokens"
```

### Task 4: Demote `.session-rail-new-chat` to secondary outline

**Files:**
- Modify: `apps/dashboard/src/app/globals.css:4985-5020` (the new-chat block)

**Step 1: Replace rule**

Replace the existing `.home-pilot .session-rail-new-chat` block (including `:hover`, `:active`, `:focus-visible`) with:

```css
/* Secondary outline — sits in the rail under the chat list.
   Was primary lime; demoted in v1.8 to keep Send as the one primary. */
.home-pilot .session-rail-new-chat {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  width: 100%;
  height: 36px;
  padding: 0 12px;
  border-radius: 8px;
  background: var(--btn-secondary-bg);
  color: var(--btn-secondary-fg);
  border: 1px solid var(--btn-secondary-border);
  font-size: 14px;
  font-weight: 500;
  line-height: 1;
  text-decoration: none;
  transition: background 120ms ease, border-color 120ms ease, transform 80ms ease;
}
.home-pilot .session-rail-new-chat:hover {
  background: var(--btn-secondary-hover-bg);
  border-color: var(--paper-ink);
}
.home-pilot .session-rail-new-chat:active {
  transform: scale(0.985);
}
.home-pilot .session-rail-new-chat:focus-visible {
  outline: 2px solid var(--btn-focus-ring);
  outline-offset: 2px;
}
```

**Step 2: Update test if class assertion exists**

Run: `grep -rn "session-rail-new-chat" apps/dashboard/src --include='*.test.*'`
Expected: any tests asserting on the old lime background must be updated. If a test asserts only on the class name + label "New chat", it stays green.

**Step 3: Build + visual smoke**

`pnpm --filter @bbc/dashboard dev`. /home rail: New chat now reads as outline button, Send pops as primary. Hierarchy is correct.

**Step 4: Commit**

```bash
git add apps/dashboard/src/app/globals.css apps/dashboard/src/components/chat-home/*.test.tsx
git commit -m "feat(home): demote New chat to secondary outline (fixes inverted hierarchy)

Send button is now the visually-loudest CTA on /home, matching its role
as the page's primary action."
```

### Task 5: Delete `--home-accent` definitions

**Files:**
- Modify: `apps/dashboard/src/app/globals.css:4812` (light-mode `--home-accent: #e0ff54;` + `--home-accent-ink: #15140f;`)
- Modify: `apps/dashboard/src/app/globals.css:4833` (dark-mode block of `.dark .home-pilot`)

**Step 1: Find all usages**

Run: `grep -n "home-accent" apps/dashboard/src/app/globals.css`
Expected: ~6-8 hits. If after Tasks 3+4 there are remaining usages (e.g. in `.home-pilot [data-testid^="action-card-"]` or anywhere else), each one needs a replacement.

**Step 2: Replace remaining usages with monochrome or per-type tokens**

For each remaining usage of `var(--home-accent)`:
- If it's a button state → already handled in Tasks 3+4.
- If it's an "active" indicator → use `var(--paper-ink)` with low-opacity color-mix (see Task 9 for active rail row).
- If it's a decorative tint → drop it or use `color-mix(in oklab, var(--home-card), var(--paper-ink) 6%)`.

**Step 3: Delete the `--home-accent` and `--home-accent-ink` variable definitions**

Remove the lines defining `--home-accent` and `--home-accent-ink` from both the light-mode block (`.home-pilot` at line ~4806) and the dark-mode block (`.dark .home-pilot` at line ~4831).

**Step 4: Verify zero remaining hits**

Run: `grep -n "home-accent" apps/dashboard/src/app/globals.css`
Expected: 0 hits.

**Step 5: Build + tests**

Run: `pnpm --filter @bbc/dashboard build && pnpm --filter @bbc/dashboard test --run`
Expected: pass. Any test that hard-codes `#e0ff54` must be updated.

**Step 6: Commit**

```bash
git add apps/dashboard/src/app/globals.css
git commit -m "refactor(home): delete --home-accent token

Yellow leaves the codebase. Remaining 'active'/'accent' usages either
use --btn-* tokens or monochrome paper-ink tints."
```

---

## Phase 4 — shadcn variant cleanup

### Task 6: Delete `brain` + `studio` variants from `ui/button.tsx`

**Files:**
- Modify: `apps/dashboard/src/components/ui/button.tsx` (variant config near line 13-40)
- Modify: variant-related tests if present

**Step 1: Read current variant config**

Run: `cat apps/dashboard/src/components/ui/button.tsx`

**Step 2: Remove brain + studio from `buttonVariants`**

Remove the `brain:` and `studio:` lines from the `variants.variant` object. The remaining variants (`default`, `destructive`, `outline`, `secondary`, `ghost`, `link`) stay.

**Step 3: Remove the TypeScript variant prop entries**

If there are explicit type defs that list `brain` / `studio`, remove those entries too. The `cva` definition will type-check automatically.

**Step 4: Run type-check**

Run: `pnpm --filter @bbc/dashboard type-check`
Expected: type errors at the 7 callsites using `variant="brain"` or `variant="studio"`. That's expected — Task 7 fixes them.

**Step 5: Hold the commit until Task 7 is done.**

### Task 7: Migrate 7 callsites from `variant="brain"|"studio"` to `variant="default"`

**Files (exact sites):**
- `apps/dashboard/src/app/settings/keys/KeysClient.tsx:126`
- `apps/dashboard/src/app/studio/marketing/StudioClient.tsx:364`
- `apps/dashboard/src/app/studio/marketing/StudioClient.tsx:522`
- `apps/dashboard/src/app/studio/marketing/StudioClient.tsx:661`
- `apps/dashboard/src/app/studio/marketing/StudioClient.tsx:669`
- `apps/dashboard/src/app/welcome/_steps/byok-banner.tsx:89`
- `apps/dashboard/src/components/cookie-banner.tsx:43`
- `apps/dashboard/src/components/studio/EditWorkflowChat.tsx:236`
- `apps/dashboard/src/components/studio/EditWorkflowChat.tsx:282`
- `apps/dashboard/src/components/studio/EditWorkflowChat.tsx:309`

**Step 1: For each callsite, change `variant="studio"` or `variant="brain"` to `variant="default"`**

Use Edit tool per file. The change is mechanical:
- `variant="studio"` → `variant="default"`
- `variant="brain"` → `variant="default"`

**Step 2: For destructive-feeling reject buttons (if any in the list), use `variant="outline"` instead of `default`**

Audit each callsite — if the button's semantic role is "cancel" / "reject" / "dismiss", use `variant="outline"` to make it secondary. Specifically check `cookie-banner.tsx:43` — the Accept should be `default`, but if a Reject button next to it currently exists with `variant="brain"`, the Reject becomes `variant="outline"`.

**Step 3: Type-check + tests**

Run: `pnpm --filter @bbc/dashboard type-check && pnpm --filter @bbc/dashboard test --run`
Expected: green. Component tests that asserted on `brain-` or `studio-` classes need updating.

**Step 4: Visual smoke**

`pnpm --filter @bbc/dashboard dev`. Walk through:
- /studio/marketing — Send, Accept, Start Over all read as monochrome primary
- /welcome — Continue + Save BYOK monochrome
- /settings/keys — Create key monochrome
- Cookie banner — Accept primary, Reject outline

**Step 5: Commit (Tasks 6 + 7 together)**

```bash
git add apps/dashboard/src/components/ui/button.tsx apps/dashboard/src/app/settings/keys/KeysClient.tsx apps/dashboard/src/app/studio/marketing/StudioClient.tsx apps/dashboard/src/app/welcome/_steps/byok-banner.tsx apps/dashboard/src/components/cookie-banner.tsx apps/dashboard/src/components/studio/EditWorkflowChat.tsx
git commit -m "refactor(buttons): delete brain + studio variants, migrate 7 callsites

variant=\"brain\" and variant=\"studio\" no longer exist. All primary
CTAs across /studio, /welcome, /settings/keys, the cookie banner, and
the EditWorkflowChat now use variant=\"default\" (monochrome). Role
identity survives on letter chips + memory-type tags, not buttons."
```

---

## Phase 5 — Citation chip upgrade

### Task 8: Audit memory-type flow through citation VM

**Files:**
- Read: `apps/dashboard/src/components/chat-home/CitationChip.tsx`
- Read: `apps/dashboard/src/components/chat-home/TurnView.tsx`
- Read: `apps/dashboard/src/lib/home/turn-to-vm.ts`
- Read: `apps/dashboard/src/lib/home/grounding.ts` (or wherever citations are emitted into SSE)

**Step 1: Verify `type` field on `CitationRef`**

Run: `grep -n "CitationRef\|type.*:.*string" apps/dashboard/src/components/chat-home/TurnView.tsx`
Expected: see the `CitationRef` type. Note whether `type?: string` already exists. Today the type defines `id` + optional `title` but probably not `type`.

**Step 2: Trace the flow upstream**

- Where does the LLM emit citations? Find `grounding.ts` / `real-invoke.ts`.
- Where are they stored on a turn? `home_turns` table — check the migration.
- Where do they get hydrated into a VM? `turn-to-vm.ts`.

**Step 3: Document findings inline in the task list**

If `type` already flows through: skip ahead to Task 9.
If not: add a sub-task to plumb it (DB column → SSE event → CitationRef VM → CitationChip prop).

**Step 4: Commit a no-code commit if the audit needs a follow-up plan**

If plumbing is needed, this becomes a 3-4 task sub-phase. Otherwise proceed.

### Task 9: Update `CitationChip` to consume `type` and emit `data-type`

**Files:**
- Modify: `apps/dashboard/src/components/chat-home/CitationChip.tsx`
- Modify: `apps/dashboard/src/components/chat-home/CitationChip.test.tsx` (if exists; create if not)

**Step 1: Write the failing test**

Create or extend `CitationChip.test.tsx`:

```tsx
import { render } from "@testing-library/react";
import { CitationChip } from "./CitationChip";

it("emits data-type matching the memory type", () => {
  const { container } = render(
    <CitationChip id="abc-123" title="auth decision" type="decision" />,
  );
  const chip = container.querySelector('[data-type="decision"]');
  expect(chip).not.toBeNull();
});

it("falls back gracefully when type is missing", () => {
  const { container } = render(
    <CitationChip id="abc-123" title="unknown" />,
  );
  const chip = container.querySelector('[data-type]');
  expect(chip).toBeNull(); // or asserts default
});
```

**Step 2: Run the test — expect FAIL**

Run: `pnpm --filter @bbc/dashboard test CitationChip --run`
Expected: FAIL because the prop / data-type doesn't exist yet.

**Step 3: Update `CitationChip.tsx`**

Add `type?: string` to the props. Emit `data-type={type}` on the chip's root element. The component stays presentational; styling will come from the CSS rule in Task 10.

**Step 4: Run the test — expect PASS**

Run: `pnpm --filter @bbc/dashboard test CitationChip --run`
Expected: PASS.

**Step 5: Commit**

```bash
git add apps/dashboard/src/components/chat-home/CitationChip.tsx apps/dashboard/src/components/chat-home/CitationChip.test.tsx
git commit -m "feat(citation-chip): accept type prop and emit data-type

Sets up per-type CSS color binding (see next commit)."
```

### Task 10: Add per-type color rule in `globals.css`

**Files:**
- Modify: `apps/dashboard/src/app/globals.css` — append a new block after the button-system tokens

**Step 1: Add the rule**

```css
/* Citation chip per-type color binding. Each chip inherits the color of
   the memory type it references (decision = blue, voice = pink, etc.).
   The --t-<type> tokens are defined in :root and .dark and auto-invert. */
.citation-chip[data-type="voice"]    { --chip-tint: var(--t-voice); }
.citation-chip[data-type="decision"] { --chip-tint: var(--t-decision); }
.citation-chip[data-type="vendor"]   { --chip-tint: var(--t-vendor); }
.citation-chip[data-type="team"]     { --chip-tint: var(--t-team); }
.citation-chip[data-type="product"]  { --chip-tint: var(--t-product); }
.citation-chip[data-type="glossary"] { --chip-tint: var(--t-glossary); }
.citation-chip[data-type="skill"]    { --chip-tint: var(--t-skill); }
.citation-chip[data-type="source_artifact"] { --chip-tint: var(--t-source_artifact); }
.citation-chip[data-type="note"]     { --chip-tint: var(--t-note); }

/* Tint applied as underline + subtle bg-on-hover. --chip-tint defaults to
   paper-muted so an untyped chip still renders sanely. */
.citation-chip {
  --chip-tint: var(--paper-muted);
  text-decoration: underline;
  text-decoration-color: color-mix(in oklab, var(--chip-tint), transparent 30%);
  text-underline-offset: 2px;
  transition: background 120ms ease;
}
.citation-chip:hover {
  background: color-mix(in oklab, var(--chip-tint), transparent 88%);
  text-decoration-color: var(--chip-tint);
}
```

**Step 2: Verify class hook**

Run: `grep -n "citation-chip" apps/dashboard/src/components/chat-home/CitationChip.tsx`
Expected: the component renders a `className="citation-chip"` on the chip root. If it uses a different class, update either the CSS or the component to match.

**Step 3: Visual smoke**

`pnpm --filter @bbc/dashboard dev`. Send a /home message that triggers a citation. Confirm the chip's underline color matches the memory type (decision = blue, voice = pink, etc.).

**Step 4: Commit**

```bash
git add apps/dashboard/src/app/globals.css
git commit -m "feat(citation-chip): per-type color via --t-<type> tokens

[mem: decision/auth] now reads as a blue chip, [mem: voice/...] reads
as pink, etc. Citation chip becomes a tiny semantic preview of the
type of memory behind it."
```

---

## Phase 6 — Active rail row + workspace dot

### Task 11: Active session row monochrome tint

**Files:**
- Modify: `apps/dashboard/src/app/globals.css` — find the active-row rule (probably in the `.session-rail-row` or `.session-row` block)
- Read: `apps/dashboard/src/components/chat-home/SessionRow.tsx`

**Step 1: Locate the current active-state rule**

Run: `grep -n "session-row\|session-rail-row\|aria-current" apps/dashboard/src/app/globals.css apps/dashboard/src/components/chat-home/*.tsx`
Expected: locates how "active" is signaled today (likely `aria-current="page"` or a `data-active` attribute).

**Step 2: Replace any `--home-accent`-based active styling with monochrome**

Find the existing rule for active row. Replace any `background: var(--home-accent)` or similar with:

```css
.home-pilot .session-rail-row[aria-current="page"] {
  background: color-mix(in oklab, var(--home-card), var(--paper-ink) 6%);
  /* subtle left-edge indicator using paper-ink instead of a brand color */
  box-shadow: inset 2px 0 0 var(--paper-ink);
}
```

(Adjust the selector to match the actual class used in `SessionRow.tsx`.)

**Step 3: Visual smoke**

`/home` with multiple sessions in the rail: the active row should read as subtly distinct via tint + left-edge stripe, no green/lime tint.

**Step 4: Commit**

```bash
git add apps/dashboard/src/app/globals.css
git commit -m "feat(rail): monochrome active-row indicator

Replaces lime tint with paper-ink tint + 2px inset left-edge stripe."
```

### Task 12: Workspace switcher dot — semantic state

**Files:**
- Read: `apps/dashboard/src/components/AppNav.tsx` (find the workspace dot near line ~30 or wherever the workspace switcher renders)
- Modify: `apps/dashboard/src/app/globals.css` — add or update the dot rule

**Step 1: Locate the dot**

Run: `grep -n "dot\|status" apps/dashboard/src/components/AppNav.tsx`
Expected: a small element next to the workspace name (`oscartry / admin`).

**Step 2: If the dot is "decorative" (no semantic meaning), make it monochrome**

```css
.workspace-switcher .dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--paper-muted);
}
.workspace-switcher .dot[data-state="live"] {
  background: var(--paper-ok); /* the existing green for ok state */
}
```

If the dot is purely decorative and there's no "live" signal, just use `--paper-muted` and drop the `data-state` rule.

**Step 3: Visual smoke**

Confirm the workspace dot is no longer lime-green.

**Step 4: Commit**

```bash
git add apps/dashboard/src/app/globals.css apps/dashboard/src/components/AppNav.tsx
git commit -m "feat(workspace-switcher): monochrome dot with semantic 'live' state"
```

---

## Phase 7 — Verification + PR

### Task 13: Full build + type-check + test sweep

**Step 1: Run the full suite**

```bash
pnpm --filter @bbc/dashboard build
pnpm --filter @bbc/dashboard type-check
pnpm --filter @bbc/dashboard test --run
```

Expected: all three pass. If any test snapshot breaks on color values, audit each — the visual change is intended, so update the snapshot; do NOT revert the rule.

**Step 2: If any failure persists, fix and commit before the manual walk**

### Task 14: Manual signed-in walk

**Both light AND dark mode** (toggle via OS dark/light setting since `defaultTheme="system"`):

- [ ] `/home` greeting state — New chat outline, Send primary, prompt chips intact, citation chips off
- [ ] `/home` after sending a message — Send primary, Stop ghost, citation chips show per-type color
- [ ] `/home` rail with multiple sessions — active row visibly distinct via tint + left-edge stripe
- [ ] `/queue` — Accept primary, Reject secondary outline, neither in brand color
- [ ] `/studio/marketing` — Send/Accept/Start Over monochrome primary; role letter chip stays orange (M for Marketing)
- [ ] `/settings/keys` — Create key monochrome primary
- [ ] `/welcome` — Continue + Save BYOK monochrome
- [ ] `/library` — role chips stay per-role, recommended badge stays orange, Install primary monochrome
- [ ] `/memory` landing — type tags (voice/decision/team/etc.) keep their colors
- [ ] Cookie banner — Accept primary, Reject outline (not green)
- [ ] Workspace switcher dot — no longer lime
- [ ] BBC brand logo → still navigates to /home

Document any anomaly in this file under a new "QA Findings" heading; fix as a follow-up task before opening the PR.

### Task 15: Codex review

```bash
codex review --base main
```

Expected: CLEAN or specific findings to address. Per the standing memory rule, codex review runs on significant code/strategy changes — this qualifies. Address any findings, then re-run.

### Task 16: Open the PR

```bash
git push -u origin design/v18-button-system
gh pr create --title "v1.8: app-wide button system unification" --body "$(cat <<'EOF'
## Summary

- Consolidates three coexisting button systems (.btn-primary / shadcn --primary / .home-pilot --home-accent + brain/studio variants) onto one monochrome white-on-dark / black-on-light primary
- Deletes \`--home-accent\` token, \`variant="brain"\`, \`variant="studio"\` from the codebase
- Demotes /home + New chat to secondary outline (fixes inverted hierarchy)
- Upgrades citation chips to inherit per-type memory color
- Preserves identity color on role letter chips, memory-type tags, recommended badges

## Design + plan

- Design: \`docs/plans/2026-05-19-v18-button-system-design.md\`
- Plan: \`docs/plans/2026-05-19-v18-button-system-plan.md\`

## Test plan

- [x] Build, type-check, unit tests green
- [x] Manual signed-in walk in both light and dark mode (see plan §Task 14 checklist)
- [x] Codex review CLEAN

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Estimated effort

- Phase 1 (tokens): 15 min
- Phase 2 (.btn-* rewrite): 20 min
- Phase 3 (/home chrome): 30 min
- Phase 4 (variant cleanup + 10 callsites): 25 min
- Phase 5 (citation chip type-color upgrade): 30 min (more if memory `type` needs plumbing — could be +1 hour)
- Phase 6 (active rail + dot): 15 min
- Phase 7 (verification + PR): 45 min (incl. codex review iteration)

**Total: ~3 hours of focused work.** Citation-chip plumbing is the biggest unknown — Task 8 audits this before committing the rest of Phase 5.

## Risk + rollback

- **Risk**: a snapshot test in `ChatHome.test.tsx` or `SessionRail.test.tsx` may hard-code the old lime color. Update the snapshot; the visual change is intended.
- **Risk**: some surface uses `.btn-primary` in a way that depends on warm orange (e.g. a landing-page CTA). Visual walk catches it; fall back to scoped override (`.landing .cta { background: var(--paper-accent); }`) if needed.
- **Rollback**: single PR. `gh pr close` and the codebase reverts cleanly. Token additions in Phase 1 are pure-additive — even if rules-revert is partial, no callsite breaks.
