# PR-C — /home chat history sidebar — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a Perplexity-style left rail to `/home` so users can see, switch between, and delete past chat sessions.

**Architecture:** Per-route left rail with URL-state session switching (`?session=<uuid>`). `home_sessions.title` column added so `listSessions` is a single query (no N+1). New SSE event `session-created` emitted after user-turn insert succeeds. `archived_at` is soft-delete (user-dismissed); the "exactly one active" invariant is dropped — selection is URL state, not a DB property.

**Tech Stack:** Next.js 16 App Router, React 19, Supabase (Postgres + RLS), TypeScript, Vitest (unit), framer-motion (already a dep, AnimatePresence only). No new deps.

**Design doc:** `docs/plans/2026-05-16-pr-c-chat-history-design.md` (read first — three codex passes folded in).

**Branch:** `v17-home-chat-history` off `v17-home-intuitive` (PR #18, draft).

---

## Task 0: Branch setup

**Step 1:** Confirm working tree is clean.
```bash
git status --short
```
Expected: only the pre-existing untracked Ramp design refs + audit doc (same as current PR-B state).

**Step 2:** Create branch off `v17-home-intuitive`.
```bash
git checkout -b v17-home-chat-history v17-home-intuitive
git log -1 --oneline
```
Expected: tip is `83297c0 docs(pr-c): chat history sidebar design...`.

---

## Task 1: DB migration — title column + backfill + index

**Files:**
- Create: `apps/dashboard/supabase/migrations/0046_home_sessions_title.sql`

**Step 1:** Find the next migration number.
```bash
ls apps/dashboard/supabase/migrations | tail -5
```
Expected: latest is `0045_home_sessions_and_turns.sql`. Use `0046_`.

**Step 2:** Write the migration.
```sql
-- 0046_home_sessions_title.sql
-- Adds derived-from-first-user-turn title to home_sessions for the
-- chat history rail (PR-C). Backfills existing rows; new sessions
-- get title written by the turn route on first user turn.

ALTER TABLE home_sessions
  ADD COLUMN title TEXT NULL;

-- Backfill from first user turn per session. Excludes empty/whitespace.
-- v1.6 stub agent rows are filtered by role='user' (stubs are role='agent').
UPDATE home_sessions s
SET title = sub.title
FROM (
  SELECT DISTINCT ON (t.session_id)
    t.session_id,
    LEFT(
      REGEXP_REPLACE(TRIM(BOTH FROM (t.content_jsonb->>'text')), '\s+', ' ', 'g'),
      80
    ) AS title
  FROM home_turns t
  WHERE t.role = 'user'
    AND t.content_jsonb ? 'text'
    AND LENGTH(TRIM(BOTH FROM (t.content_jsonb->>'text'))) > 0
  ORDER BY t.session_id, t.created_at ASC
) sub
WHERE s.id = sub.session_id;

-- Index for the rail's listSessions read: filter by ownership + non-archived,
-- order by recent activity.
CREATE INDEX IF NOT EXISTS home_sessions_rail_idx
  ON home_sessions (tenant_id, user_id, last_activity_at DESC)
  WHERE archived_at IS NULL;
```

Note: SQL backfill takes title at 80 chars (raw); TS `deriveTitle()` narrows to ~40 for display. Two-step is intentional — the DB stores the trimmed source text, the UI handles truncation. Actually scratch that — set it to ~40 in SQL for consistency with `deriveTitle`. Update the LEFT() to 40.

Actually keep SQL at 80 chars so future title-derivation can be smarter (LLM summary) without re-running migrations. `deriveTitle` at the UI layer handles the visible truncation. Update `listSessions` to `LEFT(COALESCE(title, '(empty)'), 40)` if needed.

Final decision: SQL backfill at 80 chars to preserve source. `deriveTitle` on write at ~40 (so new rows are pre-truncated). `listSessions` does not re-truncate — trusts what's stored. This matches the design doc's `deriveTitle` step at the write site.

So update the backfill to 40:

```sql
LEFT(
  REGEXP_REPLACE(TRIM(BOTH FROM (t.content_jsonb->>'text')), '\s+', ' ', 'g'),
  40
) AS title
```

**Step 3:** Run the migration locally (or remote if working in Supabase MCP mode).
```bash
# If using local supabase CLI:
cd apps/dashboard && supabase db reset --debug
# Or just apply this migration if no local db state:
# Otherwise apply via the Supabase MCP tool `apply_migration` (preferred for this repo).
```

**Step 4:** Verify column exists.
```bash
# Inspect via psql or Supabase dashboard, or use mcp__plugin_supabase_supabase__list_tables
```
Expected: `home_sessions.title` exists, nullable.

**Step 5:** Commit.
```bash
git add apps/dashboard/supabase/migrations/0046_home_sessions_title.sql
git commit -m "feat(home): add home_sessions.title + backfill + rail index (PR-C M1)"
```

---

## Task 2: deriveTitle pure function + tests

**Files:**
- Modify: `apps/dashboard/src/lib/home/sessions.ts` (add export)
- Modify: `apps/dashboard/src/lib/home/sessions.test.ts` (add suite)

**Step 1:** Write failing tests at the top of a new `describe("deriveTitle", ...)` block in `sessions.test.ts`.
```ts
import { deriveTitle } from "./sessions";

describe("deriveTitle", () => {
  it("returns '(empty)' for empty string", () => {
    expect(deriveTitle("")).toBe("(empty)");
  });
  it("returns '(empty)' for whitespace-only", () => {
    expect(deriveTitle("   \n\t  ")).toBe("(empty)");
  });
  it("collapses newlines to spaces", () => {
    expect(deriveTitle("hello\nworld")).toBe("hello world");
  });
  it("returns short input as-is", () => {
    expect(deriveTitle("draft thank you")).toBe("draft thank you");
  });
  it("truncates at word boundary near 40 chars", () => {
    const long = "draft a thank you note to oscartry about the meeting we had yesterday";
    const out = deriveTitle(long);
    expect(out.length).toBeLessThanOrEqual(43); // 40 + "..." cap
    expect(out.endsWith("...")).toBe(true);
    expect(out.startsWith("draft a thank you note")).toBe(true);
  });
  it("force-truncates unbreakable strings at 40 chars + ellipsis", () => {
    const unbreakable = "a".repeat(60);
    const out = deriveTitle(unbreakable);
    expect(out).toBe("a".repeat(40) + "...");
  });
  it("returns exactly-40-char input as-is (no ellipsis)", () => {
    const exact = "a".repeat(40);
    expect(deriveTitle(exact)).toBe(exact);
  });
});
```

**Step 2:** Run tests; expect failures.
```bash
pnpm --filter @bbc/dashboard test -- sessions.test --run
```
Expected: 7 new failures (`deriveTitle is not a function`).

**Step 3:** Implement at the bottom of `apps/dashboard/src/lib/home/sessions.ts`.
```ts
export function deriveTitle(text: string): string {
  const collapsed = text.replace(/\s+/g, " ").trim();
  if (collapsed.length === 0) return "(empty)";
  if (collapsed.length <= 40) return collapsed;
  // Try word boundary
  const slice = collapsed.slice(0, 40);
  const lastSpace = slice.lastIndexOf(" ");
  if (lastSpace >= 20) {
    return slice.slice(0, lastSpace) + "...";
  }
  return slice + "...";
}
```

**Step 4:** Run tests; expect green.
```bash
pnpm --filter @bbc/dashboard test -- sessions.test --run
```
Expected: 7 new passes.

**Step 5:** Commit.
```bash
git add apps/dashboard/src/lib/home/sessions.{ts,test.ts}
git commit -m "feat(home): deriveTitle pure helper + tests (PR-C M2)"
```

---

## Task 3: sessions.ts — getMostRecentSession + createSession + tests

**Files:**
- Modify: `apps/dashboard/src/lib/home/sessions.ts`
- Modify: `apps/dashboard/src/lib/home/sessions.test.ts`

**Step 1:** Tests.
```ts
describe("getMostRecentSession", () => {
  it("returns null when user has no sessions", async () => {
    // mock getSupabaseServerClient to return empty result
    expect(await getMostRecentSession("t1", "u1")).toBeNull();
  });
  it("returns latest non-archived session", async () => {
    // mock returns two rows ordered by last_activity_at desc
    const result = await getMostRecentSession("t1", "u1");
    expect(result?.id).toBe("session-latest");
  });
  it("filters by tenant_id and user_id", async () => {
    // assert the mocked .eq() calls include both
  });
});

describe("createSession", () => {
  it("inserts with null title and returns the row", async () => {
    const out = await createSession("t1", "u1");
    expect(out.title).toBeNull();
    expect(out.tenant_id).toBe("t1");
    expect(out.user_id).toBe("u1");
  });
});
```

**Step 2:** Run tests; expect failures (functions not defined).
```bash
pnpm --filter @bbc/dashboard test -- sessions.test --run
```

**Step 3:** Implement.
```ts
export async function getMostRecentSession(
  tenantId: string,
  userId: string,
): Promise<HomeSession | null> {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase
    .from("home_sessions")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("user_id", userId)
    .is("archived_at", null)
    .order("last_activity_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`getMostRecentSession failed: ${error.message}`);
  return data as HomeSession | null;
}

export async function createSession(
  tenantId: string,
  userId: string,
): Promise<HomeSession> {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase
    .from("home_sessions")
    .insert({ tenant_id: tenantId, user_id: userId })
    .select("*")
    .single();
  if (error || !data) {
    throw new Error(`createSession failed: ${error?.message ?? "no row"}`);
  }
  return data as HomeSession;
}
```

**Step 4:** Run tests; expect green.

**Step 5:** Commit.
```bash
git commit -m "feat(home): getMostRecentSession + createSession (PR-C M3)"
```

---

## Task 4: sessions.ts — getSessionWithTurns + tests

**Files:**
- Modify: `apps/dashboard/src/lib/home/sessions.ts`
- Modify: `apps/dashboard/src/lib/home/sessions.test.ts`

**Step 1:** Tests.
```ts
describe("getSessionWithTurns", () => {
  it("returns null for not-found id", async () => {
    const out = await getSessionWithTurns("ghost-id", "t1", "u1");
    expect(out).toBeNull();
  });
  it("returns null for foreign tenant", async () => {
    const out = await getSessionWithTurns("session-x", "wrong-tenant", "u1");
    expect(out).toBeNull();
  });
  it("returns null for archived session", async () => {
    const out = await getSessionWithTurns("archived-id", "t1", "u1");
    expect(out).toBeNull();
  });
  it("returns session + turns for happy path", async () => {
    const out = await getSessionWithTurns("session-1", "t1", "u1");
    expect(out?.session.id).toBe("session-1");
    expect(out?.turns).toHaveLength(2);
  });
  it("filters stub agent turns from returned turns", async () => {
    // mock returns one real + one stub agent turn
    const out = await getSessionWithTurns("session-1", "t1", "u1");
    expect(out?.turns.every(t => t.role === "user" || !STUB_PATTERNS.some(p => p.test(...)))).toBe(true);
  });
  it("applies turn limit", async () => {
    const out = await getSessionWithTurns("session-1", "t1", "u1", 5);
    // assert mocked .limit(5) was called
  });
});
```

**Step 2:** Run; expect fail.

**Step 3:** Implement (replaces existing `getActiveSessionWithTurns`).
```ts
export async function getSessionWithTurns(
  sessionId: string,
  tenantId: string,
  userId: string,
  limit = 50,
): Promise<{ session: HomeSession; turns: HomeTurn[] } | null> {
  const supabase = await getSupabaseServerClient();
  const { data: session, error: sErr } = await supabase
    .from("home_sessions")
    .select("*")
    .eq("id", sessionId)
    .eq("tenant_id", tenantId)
    .eq("user_id", userId)
    .is("archived_at", null)
    .maybeSingle();
  if (sErr) throw new Error(`getSessionWithTurns session read failed: ${sErr.message}`);
  if (!session) return null;

  const { data: turns, error: tErr } = await supabase
    .from("home_turns")
    .select("*")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true })
    .limit(limit);
  if (tErr) throw new Error(`getSessionWithTurns turns read failed: ${tErr.message}`);

  const all = (turns ?? []) as HomeTurn[];
  return { session: session as HomeSession, turns: all.filter(isNotStubTurn) };
}
```

**Step 4:** Run; expect green.

**Step 5:** Commit.
```bash
git commit -m "feat(home): getSessionWithTurns ownership-gated single read (PR-C M4)"
```

---

## Task 5: sessions.ts — listSessions + tests

**Files:** same.

**Step 1:** Tests.
```ts
describe("listSessions", () => {
  it("returns empty array when user has no sessions", async () => {
    expect(await listSessions("t1", "u1")).toEqual([]);
  });
  it("returns reverse-chron by last_activity_at", async () => {
    // mock returns ordered rows
    const out = await listSessions("t1", "u1");
    expect(out[0].last_activity_at > out[1].last_activity_at).toBe(true);
  });
  it("excludes archived sessions", async () => {
    // assert .is('archived_at', null) was called
  });
  it("applies '(empty)' fallback for null titles", async () => {
    // mock returns one row with title=null
    const out = await listSessions("t1", "u1");
    expect(out[0].title).toBe("(empty)");
  });
  it("returns lite shape only (id, title, last_activity_at)", async () => {
    const out = await listSessions("t1", "u1");
    expect(Object.keys(out[0])).toEqual(["id", "title", "last_activity_at"]);
  });
});
```

**Step 2:** Run; expect fail.

**Step 3:** Implement.
```ts
export type SessionRailItem = {
  id: string;
  title: string;
  last_activity_at: string;
};

export async function listSessions(
  tenantId: string,
  userId: string,
): Promise<SessionRailItem[]> {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase
    .from("home_sessions")
    .select("id, title, last_activity_at")
    .eq("tenant_id", tenantId)
    .eq("user_id", userId)
    .is("archived_at", null)
    .order("last_activity_at", { ascending: false });
  if (error) throw new Error(`listSessions failed: ${error.message}`);
  return (data ?? []).map((r) => ({
    id: r.id as string,
    title: (r.title as string | null) ?? "(empty)",
    last_activity_at: r.last_activity_at as string,
  }));
}
```

**Step 4:** Run; expect green.

**Step 5:** Commit.
```bash
git commit -m "feat(home): listSessions for rail with title fallback (PR-C M5)"
```

---

## Task 6: sessions.ts — softDeleteSession + tests

**Files:** same.

**Step 1:** Tests.
```ts
describe("softDeleteSession", () => {
  it("sets archived_at and returns", async () => {
    await softDeleteSession("s1", "t1", "u1");
    // assert .update({ archived_at: ... }) + .eq(id, tenant, user) + .is(archived_at, null) chain
  });
  it("throws when 0 rows match (foreign tenant)", async () => {
    // mock maybeSingle returns null
    await expect(softDeleteSession("s1", "wrong-tenant", "u1")).rejects.toThrow();
  });
  it("throws when already-archived", async () => {
    // same as 0-rows path
    await expect(softDeleteSession("archived-id", "t1", "u1")).rejects.toThrow();
  });
});
```

**Step 2:** Run; expect fail.

**Step 3:** Implement.
```ts
export async function softDeleteSession(
  sessionId: string,
  tenantId: string,
  userId: string,
): Promise<void> {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase
    .from("home_sessions")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", sessionId)
    .eq("tenant_id", tenantId)
    .eq("user_id", userId)
    .is("archived_at", null)
    .select("id")
    .maybeSingle();
  if (error) throw new Error(`softDeleteSession failed: ${error.message}`);
  if (!data) throw new Error(`softDeleteSession: no rows matched`);
}
```

**Step 4:** Run; expect green.

**Step 5:** Commit.
```bash
git commit -m "feat(home): softDeleteSession with ownership predicate (PR-C M6)"
```

---

## Task 7: Remove getOrCreateActiveSession + archiveSession + migrate callers

**Files:**
- Modify: `apps/dashboard/src/lib/home/sessions.ts`
- Modify: any caller (find via grep)

**Step 1:** Find callers.
```bash
grep -rn "getOrCreateActiveSession\|getActiveSessionWithTurns\|archiveSession" apps/dashboard/src --include="*.ts" --include="*.tsx"
```

**Step 2:** Open each caller and migrate:
- `getOrCreateActiveSession(t, u)` → only used by the turn route's no-sessionId branch; replace with `createSession(t, u)`. The route now handles the "find or create" decision explicitly.
- `getActiveSessionWithTurns(t, u)` → replace with `getSessionWithTurns(sessionId, t, u)` at call sites. Page is the only caller; passes the explicit sessionId from `searchParams`.
- `archiveSession(id)` → replace with `softDeleteSession(id, t, u)` at call sites. Tests + any other call.

**Step 3:** Delete the old exports from `sessions.ts`. Verify no remaining references.
```bash
grep -rn "getOrCreateActiveSession\|getActiveSessionWithTurns\|archiveSession" apps/dashboard/src
```
Expected: 0 hits.

**Step 4:** Run full sessions test suite + dependent tests.
```bash
pnpm --filter @bbc/dashboard test -- sessions --run
```
Expected: green.

**Step 5:** Commit.
```bash
git commit -m "refactor(home): remove getOrCreateActiveSession/archiveSession callers (PR-C M7)"
```

---

## Task 8: API route — auth admin gate + tests

**Files:**
- Modify: `apps/dashboard/src/app/api/home/turn/route.ts`
- Modify: `apps/dashboard/src/app/api/home/turn/route.test.ts`

**Step 1:** Test.
```ts
it("rejects non-admin actors with 403", async () => {
  vi.mocked(requireActor).mockResolvedValue({ ok: true, actor: nonAdminActor });
  const res = await POST(makeRequest({ userText: "hi" }));
  expect(res.status).toBe(403);
});
it("rejects unauth with 401", async () => {
  vi.mocked(requireActor).mockResolvedValue({ ok: false });
  const res = await POST(makeRequest({ userText: "hi" }));
  expect(res.status).toBe(401);
});
```

**Step 2:** Run; expect fail.

**Step 3:** Implement at the top of POST handler in `route.ts`:
```ts
const auth = await requireActor();
if (!auth.ok) return Response.json({ error: "unauth" }, { status: 401 });
const roleCheck = requireRole(auth.actor, "admin");
if (!roleCheck.ok) return Response.json({ error: "forbidden" }, { status: 403 });
const actor = auth.actor;
```

**Step 4:** Run; expect green. Run the full route suite to catch regressions.
```bash
pnpm --filter @bbc/dashboard test -- route.test --run
```

**Step 5:** Commit.
```bash
git commit -m "fix(home): /api/home/turn requires admin role (PR-C M8 + closes pre-existing bypass)"
```

---

## Task 9: API route — sessionId UUID validation

**Files:** same.

**Step 1:** Tests.
```ts
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

it("returns 400 for malformed sessionId", async () => {
  const res = await POST(makeRequest({ userText: "hi", sessionId: "not-a-uuid" }));
  expect(res.status).toBe(400);
});
it("accepts empty string sessionId as absent", async () => {
  const res = await POST(makeRequest({ userText: "hi", sessionId: "" }));
  // proceeds through happy path
});
```

**Step 2:** Run; expect fail.

**Step 3:** Implement after auth gate:
```ts
const body = await req.json();
const userText = String(body?.userText ?? "");
const rawSessionId = body?.sessionId;
const sessionId = typeof rawSessionId === "string" && rawSessionId.length > 0 ? rawSessionId : null;
if (sessionId !== null && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sessionId)) {
  return Response.json({ error: "invalid_session_id" }, { status: 400 });
}
```

**Step 4:** Run; expect green.

**Step 5:** Commit.
```bash
git commit -m "feat(home): /api/home/turn validates sessionId UUID (PR-C M9)"
```

---

## Task 10: API route — sessionId lookup + 410 + recent context from selected session

**Files:** same.

**Step 1:** Tests.
```ts
it("returns 410 for not-found sessionId", async () => {
  vi.mocked(getSessionWithTurns).mockResolvedValue(null);
  const res = await POST(makeRequest({ userText: "hi", sessionId: "00000000-0000-0000-0000-000000000000" }));
  expect(res.status).toBe(410);
});

it("returns 410 for foreign-tenant sessionId", async () => {
  vi.mocked(getSessionWithTurns).mockResolvedValue(null); // ownership predicate excludes
  const res = await POST(makeRequest({ userText: "hi", sessionId: validUuid }));
  expect(res.status).toBe(410);
});

it("uses recent turns from selected session for prompt context", async () => {
  vi.mocked(getSessionWithTurns).mockResolvedValue({ session: existingSession, turns: existingTurns });
  await POST(makeRequest({ userText: "hi", sessionId: existingSession.id }));
  expect(vi.mocked(homeTurn)).toHaveBeenCalledWith(
    expect.objectContaining({ recentTurns: existingTurns })
  );
});
```

**Step 2:** Run; expect fail.

**Step 3:** Implement after UUID validation:
```ts
let session: HomeSession;
let recentTurns: HomeTurn[];
let isNewSession = false;

if (sessionId !== null) {
  const found = await getSessionWithTurns(sessionId, actor.tenant_id, actor.user_id);
  if (!found) return Response.json({ error: "session_not_found" }, { status: 410 });
  session = found.session;
  recentTurns = found.turns;
} else {
  session = await createSession(actor.tenant_id, actor.user_id);
  recentTurns = [];
  isNewSession = true;
}
```

Then thread `recentTurns` into wherever the route currently calls `homeTurn` / the orchestrator. Replace the existing `getActiveSessionWithTurns` call there.

**Step 4:** Run; expect green.

**Step 5:** Commit.
```bash
git commit -m "feat(home): /api/home/turn routes by sessionId, 410 on missing (PR-C M10)"
```

---

## Task 11: API route — user turn insert + orphan cleanup + title write

**Files:** same.

**Step 1:** Tests.
```ts
it("appends user turn and writes derived title on new session", async () => {
  vi.mocked(appendTurn).mockResolvedValue(userTurnRow);
  await POST(makeRequest({ userText: "Draft a thank-you to oscartry" }));
  // assert createSession called
  expect(createSession).toHaveBeenCalled();
  // assert appendTurn called with user role, the userText
  expect(appendTurn).toHaveBeenCalledWith(
    expect.any(String),
    "user",
    expect.objectContaining({ text: "Draft a thank-you to oscartry" }),
  );
  // assert title update SQL was called with deriveTitle output
  expect(updateSessionTitle).toHaveBeenCalledWith(
    expect.any(String),
    "Draft a thank-you to oscartry",
  );
});

it("soft-deletes the new session if user-turn insert fails", async () => {
  vi.mocked(appendTurn).mockRejectedValueOnce(new Error("db down"));
  const res = await POST(makeRequest({ userText: "hi" }));
  expect(res.status).toBe(500);
  expect(softDeleteSession).toHaveBeenCalledWith(
    expect.any(String),
    expect.any(String),
    expect.any(String),
  );
  // assert SSE not opened (no session-created emitted)
});

it("does not write title for existing session", async () => {
  vi.mocked(getSessionWithTurns).mockResolvedValue({ session: existing, turns: [] });
  await POST(makeRequest({ userText: "follow up", sessionId: existing.id }));
  expect(updateSessionTitle).not.toHaveBeenCalled();
});
```

**Step 2:** Run; expect fail.

**Step 3:** Add helper `updateSessionTitle` to `sessions.ts` (small):
```ts
export async function updateSessionTitle(
  sessionId: string,
  rawText: string,
): Promise<void> {
  const supabase = await getSupabaseServerClient();
  await supabase
    .from("home_sessions")
    .update({ title: deriveTitle(rawText) })
    .eq("id", sessionId);
}
```

Implement in route after session resolution:
```ts
let userTurn: HomeTurn;
try {
  userTurn = await appendTurn(session.id, "user", { text: userText });
} catch (e) {
  if (isNewSession) {
    try { await softDeleteSession(session.id, actor.tenant_id, actor.user_id); } catch {}
  }
  return Response.json({ error: "turn_insert_failed" }, { status: 500 });
}

if (isNewSession) {
  await updateSessionTitle(session.id, userText);
}
```

**Step 4:** Run; expect green.

**Step 5:** Commit.
```bash
git commit -m "feat(home): user-turn insert + orphan cleanup + title write (PR-C M11)"
```

---

## Task 12: API route — session-created + turn-end SSE events

**Files:** same. Also update `apps/dashboard/src/components/chat-home/types.ts` (or wherever SSE event types live).

**Step 1:** Tests.
```ts
it("emits session-created with {sessionId, title} as first SSE event on new session", async () => {
  const events = await collectSseEvents(POST, { userText: "draft thank you" });
  expect(events[0]).toEqual({
    type: "session-created",
    sessionId: expect.any(String),
    title: "draft thank you",
  });
});

it("emits session-created AFTER user-turn insert succeeds, not before", async () => {
  const calls: string[] = [];
  vi.mocked(appendTurn).mockImplementation(async (...args) => {
    calls.push("appendTurn");
    return userTurnRow;
  });
  // patch the SSE encoder to push 'sse:type' to calls
  await collectSseEvents(POST, { userText: "hi" });
  expect(calls.indexOf("appendTurn")).toBeLessThan(calls.indexOf("sse:session-created"));
});

it("does not emit session-created for existing session", async () => {
  vi.mocked(getSessionWithTurns).mockResolvedValue({ session: existing, turns: [] });
  const events = await collectSseEvents(POST, { userText: "follow up", sessionId: existing.id });
  expect(events.find(e => e.type === "session-created")).toBeUndefined();
});

it("emits turn-end with last_activity_at", async () => {
  const events = await collectSseEvents(POST, { userText: "hi" });
  const end = events.find(e => e.type === "turn-end");
  expect(end?.last_activity_at).toBeDefined();
});
```

**Step 2:** Run; expect fail.

**Step 3:** Add SSE event types:
```ts
// in the SSE types file
type SseSessionCreated = { type: "session-created"; sessionId: string; title: string };
type SseTurnEnd = { type: "turn-end"; last_activity_at: string };
// add to the union of SSE event types
```

In the route stream open block (right after the user-turn insert and title write, before the LLM stream opens):
```ts
if (isNewSession) {
  yield encodeSse({ type: "session-created", sessionId: session.id, title: deriveTitle(userText) });
}
// ... existing text-delta loop ...
// at the very end of the stream, after appendTurn(agent, completed):
const final = await supabase
  .from("home_sessions")
  .select("last_activity_at")
  .eq("id", session.id)
  .single();
yield encodeSse({ type: "turn-end", last_activity_at: final.data?.last_activity_at });
```

(Pseudocode — match the actual stream implementation in the file.)

**Step 4:** Run; expect green.

**Step 5:** Commit.
```bash
git commit -m "feat(home): session-created + turn-end SSE events (PR-C M12)"
```

---

## Task 13: Server action — deleteSessionAction + tests

**Files:**
- Create: `apps/dashboard/src/app/home/actions.ts`
- Create: `apps/dashboard/src/app/home/actions.test.ts`

**Step 1:** Tests.
```ts
import { deleteSessionAction } from "./actions";

describe("deleteSessionAction", () => {
  it("rejects unauth", async () => {
    vi.mocked(requireActor).mockResolvedValue({ ok: false });
    await expect(deleteSessionAction("s1")).rejects.toThrow();
  });
  it("rejects non-admin", async () => {
    vi.mocked(requireActor).mockResolvedValue({ ok: true, actor: nonAdminActor });
    await expect(deleteSessionAction("s1")).rejects.toThrow();
  });
  it("redirects when target === current", async () => {
    vi.mocked(requireActor).mockResolvedValue({ ok: true, actor: adminActor });
    await expect(deleteSessionAction("s1", "s1")).rejects.toMatchObject({
      digest: expect.stringContaining("NEXT_REDIRECT"),
    });
  });
  it("revalidates path when target !== current", async () => {
    vi.mocked(requireActor).mockResolvedValue({ ok: true, actor: adminActor });
    await deleteSessionAction("s1", "s2");
    expect(revalidatePath).toHaveBeenCalledWith("/home");
  });
  it("throws when softDeleteSession fails (foreign or archived)", async () => {
    vi.mocked(softDeleteSession).mockRejectedValueOnce(new Error("no rows"));
    await expect(deleteSessionAction("s1")).rejects.toThrow();
  });
});
```

**Step 2:** Run; expect fail.

**Step 3:** Implement.
```ts
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireActor, requireRole } from "@/lib/auth/require-user";
import { softDeleteSession } from "@/lib/home/sessions";

export async function deleteSessionAction(
  targetId: string,
  currentSessionId?: string,
): Promise<void> {
  const auth = await requireActor();
  if (!auth.ok) throw new Error("unauth");
  const roleCheck = requireRole(auth.actor, "admin");
  if (!roleCheck.ok) throw new Error("forbidden");
  await softDeleteSession(targetId, auth.actor.tenant_id, auth.actor.user_id);
  if (targetId === currentSessionId) {
    redirect("/home");
  }
  revalidatePath("/home");
}
```

**Step 4:** Run; expect green.

**Step 5:** Commit.
```bash
git commit -m "feat(home): deleteSessionAction server action (PR-C M13)"
```

---

## Task 14: SessionRow client component + tests

**Files:**
- Create: `apps/dashboard/src/components/chat-home/SessionRow.tsx`
- Create: `apps/dashboard/src/components/chat-home/SessionRow.test.tsx`

**Step 1:** Tests.
```tsx
describe("SessionRow", () => {
  it("renders title", () => {
    render(<SessionRow session={{id:"s1", title:"draft thank you", last_activity_at:""}} isCurrent={false} onDelete={vi.fn()} />);
    expect(screen.getByText("draft thank you")).toBeInTheDocument();
  });
  it("links to /home?session=<id>", () => {
    render(<SessionRow session={{id:"s1", title:"...", last_activity_at:""}} isCurrent={false} onDelete={vi.fn()} />);
    expect(screen.getByRole("link")).toHaveAttribute("href", "/home?session=s1");
  });
  it("renders kebab button", () => {
    render(<SessionRow ... />);
    expect(screen.getByRole("button", { name: /more/i })).toBeInTheDocument();
  });
  it("opens popover on kebab click", async () => {
    render(<SessionRow ... />);
    await userEvent.click(screen.getByRole("button", { name: /more/i }));
    expect(screen.getByRole("button", { name: /delete/i })).toBeInTheDocument();
  });
  it("calls onDelete on confirm", async () => {
    const onDelete = vi.fn();
    render(<SessionRow session={{...}} isCurrent={false} onDelete={onDelete} />);
    await userEvent.click(screen.getByRole("button", { name: /more/i }));
    await userEvent.click(screen.getByRole("button", { name: /^delete$/i }));
    expect(onDelete).toHaveBeenCalledWith("s1");
  });
  it("applies isCurrent styling when current", () => {
    const { container } = render(<SessionRow session={{...}} isCurrent={true} onDelete={vi.fn()} />);
    expect(container.firstChild).toHaveAttribute("data-current", "true");
  });
});
```

**Step 2:** Run; expect fail.

**Step 3:** Implement.
```tsx
"use client";

import Link from "next/link";
import { useState } from "react";
import { motion } from "framer-motion";
import type { SessionRailItem } from "@/lib/home/sessions";

export function SessionRow({
  session,
  isCurrent,
  onDelete,
}: {
  session: SessionRailItem;
  isCurrent: boolean;
  onDelete: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <motion.div
      data-current={isCurrent}
      className="session-row group relative flex items-center gap-2"
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97 }}
      transition={{ duration: 0.15 }}
    >
      <Link href={`/home?session=${session.id}`} className="flex-1 truncate">
        {session.title}
      </Link>
      <button
        type="button"
        aria-label="more"
        onClick={() => setOpen(v => !v)}
        className="opacity-0 group-hover:opacity-100 data-[touch=true]:opacity-100 ..."
      >
        ⋯
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-full popover ...">
          <button onClick={() => { setOpen(false); onDelete(session.id); }}>Delete</button>
          <button onClick={() => setOpen(false)}>Cancel</button>
        </div>
      )}
    </motion.div>
  );
}
```

**Step 4:** Run; expect green.

**Step 5:** Commit.
```bash
git commit -m "feat(home): SessionRow with kebab + delete popover (PR-C M14)"
```

---

## Task 15: SessionList client wrapper (AnimatePresence + delete callback context)

**Files:**
- Create: `apps/dashboard/src/components/chat-home/SessionList.tsx`
- Create: `apps/dashboard/src/components/chat-home/SessionList.test.tsx`

**Step 1:** Tests.
```tsx
it("renders one SessionRow per session", () => {
  render(<SessionList sessions={[s1, s2]} currentSessionId={null} onDelete={vi.fn()} />);
  expect(screen.getAllByRole("link")).toHaveLength(2);
});
it("marks the current session", () => {
  render(<SessionList sessions={[s1, s2]} currentSessionId="s2" onDelete={vi.fn()} />);
  const rows = screen.getAllByRole("link").map(l => l.closest("[data-current]"));
  expect(rows[0]).toHaveAttribute("data-current", "false");
  expect(rows[1]).toHaveAttribute("data-current", "true");
});
it("calls onDelete with session id when row triggers delete", async () => {
  const onDelete = vi.fn();
  render(<SessionList sessions={[s1]} currentSessionId={null} onDelete={onDelete} />);
  await userEvent.click(screen.getByRole("button", { name: /more/i }));
  await userEvent.click(screen.getByRole("button", { name: /^delete$/i }));
  expect(onDelete).toHaveBeenCalledWith(s1.id);
});
```

**Step 2:** Run; expect fail.

**Step 3:** Implement.
```tsx
"use client";

import { AnimatePresence } from "framer-motion";
import { SessionRow } from "./SessionRow";
import type { SessionRailItem } from "@/lib/home/sessions";

export function SessionList({
  sessions,
  currentSessionId,
  onDelete,
}: {
  sessions: SessionRailItem[];
  currentSessionId: string | null;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="session-list flex flex-col gap-0.5">
      <AnimatePresence initial={false}>
        {sessions.map(s => (
          <SessionRow
            key={s.id}
            session={s}
            isCurrent={s.id === currentSessionId}
            onDelete={onDelete}
          />
        ))}
      </AnimatePresence>
    </div>
  );
}
```

**Step 4:** Run; expect green.

**Step 5:** Commit.
```bash
git commit -m "feat(home): SessionList with AnimatePresence (PR-C M15)"
```

---

## Task 16: SessionRail server component

**Files:**
- Create: `apps/dashboard/src/components/chat-home/SessionRail.tsx`

**Step 1:** Implement (server component — no test, exercised via page test).
```tsx
import Link from "next/link";
import { SessionList } from "./SessionList";
import type { SessionRailItem } from "@/lib/home/sessions";

export function SessionRail({
  sessions,
  currentSessionId,
  onDelete,
}: {
  sessions: SessionRailItem[];
  currentSessionId: string | null;
  onDelete: (id: string) => void; // passed down via shell context, not directly here
}) {
  return (
    <aside className="session-rail flex flex-col gap-3 p-3 ...">
      <Link href="/home" className="new-chat-btn ...">+ new chat</Link>
      <SessionList sessions={sessions} currentSessionId={currentSessionId} onDelete={onDelete} />
    </aside>
  );
}
```

Wait — since `onDelete` requires a client component up the tree, `SessionRail` cannot directly receive a callback. The shell will own the callback and pass it down via context, OR — simpler — `SessionRail` becomes a thin wrapper that doesn't take `onDelete`, just passes `sessions` to `SessionList` which reads the callback from a React context provided by `SessionRailShell`.

Revise: `SessionRail` takes only `sessions` and `currentSessionId`. Delete handling lives entirely in `SessionList` reading from `SessionRailContext`.

```tsx
// Revised:
export function SessionRail({
  sessions,
  currentSessionId,
}: {
  sessions: SessionRailItem[];
  currentSessionId: string | null;
}) {
  return (
    <aside className="session-rail flex flex-col gap-3 p-3 ...">
      <Link href="/home" className="new-chat-btn ...">+ new chat</Link>
      <SessionList sessions={sessions} currentSessionId={currentSessionId} />
    </aside>
  );
}
```

And `SessionList` reads `onDelete` from `useSessionRailContext()`.

**Step 2:** Update `SessionList.tsx` + tests to use context. Re-run tests, fix.

**Step 3:** Commit.
```bash
git commit -m "feat(home): SessionRail server component (PR-C M16)"
```

---

## Task 17: SessionRailShell client wrapper (drawer + context + slot pattern)

**Files:**
- Create: `apps/dashboard/src/components/chat-home/SessionRailShell.tsx`
- Create: `apps/dashboard/src/components/chat-home/SessionRailShell.test.tsx`

**Step 1:** Tests.
```tsx
it("renders rail and children side by side on desktop", () => {
  render(
    <SessionRailShell rail={<div data-testid="rail" />} onDelete={vi.fn()}>
      <div data-testid="chat" />
    </SessionRailShell>
  );
  expect(screen.getByTestId("rail")).toBeInTheDocument();
  expect(screen.getByTestId("chat")).toBeInTheDocument();
});
it("toggles drawer on mobile via button", async () => {
  // mock window matchMedia for mobile
  render(<SessionRailShell ... />);
  const toggle = screen.getByRole("button", { name: /sessions/i });
  await userEvent.click(toggle);
  expect(screen.getByRole("dialog")).toBeInTheDocument();
});
it("provides onDelete to children via context", async () => {
  const onDelete = vi.fn();
  function Consumer() {
    const ctx = useSessionRailContext();
    return <button onClick={() => ctx.onDelete("s1")}>trigger</button>;
  }
  render(
    <SessionRailShell rail={<Consumer />} onDelete={onDelete}>
      <div />
    </SessionRailShell>
  );
  await userEvent.click(screen.getByText("trigger"));
  expect(onDelete).toHaveBeenCalledWith("s1");
});
```

**Step 2:** Run; expect fail.

**Step 3:** Implement.
```tsx
"use client";

import { createContext, useContext, useState } from "react";

type Ctx = { onDelete: (id: string) => void };
const SessionRailContext = createContext<Ctx | null>(null);

export function useSessionRailContext(): Ctx {
  const ctx = useContext(SessionRailContext);
  if (!ctx) throw new Error("useSessionRailContext outside provider");
  return ctx;
}

export function SessionRailShell({
  rail,
  children,
  onDelete,
}: {
  rail: React.ReactNode;
  children: React.ReactNode;
  onDelete: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <SessionRailContext.Provider value={{ onDelete }}>
      <div className="session-shell flex">
        <button
          type="button"
          aria-label="sessions"
          className="md:hidden ..."
          onClick={() => setOpen(true)}
        >
          ☰
        </button>
        <div className={open ? "drawer drawer-open" : "drawer hidden md:block"} role={open ? "dialog" : undefined}>
          {rail}
        </div>
        {open && <button className="drawer-scrim" onClick={() => setOpen(false)} />}
        <main className="flex-1">{children}</main>
      </div>
    </SessionRailContext.Provider>
  );
}
```

Also update `SessionList` to read `onDelete` from context:
```tsx
import { useSessionRailContext } from "./SessionRailShell";

export function SessionList({ sessions, currentSessionId }: {
  sessions: SessionRailItem[];
  currentSessionId: string | null;
}) {
  const { onDelete } = useSessionRailContext();
  return ( ... );
}
```

**Step 4:** Run; expect green.

**Step 5:** Commit.
```bash
git commit -m "feat(home): SessionRailShell with drawer + delete context (PR-C M17)"
```

---

## Task 18: ChatHome — sessionId prop + POST body

**Files:**
- Modify: `apps/dashboard/src/components/chat-home/ChatHome.tsx`
- Modify: `apps/dashboard/src/components/chat-home/ChatHome.test.tsx` (or similar)

**Step 1:** Test.
```tsx
it("sends sessionId in POST body when provided", async () => {
  const fetchSpy = vi.spyOn(global, "fetch");
  render(<ChatHome sessionId="abc-123" initialTurns={[]} />);
  await userEvent.type(screen.getByRole("textbox"), "hi");
  await userEvent.click(screen.getByRole("button", { name: /send/i }));
  expect(fetchSpy).toHaveBeenCalledWith("/api/home/turn",
    expect.objectContaining({ body: JSON.stringify({ userText: "hi", sessionId: "abc-123" }) })
  );
});
it("sends sessionId: null when sessionId is null", async () => {
  // similar, body has sessionId: null
});
```

**Step 2:** Run; expect fail (prop doesn't exist yet).

**Step 3:** Implement: add `sessionId: string | null` prop to `ChatHome`. Thread into POST body.

**Step 4:** Run; expect green.

**Step 5:** Commit.
```bash
git commit -m "feat(home): ChatHome accepts sessionId prop (PR-C M18)"
```

---

## Task 19: ChatHome — session-created handler (defer navigate to turn-end)

**Files:** same.

**Step 1:** Tests.
```tsx
it("does NOT call router.replace on session-created SSE", async () => {
  const router = mockRouter();
  // mock fetch to return SSE stream: session-created, text-delta, turn-end
  render(<ChatHome sessionId={null} initialTurns={[]} />);
  // ... send message, drain stream up to session-created ...
  expect(router.replace).not.toHaveBeenCalled();
});

it("calls router.replace once after turn-end with the new sessionId", async () => {
  const router = mockRouter();
  render(<ChatHome sessionId={null} initialTurns={[]} />);
  // ... full stream including turn-end ...
  expect(router.replace).toHaveBeenCalledTimes(1);
  expect(router.replace).toHaveBeenCalledWith(`?${new URLSearchParams({session: "new-id"}).toString()}`);
});

it("calls router.refresh once after turn-end", async () => {
  // same setup
  expect(router.refresh).toHaveBeenCalledTimes(1);
});
```

**Step 2:** Run; expect fail.

**Step 3:** Implement. In `ChatHome`, add state `pendingNewSessionId: string | null = null`. SSE handler:
```ts
if (evt.type === "session-created") {
  pendingNewSessionIdRef.current = evt.sessionId;
}
if (evt.type === "turn-end") {
  if (pendingNewSessionIdRef.current) {
    router.replace(`?${new URLSearchParams({ session: pendingNewSessionIdRef.current }).toString()}`);
    pendingNewSessionIdRef.current = null;
  }
  router.refresh();
}
```

**Step 4:** Run; expect green.

**Step 5:** Commit.
```bash
git commit -m "feat(home): ChatHome handles session-created + deferred navigate (PR-C M19)"
```

---

## Task 20: ChatHome — 410 handler

**Files:** same.

**Step 1:** Tests.
```tsx
it("on 410 response, clears optimistic turns and redirects to /home", async () => {
  vi.spyOn(global, "fetch").mockResolvedValueOnce(
    new Response(JSON.stringify({ error: "session_not_found" }), { status: 410 })
  );
  const router = mockRouter();
  render(<ChatHome sessionId="ghost-id" initialTurns={[]} />);
  await userEvent.type(screen.getByRole("textbox"), "hi");
  await userEvent.click(screen.getByRole("button", { name: /send/i }));
  // wait microtask
  expect(screen.queryByText("hi")).not.toBeInTheDocument(); // optimistic cleared
  expect(router.push).toHaveBeenCalledWith("/home");
  expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/deleted/i));
});
```

**Step 2:** Run; expect fail.

**Step 3:** Implement. After fetch response:
```ts
if (response.status === 410) {
  setTurns(turns => turns.filter(t => t.id !== optimisticUserTurnId && t.id !== optimisticAgentTurnId));
  toast.error("This chat was deleted");
  router.push("/home");
  return;
}
```

**Step 4:** Run; expect green.

**Step 5:** Commit.
```bash
git commit -m "feat(home): ChatHome 410 handler clears optimistic + redirects (PR-C M20)"
```

---

## Task 21: ChatHome — AbortController cleanup on unmount

**Files:** same.

**Step 1:** Test.
```tsx
it("aborts in-flight controller on unmount", async () => {
  const aborts = vi.fn();
  vi.spyOn(AbortController.prototype, "abort").mockImplementation(aborts);
  const { unmount } = render(<ChatHome sessionId={null} initialTurns={[]} />);
  await userEvent.type(screen.getByRole("textbox"), "hi");
  await userEvent.click(screen.getByRole("button", { name: /send/i }));
  unmount();
  expect(aborts).toHaveBeenCalled();
});
```

**Step 2:** Run; expect fail (probably; depends on current ChatHome lifecycle).

**Step 3:** Implement. Hold controller in a ref; cleanup in useEffect:
```ts
const controllerRef = useRef<AbortController | null>(null);
useEffect(() => () => controllerRef.current?.abort(), []);
// on send: controllerRef.current = new AbortController(); pass .signal into fetch
```

**Step 4:** Run; expect green.

**Step 5:** Commit.
```bash
git commit -m "fix(home): ChatHome aborts in-flight stream on unmount (PR-C M21)"
```

---

## Task 22: ChatHome — onDelete handler (live abort if current)

**Files:** same.

**Step 1:** Tests.
```tsx
it("on delete of current session, aborts stream first then calls action then redirects", async () => {
  const aborts = vi.fn();
  vi.spyOn(AbortController.prototype, "abort").mockImplementation(aborts);
  const router = mockRouter();
  render(<ChatHome sessionId="cur" initialTurns={[]} />);
  // start a stream
  await userEvent.type(screen.getByRole("textbox"), "hi");
  await userEvent.click(screen.getByRole("button", { name: /send/i }));
  // simulate delete callback fired from rail
  await act(() => globalDeleteHandler("cur"));
  expect(aborts).toHaveBeenCalled();
  expect(deleteSessionAction).toHaveBeenCalledWith("cur", "cur");
  expect(router.push).toHaveBeenCalledWith("/home");
});

it("on delete of non-current session, calls action then refresh, no abort", async () => {
  // similar but targetId !== sessionId
  expect(aborts).not.toHaveBeenCalled();
  expect(deleteSessionAction).toHaveBeenCalledWith("s2", "cur");
  expect(router.refresh).toHaveBeenCalled();
});

it("on delete failure, surfaces toast and does not redirect", async () => {
  vi.mocked(deleteSessionAction).mockRejectedValueOnce(new Error("nope"));
  // ...
  expect(toast.error).toHaveBeenCalled();
  expect(router.push).not.toHaveBeenCalledWith("/home");
});
```

**Step 2:** Run; expect fail.

**Step 3:** Implement. ChatHome receives `onDeleteRequest` either as prop or reads from context. Match the SessionRailShell context approach:
```ts
// In ChatHome (or in the page-level layout component that owns both rail context and chat)
async function handleDelete(targetId: string) {
  try {
    if (targetId === sessionId && controllerRef.current) {
      controllerRef.current.abort();
      // mark in-progress turn aborted locally
      setTurns(turns => turns.map(t => t.status === "in_progress" ? { ...t, status: "aborted" } : t));
    }
    await deleteSessionAction(targetId, sessionId ?? undefined);
    if (targetId === sessionId) {
      router.push("/home");
    } else {
      router.refresh();
    }
  } catch (e) {
    toast.error("Couldn't delete chat");
  }
}
```

Wire it: page.tsx passes `handleDelete` (defined in a thin client wrapper) as the `onDelete` prop to `SessionRailShell`.

**Step 4:** Run; expect green.

**Step 5:** Commit.
```bash
git commit -m "feat(home): ChatHome handles delete callback with live abort (PR-C M22)"
```

---

## Task 23: page.tsx wiring + tests

**Files:**
- Modify: `apps/dashboard/src/app/home/page.tsx`
- Create or modify: `apps/dashboard/src/app/home/page.test.tsx`

**Step 1:** Tests (server-component testing; use vitest + node env).
```tsx
it("redirects to /home for invalid UUID in ?session=", async () => {
  await expect(HomePage({ searchParams: { session: "not-a-uuid" } })).rejects.toMatchObject({
    digest: expect.stringContaining("NEXT_REDIRECT"),
  });
});
it("redirects to /home for foreign-tenant session", async () => {
  vi.mocked(getSessionWithTurns).mockResolvedValue(null);
  await expect(HomePage({ searchParams: { session: validUuid } })).rejects.toMatchObject({
    digest: expect.stringContaining("NEXT_REDIRECT"),
  });
});
it("renders greeting state when no session param", async () => {
  const rendered = await HomePage({ searchParams: {} });
  // assert SessionRail rendered with currentSessionId={null}
});
it("renders chat panel for valid session", async () => {
  vi.mocked(getSessionWithTurns).mockResolvedValue({ session: existing, turns: existingTurns });
  const rendered = await HomePage({ searchParams: { session: existing.id } });
  // assert ChatHome rendered with sessionId=existing.id
});
```

**Step 2:** Run; expect fail.

**Step 3:** Implement.
```tsx
import { redirect } from "next/navigation";
import { requireActor, requireRole } from "@/lib/auth/require-user";
import {
  getSessionWithTurns,
  listSessions,
  type SessionRailItem,
} from "@/lib/home/sessions";
import { SessionRail } from "@/components/chat-home/SessionRail";
import { SessionRailShell } from "@/components/chat-home/SessionRailShell";
import { ChatHome } from "@/components/chat-home/ChatHome";
import { HomeDeleteBridge } from "@/components/chat-home/HomeDeleteBridge";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const dynamic = "force-dynamic";

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ session?: string }>;
}) {
  const params = await searchParams;
  const auth = await requireActor();
  if (!auth.ok) redirect("/auth/signin");
  const role = requireRole(auth.actor, "admin");
  if (!role.ok) redirect(`/studio/${auth.actor.tenant_slug ?? ""}`);
  const actor = auth.actor;

  const rawSession = params.session;
  const sessionId =
    typeof rawSession === "string" && UUID_RE.test(rawSession) ? rawSession : null;
  if (rawSession && !sessionId) redirect("/home");

  let initialTurns: HomeTurn[] = [];
  if (sessionId) {
    const found = await getSessionWithTurns(sessionId, actor.tenant_id, actor.user_id);
    if (!found) redirect("/home");
    initialTurns = found.turns;
  }

  const sessions: SessionRailItem[] = await listSessions(actor.tenant_id, actor.user_id);

  return (
    <HomeDeleteBridge>
      {(handleDelete) => (
        <SessionRailShell rail={<SessionRail sessions={sessions} currentSessionId={sessionId} />} onDelete={handleDelete}>
          <ChatHome key={sessionId ?? "new"} sessionId={sessionId} initialTurns={initialTurns} />
        </SessionRailShell>
      )}
    </HomeDeleteBridge>
  );
}
```

`HomeDeleteBridge` is a tiny client component that owns the delete handler (which needs `useRouter` + the live abort controller from ChatHome). It uses a render prop OR — simpler — a `<HomeClient>` wrapper that contains both ChatHome and the delete plumbing.

Cleaner: collapse into a single `<HomeClient>` client component that wraps everything client-side. page.tsx renders `<HomeClient sessionId={sessionId} sessions={sessions} initialTurns={initialTurns} />`. HomeClient renders SessionRailShell + ChatHome and owns the delete handler bridging them.

```tsx
// In page.tsx — simpler:
return (
  <HomeClient
    sessionId={sessionId}
    sessions={sessions}
    initialTurns={initialTurns}
  />
);
```

```tsx
// HomeClient.tsx (client component):
"use client";
import { useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { SessionRailShell } from "./SessionRailShell";
import { SessionRail } from "./SessionRail";
import { ChatHome } from "./ChatHome";
import { deleteSessionAction } from "@/app/home/actions";

export function HomeClient({ sessionId, sessions, initialTurns }) {
  const router = useRouter();
  const abortRef = useRef<AbortController | null>(null);

  const handleDelete = useCallback(async (targetId: string) => {
    try {
      if (targetId === sessionId && abortRef.current) {
        abortRef.current.abort();
      }
      await deleteSessionAction(targetId, sessionId ?? undefined);
      if (targetId !== sessionId) router.refresh();
      // redirect happens server-side via redirect() when target === current
    } catch (e: any) {
      // NEXT_REDIRECT will throw — don't surface as error
      if (e?.digest?.startsWith?.("NEXT_REDIRECT")) throw e;
      toast.error("Couldn't delete chat");
    }
  }, [sessionId, router]);

  return (
    <SessionRailShell
      rail={<SessionRail sessions={sessions} currentSessionId={sessionId} />}
      onDelete={handleDelete}
    >
      <ChatHome
        key={sessionId ?? "new"}
        sessionId={sessionId}
        initialTurns={initialTurns}
        abortRef={abortRef}
      />
    </SessionRailShell>
  );
}
```

Update `ChatHome` to accept `abortRef` (or expose its controller ref upward via `useImperativeHandle`).

**Step 4:** Run all home-related tests; expect green.
```bash
pnpm --filter @bbc/dashboard test -- home --run
```

**Step 5:** Commit.
```bash
git commit -m "feat(home): page.tsx + HomeClient wire rail + chat + delete (PR-C M23)"
```

---

## Task 24: Type-check + full test pass

**Step 1:** Type-check.
```bash
pnpm --filter @bbc/dashboard type-check
```
Expected: no errors.

**Step 2:** Full unit suite.
```bash
pnpm --filter @bbc/dashboard test --run
```
Expected: all green (was 710/710 before PR-C; should be 710 + new tests).

**Step 3:** Commit any incidental fixes from type-check.

---

## Task 25: Local browser smoke

**Step 1:** Start dev server (or confirm it's still running from PR-B session).
```bash
pnpm --filter @bbc/dashboard dev
```

**Step 2:** Open `localhost:3000/home`. Sign in as oscartry.

**Step 3:** Smoke checklist:
- [ ] Greeting state on bare `/home`; rail visible on desktop; sessions from prior chats listed in reverse-chron
- [ ] Send "draft a thank-you to oscartry" — turn streams; rail gets new row with title "draft a thank-you to oscartry"; URL updates to `?session=<uuid>` once
- [ ] Click an older session in rail — URL changes; chat panel hydrates with old turns; current row highlighted
- [ ] Click `+ new chat` — URL clears to `/home`; greeting state; composer empty; rail still shows all sessions including the one just left
- [ ] Hover a row → kebab appears → click → popover → Delete → row fades out → rail revalidates
- [ ] Delete the currently-open session → redirects to `/home` → that row no longer in rail
- [ ] Resize browser narrow (<768px) → rail collapses to hamburger → tap toggle → drawer opens → select a session → drawer closes; chat loads

**Step 4:** Note any issues in `.context/pr-c-smoke-notes.md` and fix before PR.

**Step 5:** Commit any smoke fixes.

---

## Task 26: codex review pass on the diff

**Step 1:** Run codex review against `v17-home-intuitive` (PR-C's base).
```bash
# Use the /codex review flow from the codex skill, base = v17-home-intuitive
```

**Step 2:** Address P1 findings; commit each fix atomically with `fix(home): codex M26 - <one-line>`.

---

## Task 27: Push + open draft PR

**Step 1:** Push branch.
```bash
git push -u origin v17-home-chat-history
```

**Step 2:** Open PR-C as draft, stacked on PR #18.
```bash
gh pr create --base v17-home-intuitive --draft --title "v1.7 PR-C: /home chat history sidebar" --body "$(cat <<'EOF'
## Summary
- Perplexity-style left rail on /home with chat history switching + delete
- Stacks on PR #18 (PR-B intuitiveness pass); rebase to main once #16 + #17 + #18 merge
- DB migration adds home_sessions.title (backfilled); new index for rail listing
- Auth fix: /api/home/turn now requires admin (was only auth-required)

## Test plan
- [ ] 710 + N unit tests green
- [ ] type-check clean
- [ ] Local browser smoke (per design doc §5)
- [ ] codex review pass
- [ ] Manual smoke against oscartry tenant

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

**Step 3:** Update memory.
```bash
# Add a new project memory: project_v17_pr_c_open.md per the pattern.
```

---

## Followups (out of scope)

- Search/filter the rail when session count grows
- Date grouping
- Inline rename of titles
- Cross-tab realtime via Supabase Realtime
- Mid-stream delete from another tab signaling the running route

---

## Plan complete

Save to `docs/plans/2026-05-16-pr-c-chat-history-plan.md`. Execution next.
