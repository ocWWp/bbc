# v1.8 — App-wide button system unification

**Date:** 2026-05-19
**Status:** approved, awaiting implementation plan
**Supersedes:** the implicit "three button systems" state in `globals.css`

## Problem

Three button systems coexist in `apps/dashboard/src/app/globals.css` and the dashboard components:

1. `.btn-primary` / `.btn.primary` / `.btn-ghost` (15+ files) — paints with `--paper-accent` warm orange
2. shadcn `<Button>` variants (17 files) — paints with `--primary` neutral oklch grays
3. `.home-pilot .home-send` + `.home-pilot .session-rail-new-chat` (2 files) — paints with `--home-accent` lime yellow (`#e0ff54`)

Plus two role-coded button variants in `ui/button.tsx`: `brain` and `studio`, used as primary CTAs in /studio, /settings/keys, the cookie banner, and /welcome.

User feedback on the /home dark-mode screenshot:
- `+ New chat` (lime) and `Send` (muddy olive) read as two different greens
- Visual hierarchy is inverted: Send is the primary action of /home but reads quieter than New chat
- The lime/olive accent feels off in dark mode — "we picked a green" rather than a deliberate brand stamp

## Decision

Unify all primary CTAs in the app onto a single monochrome button system: white-on-dark in dark mode, black-on-light in light mode (Linear/Vercel pattern). Kill `--home-accent` from the codebase. Delete the `brain` and `studio` variants.

Identity color (which is the real BBC brand expression) survives intact on:
- Role letter chips (S/E/M/F/D/$/§/P) in /studio + /library — these use `--t-*` per-role tokens already
- Memory-type tags (`voice`, `decision`, `team`, `product`, `vendor`, `skill`, `note`) — already use `--t-<type>`
- The "recommended" badge on skill cards — uses `--paper-accent`
- Citation chips `[mem: ...]` — upgraded to inherit the cited memory's `--t-<type>` color (was generic)

The monochrome buttons recede so the type-color system reads as the brand.

## Token system

```css
:root {
  /* v1.8 button system */
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

  /* shadcn aliases — preserves bg-primary/text-primary-foreground convention */
  --primary:               var(--btn-primary-bg);
  --primary-foreground:    var(--btn-primary-fg);
}

.dark {
  /* hover wants brighter in dark, but --paper-ink-2 in dark goes darker */
  --btn-primary-hover-bg:  #ffffff;
}
```

Primary base/fg auto-invert via the `--paper-ink` / `--paper` flip already defined in the `.dark` block at `globals.css:163-171`. Hover gets an explicit dark override so the button lifts brighter, not darker.

## Per-surface button hierarchy

One primary per surface. The destination CTA is primary; the alternative is secondary.

| Surface | Button | Variant |
|---|---|---|
| /home | Send | primary |
| /home | + New chat | **secondary outline** (was primary lime) |
| /home | Stop (mid-stream) | ghost |
| /queue | Accept | primary |
| /queue | Reject | secondary outline |
| /studio/&lt;role&gt; | Send / Run | primary (was studio orange) |
| /studio/&lt;role&gt; | Start Over / Accept | primary (was studio orange) |
| /welcome | Continue / Save BYOK | primary (was studio orange) |
| /settings/keys | Create key | primary (was studio orange) |
| Cookie banner | Accept | primary (was brain green) |
| Cookie banner | Reject | secondary outline |
| /library | Install | primary |

## File scope

| File | Change |
|---|---|
| `globals.css` | Add `--btn-*` token block + shadcn aliases |
| `globals.css:304-310` | Rewrite `.btn-primary` + `.btn.primary` + `.btn-ghost` (base + hover + focus + disabled) |
| `globals.css:4946` | Rewrite `.home-pilot .home-send` — monochrome primary |
| `globals.css:4985` | Rewrite `.home-pilot .session-rail-new-chat` — demote to secondary outline |
| `globals.css` (line ~4812, ~4833) | Delete `--home-accent` definitions (light + dark) |
| `globals.css` | New rule: `.citation-chip[data-type="<type>"]` reads `--t-<type>` |
| `globals.css` | New rule: active rail row monochrome tint via `--paper-ink` |
| `globals.css` | New rule: workspace switcher dot — `--paper-ok` when live, `--paper-muted` otherwise |
| `components/ui/button.tsx:23` | Delete `brain` + `studio` variants |
| `components/chat-home/CitationChip.tsx` | Thread `type` prop; emit `data-type` on the chip |
| `components/chat-home/TurnView.tsx` or upstream | Verify memory `type` flows through the citation VM; thread if not |
| 7 callsites | `variant="brain"\|"studio"` → `variant="default"`: `app/settings/keys/KeysClient.tsx:126`, `app/studio/marketing/StudioClient.tsx:364,522,661,669`, `app/welcome/_steps/byok-banner.tsx:89`, `components/cookie-banner.tsx:43`, `components/studio/EditWorkflowChat.tsx:236,282,309` |

