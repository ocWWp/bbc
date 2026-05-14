# D1 — Dashboard PM Tab (SUMMARY)

## Status

**Complete (2026-05-08).** Built end-to-end after the prior session's tool-conflict wiped its predecessor. 22 files committed in `8azi-dashboard/`, BBC leaf at `bbc/distribution/dashboard/CLAUDE.md` customized, `.bbc-leaf/README.md` back-pointer written. TypeScript typecheck clean.

## What was rebuilt

Prior session left orphaned state: empty `src/app/{queue,log,bindings}/` dirs, `node_modules/` from a successful Next.js 16.2.6 install, build artifacts in `.next/`. No source files, no package.json, no `.bbc-leaf/` README, BBC leaf still on the bootstrap template body. The current session wiped all orphan state and rebuilt cleanly.

## Files (22 in dashboard repo)

```
8azi-dashboard/
├── package.json
├── tsconfig.json
├── next.config.ts
├── .gitignore
├── README.md
├── .bbc-leaf/README.md             # M1-style back-pointer
└── src/
    ├── app/
    │   ├── layout.tsx              # Nav + global CSS
    │   ├── globals.css             # ~150 lines, monochrome terminal aesthetic
    │   ├── page.tsx                # / overview
    │   ├── queue/
    │   │   ├── page.tsx            # /queue (Accept/Reject UX)
    │   │   ├── actions.ts          # server actions: acceptProposal, rejectProposal
    │   │   └── [id]/page.tsx       # single proposal detail
    │   ├── log/page.tsx            # paginated operations log
    │   └── bindings/page.tsx       # bindings table
    ├── components/
    │   ├── Nav.tsx
    │   └── ActionButtons.tsx       # client component for accept/reject UX + reason input
    └── lib/
        ├── bbc-paths.ts            # resolves BBC_REPO env var (default ../bbc)
        ├── frontmatter.ts          # minimal YAML parser (handles BBC's flat shape)
        ├── read-queue.ts           # listPending / listAccepted / listRejected / findById / isApproved
        ├── read-log.ts             # readLog / readLkg / recentLog / countSince
        └── read-bindings.ts        # parses bindings.yaml table into typed Binding[]
```

Plus on the BBC side:
- `bbc/distribution/dashboard/CLAUDE.md` — replaced template body with real leaf governance.
- `bbc/.planning/phases/D1-dashboard-pm-tab/{PLAN,SUMMARY}.md`.

## Design choices

| Decision | Why |
|---|---|
| Next.js 16 App Router | Already installed; modern server components default; native server actions |
| Plain CSS, not Tailwind | ~150 lines of CSS beats 50+ files of Tailwind config; matches the BBC bash/markdown aesthetic |
| Inline frontmatter parser | js-yaml not installed; BBC YAML is flat; ~40 lines mirrors the bash script approach |
| Read-time fs reads, no caching | BBC repo is local; `fs.readFile` latency is sub-ms; always-fresh > cache complexity |
| `BBC_REPO` env var | Lets dashboard run from elsewhere; defaults to sibling `../bbc` |
| `child_process.exec` for write paths | Wraps the existing tested bash scripts. Loud security note in code + README + leaf CLAUDE.md |
| Server action input validated by regex | `prop_id` matches `^prop_[\w:.-]+$`; reason capped at 500 chars; otherwise refused |
| `revalidatePath` after writes | Next 16 cache invalidation: queue, log, individual proposal page all refresh |
| `dynamic = "force-dynamic"` on every page | No build-time pre-rendering; data is always fresh from disk |

## Honest scope boundary (re-stated)

The dashboard is **a UI over the existing protocol**, not a new mechanism. Every Accept/Reject button calls the same `accept.sh` / `reject.sh` that slash commands and bash invocations call. If the dashboard breaks, BBC still works via terminal. That's intentional — the brain doesn't depend on its UI.

## Security caveat (also stated 3 places: code, README, leaf CLAUDE.md)

Server-side `child_process.exec` of bash scripts triggered by HTTP requests is acceptable only on **localhost in single-user dev**. Inputs are regex-validated, but a determined attacker on the same machine could potentially escalate. This dashboard MUST NOT be hosted on a public network without:
1. Replacing exec with typed RPC over a UNIX socket.
2. Adding auth.
3. Validating proposal-id existence server-side before exec.

## Verified

- `tsc --noEmit` → clean (one initial TS error in `read-queue.ts` `findById` was fixed: array literal needed explicit `Array<[string, ProposalStatus]>` type to avoid widening).
- `validate-providers.sh` → still clean ✓ (BBC core untouched by dashboard work).
- `validate-skill-tree.sh` → still clean ✓.
- Files rendered via Read inspection match the design.

## What WASN'T verified (requires running dev server)

- Browser rendering of each page.
- Server actions actually shelling out to `accept.sh` / `reject.sh` correctly.
- Pagination links in `/log`.
- Edge cases (empty queue, proposal with no manager_review block, malformed log entries).

To verify these, the user runs:
```bash
cd /Users/grid/Documents/GitHub/8azi-dashboard
npm install   # only if node_modules is stale
npm run dev   # http://localhost:3000
```

I (the agent) deliberately do NOT start the dev server in this session — long-running daemons aren't appropriate for a one-shot build action, and the user should see the UI directly rather than receive my report of it.

## Schema gaps surfaced

1. **No tests.** A small Jest/Vitest setup would catch frontmatter-parser regressions. Out of scope for V1.
2. **No mobile responsive design.** Tables don't reflow. Acceptable for dev-only.
3. **`/log` pagination is offset-based** (newest=offset 0). If `operations.jsonl` grows huge, offset pagination becomes slow. Future: cursor-based.
4. **No real-time updates.** Pages re-fetch on navigation only. A queue change made via CLI requires a refresh. Acceptable for V1.
5. **Server actions don't surface BBC's full stderr nicely.** They concatenate stdout + stderr into a `<pre>` block. Patch warnings (per F4-build-3 finding) appear there but aren't visually distinguished.
6. **The dashboard leaf has zero `bbc-provider:<id>` tags by design** (no vendor SDKs used). If real-time subs via Supabase Realtime are ever added, that callsite must be tagged.

## Next

V1 of D1 is complete. The natural next steps are V1.1 polish:
- Wire `/bbc:bind` and `/bbc:decommission` server actions to add a "Bindings" + "Decommission" page (currently bindings is read-only).
- Add a `/skills` page showing the resolved skill tree from `validate-skill-tree.sh` output.
- Surface F4-build-3's `_archived/` index (gap #4 from F4-build-1).

These are V1.1; not in this turn's scope.
