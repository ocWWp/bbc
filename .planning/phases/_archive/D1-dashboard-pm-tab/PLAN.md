# D1 — Dashboard PM Tab (DESIGN + BUILD, 2026-05-08)

## Context

V1 BBC has every operation behind bash scripts and slash commands. A human operating multiple leaves wants a quick visual: what's pending in the queue, what was just accepted, what's currently bound to which role, what just happened in the log. That's the "PM tab" the original spec called out as the top dashboard priority (above brain interface and pipeline builder).

Prior session attempted this, then got interrupted ("tool conflict"). Salvageable inventory: `8azi-dashboard/` repo with `node_modules/` containing Next.js 16.2.6 + React 19 + TypeScript. Source files were lost; this phase rebuilds from scratch.

## Scope

**V1 (this phase):** 4 routes, server-rendered, single-user dev only.

- `/` — overview: BBC repo path, current phase from STATE.md, counts (pending / accepts last 7d / rejects last 7d), latest 5 log entries.
- `/queue` — list pending proposals with their `manager_review.verdict`. For each pending+approved: Accept button. For each pending: Reject button (opens reason input).
- `/log` — operations.jsonl table (latest 50 entries; pagination via `?offset=N`).
- `/bindings` — bindings.yaml as a styled table.

Plus a single proposal-detail route `/queue/[id]` showing full body + diff + frontmatter.

**Write-back:** Accept and Reject buttons trigger Next.js server actions that shell out to `bash $BBC_REPO/scripts/{accept,reject}.sh`. **Loud security note**: shell-exec from a web server is acceptable only in a single-user, localhost-only, dev-only context. Documented in README and dashboard banner.

**Out of V1.x scope:** auth, multi-user, hosting, brain interface (configure profiles/skills via UI), pipeline builder, mobile-responsive design.

## Stack decisions

| Concern | Choice | Why |
|---|---|---|
| Framework | Next.js 16.2.6 (already installed) | App Router, server components default, server actions native |
| Styling | Plain CSS in `globals.css`, monochrome terminal-y aesthetic | Skip Tailwind config overhead; ~150 lines of CSS |
| Data access | Node `fs` at request time, no caching | Always-fresh; the BBC repo is local so latency is negligible |
| YAML parsing | Inline minimal parser (regex over frontmatter) | `js-yaml` not installed; BBC's YAML is flat key:value, no nested objects; matches `bash scripts` parsing approach |
| JSONL parsing | Line-by-line `JSON.parse` | trivially correct |
| Config | `BBC_REPO` env var (default: `../bbc`) | dashboard repo lives sibling-to-bbc |

## Layout

```
8azi-dashboard/
├── package.json
├── tsconfig.json
├── next.config.ts
├── .gitignore
├── README.md
├── .bbc-leaf/README.md              # M1-style back-pointer
└── src/
    ├── app/
    │   ├── layout.tsx                # nav, global wrapper
    │   ├── globals.css
    │   ├── page.tsx                  # overview
    │   ├── queue/
    │   │   ├── page.tsx              # pending proposals + accept/reject buttons
    │   │   ├── actions.ts            # server actions: acceptProposal, rejectProposal
    │   │   └── [id]/page.tsx         # single proposal detail
    │   ├── log/page.tsx              # operations log
    │   └── bindings/page.tsx         # bindings table
    ├── components/
    │   ├── Nav.tsx
    │   └── ActionButtons.tsx         # client component for accept/reject UX
    └── lib/
        ├── bbc-paths.ts              # resolve BBC repo location
        ├── frontmatter.ts            # minimal YAML frontmatter parser
        ├── read-queue.ts
        ├── read-log.ts
        └── read-bindings.ts
```

## What this phase produces

After build:
- A runnable dashboard at `npm run dev` → http://localhost:3000.
- `bbc/distribution/dashboard/CLAUDE.md` customized (replacing template body).
- `8azi-dashboard/.bbc-leaf/README.md` written (back-pointer per M1 convention).
- This PLAN + a SUMMARY.md.

## Honest scope boundary

This is a **visual front-end over the existing protocol**. It does NOT change BBC's mechanics. Every action still goes through the same `accept.sh` / `reject.sh` / queue files. The dashboard is just markdown-and-fs reads + thin server actions. If the dashboard breaks, BBC continues to function via slash commands and bash. That's intentional: BBC's brain doesn't depend on its UI.

## Build phases

1. **D1.0 — scaffold:** package.json, tsconfig, next.config, globals.css, layout, .gitignore. Empty pages.
2. **D1.read — read paths:** lib helpers + 4 page.tsx files rendering data from the BBC repo.
3. **D1.1 — write-back:** server actions + Accept/Reject UX.
4. **D-leaf-migration — leaf integration:** customize BBC's dashboard leaf CLAUDE.md + write `.bbc-leaf/README.md` back-pointer.
5. **Verification:** `npm run dev`, click through, propose-from-CLI → accept-from-UI → see-in-log round-trip.

This phase batches all five into one execution.