Total: ~12 files. Most of the work is in `globals.css`; component changes are mechanical.

## Migration order

Single PR, commits batched by surface so each one is reviewable in isolation:

1. **Tokens** — add `--btn-*` block + shadcn aliases (pure additive, zero callsite impact)
2. **Generic rules** — rewrite `.btn-primary`/`.btn.primary`/`.btn-ghost` using new tokens
3. **/home chrome** — rewrite `.home-send` (primary) + `.session-rail-new-chat` (secondary outline); delete `--home-accent`
4. **shadcn variants** — delete `brain` + `studio` from `button.tsx`; migrate 7 callsites
5. **Citation chips** — `CitationChip` reads `type`, paints via `--t-<type>`; thread `type` through SSE → VM if not already
6. **Active rail + workspace dot** — monochrome / semantic rules
7. **Tests + smoke** — see verification below

## Verification

- **Build + type-check + tests** — `pnpm --filter @bbc/dashboard build`, `type-check`, `test`
- **Unit/component tests**:
  - `button.test.tsx` — variant enum: `default`/`secondary`/`ghost`/`destructive`/`link`/`outline` (drop `brain`/`studio`)
  - `ChatHome.test.tsx` — Send button has primary class; New chat button has secondary-outline class
  - `CitationChip.test.tsx` — chip emits `data-type` matching the memory type; paints with the right color token (snapshot or computed style assertion)
- **Manual signed-in walk** — both light and dark mode:
  - /home greeting state: New chat outline, Send primary, prompt chips intact
  - /home in conversation: Send primary, Stop ghost, citation chips show per-type color
  - /queue: Accept primary, Reject secondary outline
  - /studio/marketing: Send/Accept/Start Over all monochrome primary; role letter chip stays role-color
  - /settings/keys: Create key monochrome primary
  - /welcome: Continue + Save BYOK monochrome
  - /library: role chips stay per-role, recommended badge stays orange, Install primary monochrome
  - Cookie banner: Accept primary, Reject secondary
- **State-contrast parity** — hover/focus/disabled equally distinguishable in both modes (ui-ux-pro-max checklist)
- **Codex review** — per the standing memory rule on significant code/strategy changes, run `codex review --base main` before merge

## Future pattern: scoped token override for inverted/colored surfaces

If a future surface has a colored bg where the global primary token would lose contrast, override at the surface scope:

```css
.surface-inverse {
  --btn-primary-bg: var(--paper);
  --btn-primary-fg: var(--paper-ink);
  --btn-primary-hover-bg: var(--paper-bg-2);
}
```

Then any button inside `.surface-inverse` automatically conforms — no per-callsite branching. Not built in v1.8; documented here as the supported override path so the next developer reaches for it.

## What this does NOT do

- Full Button-component migration of the 35+ callsites. Token-first ships visual consistency now; component consolidation can be a separate v1.9 refactor with no visual change.
- Other v1.8 ambitions (Ramp-style aesthetic pilot, system-wide motion pass). Those are downstream of having a stable button system to build on.
- The four UNKNOWN items from the 2026-05-16 audit (F9 /memory row click, F12 stub turns, F13 brain hydration, F16 composer keyboard hint). Tracked separately; not gating the button work.

## References

- 2026-05-16 UX audit findings: `docs/plans/2026-05-16-ux-audit-findings.md`
- Codex consult on token-first approach: cited inline above (5 callouts addressed)
- ui-ux-pro-max checklist: state-contrast parity, no emojis as icons, cursor-pointer on clickables, hover transition 150–300ms
