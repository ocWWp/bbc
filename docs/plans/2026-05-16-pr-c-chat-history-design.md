# PR-C — /home chat history sidebar (design)

Date: 2026-05-16
Branch (planned): `v17-home-chat-history` (off `v17-home-intuitive`)
Author: brainstormed via Claude Code with three codex review passes
Related: PR #18 (PR-B) — [[project-v17-pr-b-open]]

## Goal

Add a Perplexity/Claude-style left rail to `/home` so users can see, switch between, and delete past chat sessions. Closes the "no clear chat history" gap called out in [[feedback-intuitiveness-is-the-real-bar]].

## Decisions (locked via brainstorming + three codex reviews)

1. **Surface**: Left rail scoped to `/home` only. Top app-nav (Studio · Memory · Queue · Library) stays. Rail contains `+ new chat` Link + flat list of past sessions. No app-nav duplication.
2. **Titles**: Stored as `home_sessions.title TEXT NULL`. Set on first user turn write in the route. Truncated ~40 chars at word boundary, ellipsis. UI fallback `(empty)` via SQL `COALESCE`.
3. **List shape**: Flat reverse-chron by `last_activity_at`. All non-archived sessions loaded on initial render. No pagination — fine until hundreds.
4. **Switching semantics**: URL state `?session=<id>` on `/home`. `/home` with no param = empty greeting / new chat. `/home?session=<id>` = that session. `archived_at` is soft-delete (user dismissed from rail). `+ new` → `router.push('/home')`.
5. **Delete**: Visible kebab on each row (always on touch, hover-revealed on desktop). Kebab → popover → "Delete" with inline confirm. No swipe-left, no framer-motion drag (scope creep).
6. **Mobile**: Slide-in drawer from left, ~85vw, chat-peek visible at right edge. Toggle button at top-left of `/home`. Tap chat-peek or select a session closes drawer.

## Architecture

### DB migration

`apps/dashboard/supabase/migrations/00XX_home_sessions_title.sql`:

- `ALTER TABLE home_sessions ADD COLUMN title TEXT NULL`
- One-time backfill: set `title = COALESCE(<first user turn text truncated>, NULL)` filtering `role='user'`, `content_jsonb->>'text' IS NOT NULL`, ordering by `created_at ASC`. Skip stub-pattern rows.
- `CREATE INDEX home_sessions_active_recent_idx ON home_sessions (tenant_id, user_id, last_activity_at DESC) WHERE archived_at IS NULL`

### Auth fix (in-scope, codex finding)

`apps/dashboard/src/app/api/home/turn/route.ts` currently uses `requireActor()` only — a non-admin can call the POST despite `/home` being admin-only on the page. Tighten to match:

```ts
const result = await requireActor();
if (!result.ok) return json({ error: "unauth" }, 401);
const roleCheck = requireRole(result.actor, "admin");
if (!roleCheck.ok) return json({ error: "forbidden" }, 403);
const actor = result.actor;
```

### Server library — `apps/dashboard/src/lib/home/sessions.ts`

**Delete** the old `getOrCreateActiveSession` and `archiveSession`. Both have no-ownership-predicate footguns and don't fit the new model.

**Add**:

- `getMostRecentSession(tenantId, userId)` — `archived_at IS NULL`, ordered by `last_activity_at DESC`, limit 1. Returns null when none. (Used by the rail's "most recent" indicator only — page itself does not auto-load.)
- `createSession(tenantId, userId)` — explicit insert; called only from the turn route when first turn lands on no session.
- `getSessionWithTurns(sessionId, tenantId, userId, limit = 50)` — single read; ownership predicate (`id`, `tenant_id`, `user_id`, `archived_at IS NULL`). Returns `null` for not-found/archived/foreign-tenant. Caller translates null → redirect (page) or 410 (route).
- `listSessions(tenantId, userId)` — `SELECT id, COALESCE(title, '(empty)') AS title, last_activity_at` filtered by ownership + `archived_at IS NULL`, ordered by `last_activity_at DESC`. Uses the new index.
- `softDeleteSession(sessionId, tenantId, userId)` — `UPDATE ... SET archived_at = now() WHERE id = ? AND tenant_id = ? AND user_id = ? AND archived_at IS NULL` with `.select("id").maybeSingle()`. Returns null on no-row → caller throws.
- `deriveTitle(text: string): string` — handles empty/whitespace/multiline (replace newlines with space)/unbreakable (force-truncate at 40 chars if no word boundary)/short (return as-is). Always returns a string; `(empty)` fallback only when input is empty/whitespace.

### API route — `apps/dashboard/src/app/api/home/turn/route.ts`

Body shape: `{ userText: string, sessionId?: string }`.

Pre-stream order:

1. Auth + admin gate (above).
2. Validate `sessionId`: if present, must match UUID regex; malformed → `400 {error:'invalid_session_id'}`.
3. Resolve session:
   - If `sessionId`: `getSessionWithTurns(...)` for ownership-gated read; null → `410 {error:'session_not_found'}`.
   - Else: `createSession(...)`. Hold the new `sessionId` and `deriveTitle(userText)` in scope.
4. Read recent-context turns from the resolved session (already returned by `getSessionWithTurns` above for existing-session path; for new-session path, recent = empty).
5. **Append user turn first** (`appendTurn(role='user', content_jsonb={text: userText})`). If this fails for a new session: `softDeleteSession(newSessionId, ...)` to avoid orphan rows, then return `500 {error:'turn_insert_failed'}`.
6. For new sessions: write `home_sessions.title = deriveTitle(userText)` (UPDATE with ownership predicate).
7. Open SSE.

SSE event order on a new-session first turn:

1. `session-created` with `{sessionId, title}` — emitted only after step 5+6 succeed.
2. `text-delta` / `text-replace` / `action-card` / `citation` — normal stream.
3. `turn-end` with `{last_activity_at}` so client doesn't need a server round-trip to refresh rail order.

For existing-session turns: skip `session-created`. Same stream otherwise.

### Components

**New:**

- `apps/dashboard/src/components/chat-home/SessionRail.tsx` (server) — reads `listSessions()`, renders `+ new chat` Link + `<SessionList sessions={...} currentSessionId={...} />`. Has no client state.
- `apps/dashboard/src/components/chat-home/SessionList.tsx` (client) — wraps the array of `<SessionRow>` in `<AnimatePresence>` for delete exits. Owns the `onDeleteRequest(targetId)` callback that bubbles up to `ChatHome` (via prop drilling through `SessionRailShell`).
- `apps/dashboard/src/components/chat-home/SessionRailShell.tsx` (client) — accepts `rail` and `children` as slot props (server component cannot be imported into a client component directly). Manages mobile drawer open/close state + toggle button. Layout switches at `md:` breakpoint. Provides the `onDeleteRequest` callback to its rail children via React context.
- `apps/dashboard/src/components/chat-home/SessionRow.tsx` (client) — title + kebab button (visible on touch, hover-revealed on desktop). Click kebab → popover → "Delete" button → inline confirm "Delete? Cancel". Calls `onDeleteRequest(sessionId)` from context.
- `apps/dashboard/src/app/home/actions.ts` (new file) — `deleteSessionAction(targetId, currentSessionId?)` server action.

**Modified:**

- `apps/dashboard/src/app/home/page.tsx` — reads `searchParams.session?`. UUID-regex check; if malformed → `redirect('/home')`. If valid, `getSessionWithTurns(...)`; null → `redirect('/home')`. Always reads `listSessions(...)`. Renders `<SessionRailShell rail={<SessionRail ... />}><ChatHome key={session ?? 'new'} sessionId={session ?? null} initialTurns={...} /></SessionRailShell>`.
- `apps/dashboard/src/components/chat-home/ChatHome.tsx`:
  - New prop `sessionId: string | null`. Threaded into POST body.
  - SSE handler: on `session-created`, **buffer the new id in local state but do not navigate yet**. On `turn-end`, then `router.replace(?${new URLSearchParams({session: id})})` followed by `router.refresh()` (single refresh per turn).
  - `+ new` button → `router.push('/home')`.
  - 410 response: clear optimistic user+agent turns from local state, then `toast.error("This chat was deleted")` + `router.push('/home')`.
  - `useEffect` cleanup that calls `controller.abort()` on unmount.
  - Receives `onDeleteRequest` from `SessionRailShell` context: if `targetId === sessionId` and stream is active, `controller.abort()` first + set in-progress agent turn to `aborted` in local state immediately, then `await deleteSessionAction(targetId, sessionId)` then `router.push('/home')`. If not current, just `await deleteSessionAction(targetId)` then `router.refresh()`.

### Server actions — `apps/dashboard/src/app/home/actions.ts`

```ts
"use server";
export async function deleteSessionAction(targetId: string, currentSessionId?: string) {
  const result = await requireActor();
  if (!result.ok) throw new Error("unauth");
  const roleCheck = requireRole(result.actor, "admin");
  if (!roleCheck.ok) throw new Error("forbidden");
  await softDeleteSession(targetId, result.actor.tenant_id, result.actor.user_id);
  if (targetId === currentSessionId) {
    redirect("/home"); // throws NEXT_REDIRECT
  }
  revalidatePath("/home");
}
```

Client also calls `router.refresh()` on action success when not redirecting, because `revalidatePath` doesn't update other already-rendered client tree.

## Error handling

| Failure | Where | Behavior |
|---|---|---|
| Not signed in | Page | `redirect('/auth/signin')` (existing) |
| Not signed in | Route, action | 401 JSON; action throws |
| Not admin | Page | `redirect('/studio/${slug}')` (existing behavior, not 403) |
| Not admin | Route, action | 403 JSON; action throws |
| Invalid UUID in `?session=` | Page | `redirect('/home')` — strip param |
| Invalid UUID in POST body | Route | `400 {error:'invalid_session_id'}` |
| Session not found / archived / foreign-tenant | Page | `redirect('/home')` |
| Session not found / archived / foreign-tenant | Route | `410 {error:'session_not_found'}` |
| Session not found / archived / foreign-tenant | Action | throws |
| User-turn insert fails | Route | If new session was just created, `softDeleteSession` it; return `500 JSON {error:'turn_insert_failed'}`; no SSE opened |
| Stream interrupted mid-flight (network, abort, unmount) | Route + client | Existing PR-B path: in_progress row → `turn-to-vm` maps to `aborted` on hydration → InterruptedBanner. Live: ChatHome handles abort by setting in-progress agent turn to `aborted` locally. |
| Title backfill miss (null `home_sessions.title`) | DB read | `listSessions` SQL `COALESCE(title, '(empty)')` so type narrows to string |
| Delete race: row already archived | Action | `softDeleteSession` `.maybeSingle()` returns null → throw → client `toast.error("Already deleted")` + `router.refresh()` |
| Delete current session while streaming | Client | `controller.abort()` first + set local turn to aborted, then `deleteSessionAction()`, then `router.push('/home')` |
| Foreign-tenant `?session=<their-id>` | Page | `getSessionWithTurns` ownership predicate returns null → redirect. No 403 disclosure (same path as not-found). |

**Documented limitation:** mid-stream delete from a different browser tab does not signal the running route. The stream completes into the now-archived session row; subsequent page loads filter it out via `archived_at`. Mild visual oddity, no data loss.

## Testing

### Server library (`sessions.test.ts`)

- `getMostRecentSession`: returns null when none; returns latest non-archived
- `createSession`: creates with null title; sets ownership fields
- `getSessionWithTurns`: happy path / foreign tenant returns null / archived returns null / not-found returns null. Assert query filters include `id`, `tenant_id`, `user_id`, `archived_at IS NULL`.
- `listSessions`: only non-archived; reverse-chron by `last_activity_at`; title fallback applied at SQL layer. Assert query filters.
- `softDeleteSession`: sets `archived_at`; returns null and caller throws on 0-rows; throws on foreign tenant
- `deriveTitle`: empty → `(empty)`; whitespace-only → `(empty)`; multiline (newlines → space, then truncate); unbreakable 60-char string → force-truncate at 40; exact-40 → as-is; under-40 → as-is; 200-char with spaces → cut at word boundary near 40

### Route (`route.test.ts`)

- Non-admin → 403; not-signed-in → 401
- No `sessionId`, first turn → `session-created` SSE event emitted with `{sessionId, title}`, exactly once. Assert `createSession` was called with `(actor.tenant_id, actor.user_id)`. Assert `appendTurn` was called with `(newId, 'user', {text: userText})`. Assert title UPDATE was called with `deriveTitle(userText)`.
- Valid `sessionId` → `homeTurn` receives that session's recent turns (assert the actual arg, not just the call)
- Invalid UUID `sessionId` → `400 {error:'invalid_session_id'}`
- Foreign-tenant `sessionId` → `410`
- Archived `sessionId` → `410`
- `session-created` emitted AFTER `appendTurn(user)` succeeds: mock `appendTurn` to throw → assert no `session-created` SSE and assert `softDeleteSession` called on the new session
- Order assertion: in the new-session happy path, SSE event order is `session-created` → `text-delta` → `turn-end`

### Action (`actions.test.ts`)

- Non-admin → throws
- Delete target == current → throws `NEXT_REDIRECT` (Next's redirect control-flow error)
- Delete target != current → `revalidatePath('/home')` was called; no redirect
- Delete foreign-tenant session → throws (via `softDeleteSession` null path)
- Delete already-archived session → throws
- `currentSessionId` is documented as client-passed (UX-routing only, not authorization-relevant)

### Page (`page.test.tsx` or e2e in QA pass)

- `/home` no param → greeting + rail with sessions
- `/home?session=<valid-uuid-with-row>` → chat panel with turns
- `/home?session=<invalid-uuid>` → `redirect('/home')` (separate test branch from below)
- `/home?session=<valid-uuid-foreign-tenant>` → `redirect('/home')` (different branch from invalid)
- `/home?session=<valid-uuid-archived>` → `redirect('/home')`

### ChatHome (`ChatHome.test.tsx`)

- On `session-created` SSE → `router.replace` is NOT called immediately
- After `turn-end` SSE → `router.replace(?session=<new>)` called exactly once; `router.refresh()` called exactly once
- On `410` response → optimistic user+agent turns cleared from local state BEFORE `router.push('/home')`; toast surfaces
- On unmount → `AbortController.abort()` called
- `+ new` button → `router.push('/home')`
- Delete-current-while-streaming → `controller.abort()` called first; in-progress agent turn becomes `aborted` in local state; `deleteSessionAction` called; `router.push('/home')` called
- First-turn `session-created` title equals the title that gets persisted to `home_sessions.title` (round-trip test via mocked route)

### Known not unit-testable

- RLS enforcement (proven only at SQL/Supabase layer). Unit tests assert query filter args as proxy; Playwright integration coverage in the v1.7 QA pass exercises the real RLS path against a real Postgres.

## Scope estimate

~1-2 days, single PR-C. Stacks on `v17-home-intuitive` (PR #18, draft).

## Sequence (planned)

1. DB migration + backfill (one commit)
2. `sessions.ts` refactor + new helpers + tests (one commit)
3. Route changes + auth fix + tests (one commit)
4. Server action + tests (one commit)
5. `SessionRail` + `SessionList` + `SessionRow` + `SessionRailShell` components (one commit)
6. `ChatHome` changes (sessionId prop, SSE handlers, abort plumbing, 410 path) + tests (one commit)
7. `page.tsx` wiring + tests (one commit)
8. Local browser smoke + codex review pass on the diff
9. Open PR-C as draft, stacked on PR #18

## Open followups (not in scope)

- Search/filter in the rail when session count grows large
- Date grouping (Today / Yesterday / etc) once flat list gets unwieldy
- Rename inline / shared session links / archive (vs delete) distinction
- Cross-tab realtime via Supabase Realtime
- Mid-stream delete signaling from another tab (would require Realtime + abort plumbing)

## Cross-references

- [[project-v17-pr-b-open]] — the layer this stacks on
- [[feedback-intuitiveness-is-the-real-bar]] — the lens driving this PR
- [[feedback-codex-review-decisions]] — why three codex passes
- [[feedback-no-placeholders]] — why we ship a real working delete + real session ownership, not stubs
