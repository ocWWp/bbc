import "server-only";

import type { Json } from "@/lib/supabase/database.types";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export type TurnRole = "user" | "agent";
export type TurnStatus = "in_progress" | "completed" | "aborted" | "failed";

export type HomeSession = {
  id: string;
  tenant_id: string;
  user_id: string;
  started_at: string;
  last_activity_at: string;
  archived_at: string | null;
};

export type HomeTurn = {
  id: string;
  session_id: string;
  role: TurnRole;
  status: TurnStatus;
  content_jsonb: Json;
  created_at: string;
  finalized_at: string | null;
};

/**
 * Returns the user's active /home session, creating one if none exists.
 * "Active" = archived_at IS NULL. There's at most one active session per
 * (tenant_id, user_id) by convention; if multiple exist, we return the most
 * recent and archive the older ones in a follow-up cleanup (not on read).
 */
export async function getOrCreateActiveSession(
  tenantId: string,
  userId: string,
): Promise<HomeSession> {
  const supabase = await getSupabaseServerClient();

  const { data: existing, error: readErr } = await supabase
    .from("home_sessions")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("user_id", userId)
    .is("archived_at", null)
    .order("last_activity_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (readErr) throw new Error(`home_sessions read failed: ${readErr.message}`);
  if (existing) return existing as HomeSession;

  const { data: inserted, error: insErr } = await supabase
    .from("home_sessions")
    .insert({ tenant_id: tenantId, user_id: userId })
    .select("*")
    .single();

  if (insErr || !inserted) {
    throw new Error(`home_sessions insert failed: ${insErr?.message ?? "no row"}`);
  }
  return inserted as HomeSession;
}

export async function archiveSession(sessionId: string): Promise<void> {
  const supabase = await getSupabaseServerClient();
  const { error } = await supabase
    .from("home_sessions")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", sessionId);
  if (error) throw new Error(`home_sessions archive failed: ${error.message}`);
}

export async function appendTurn(
  sessionId: string,
  role: TurnRole,
  content: Json,
  status: TurnStatus = "completed",
): Promise<HomeTurn> {
  const supabase = await getSupabaseServerClient();
  const finalized = status === "in_progress" ? null : new Date().toISOString();
  const { data, error } = await supabase
    .from("home_turns")
    .insert({
      session_id: sessionId,
      role,
      status,
      content_jsonb: content,
      finalized_at: finalized,
    })
    .select("*")
    .single();
  if (error || !data) {
    throw new Error(`home_turns insert failed: ${error?.message ?? "no row"}`);
  }
  // Bump session.last_activity_at so the active-session lookup is ordered
  // by recent activity, not just session-start time.
  await supabase
    .from("home_sessions")
    .update({ last_activity_at: new Date().toISOString() })
    .eq("id", sessionId);
  return data as HomeTurn;
}

export async function finalizeTurn(
  turnId: string,
  content: Json,
  status: Exclude<TurnStatus, "in_progress">,
): Promise<void> {
  const supabase = await getSupabaseServerClient();
  const { error } = await supabase
    .from("home_turns")
    .update({
      content_jsonb: content,
      status,
      finalized_at: new Date().toISOString(),
    })
    .eq("id", turnId);
  if (error) throw new Error(`home_turns finalize failed: ${error.message}`);
}

export async function getActiveSessionWithTurns(
  tenantId: string,
  userId: string,
  limit = 50,
): Promise<{ session: HomeSession; turns: HomeTurn[] } | null> {
  const supabase = await getSupabaseServerClient();
  const { data: session, error: sErr } = await supabase
    .from("home_sessions")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("user_id", userId)
    .is("archived_at", null)
    .order("last_activity_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (sErr) throw new Error(`home_sessions read failed: ${sErr.message}`);
  if (!session) return null;

  const { data: turns, error: tErr } = await supabase
    .from("home_turns")
    .select("*")
    .eq("session_id", session.id)
    .order("created_at", { ascending: true })
    .limit(limit);

  if (tErr) throw new Error(`home_turns read failed: ${tErr.message}`);
  const all = (turns ?? []) as HomeTurn[];
  return { session: session as HomeSession, turns: all.filter(isNotStubTurn) };
}

// v1.6 shipped a stub /home backend that wrote canned assistant responses
// directly to home_turns. v1.7 replaced the stub with a real Anthropic loop,
// but tenants who used v1.6 still have those stub rows mixed with real Sonnet
// replies in their session history. This filter drops the v1.6 stub turns
// at read time so the chat reads clean without a data migration.
// See [[project-v17-home-real-plan]] cleanup note for the corresponding SQL
// that operators can run for a hard delete.
const STUB_PATTERNS: ReadonlyArray<RegExp> = [
  /\(Stub response — real LLM lands in M3\.\)/,
  /^hey! what(?:'s up — what)? are you working on\?$/,
  /^what's up\?$/,
  /^Tell me a little more — what are you trying to do\?$/,
  // v1.6 stub navigate/draft/watch/meta canned responses (see git history of
  // apps/dashboard/src/app/api/home/turn/route.ts).
  /^You can open that from the left nav\. Want me to take you there\?$/,
  /^Drafting now — give me one second\.$/,
  /^I'll watch for it and surface anything that shows up\.$/,
  /^That's a settings\/memory question — opening the right place\.$/,
];

function turnTextBlob(turn: HomeTurn): string {
  // content_jsonb is an object shaped like { text: string, toolCalls?, citations? }
  // per turnToVm() in apps/dashboard/src/app/home/page.tsx.
  const c = turn.content_jsonb;
  if (!c || typeof c !== "object" || Array.isArray(c)) return "";
  const text = (c as Record<string, unknown>).text;
  return typeof text === "string" ? text.trim() : "";
}

export function isNotStubTurn(turn: HomeTurn): boolean {
  if (turn.role !== "agent") return true;
  const text = turnTextBlob(turn);
  if (!text) return true;
  return !STUB_PATTERNS.some((re) => re.test(text));
}

/**
 * Soft-deletes a session by setting `archived_at` to now, gated on
 * (tenant_id, user_id) plus an `archived_at IS NULL` predicate so the
 * caller can never archive someone else's row and can never double-archive.
 * Throws when 0 rows match (foreign tenant, not-found, or already archived).
 */
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

/**
 * Lite shape returned by `listSessions`. Used by the chat-history rail —
 * we deliberately don't ship full HomeSession rows because the rail only
 * renders the id, the title, and the recency timestamp.
 */
export type SessionRailItem = {
  id: string;
  title: string;
  last_activity_at: string;
};

/**
 * Returns every non-archived session for (tenant, user) in reverse-chron
 * order, with a `(empty)` fallback for null titles. Cheap rail-side query:
 * uses the `home_sessions_user_recent` index and only selects three columns.
 * The COALESCE happens in TS — supabase-js `.select()` doesn't accept raw
 * SQL expressions.
 */
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
  return ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
    id: r.id as string,
    title: (r.title as string | null) ?? "(empty)",
    last_activity_at: r.last_activity_at as string,
  }));
}

/**
 * Reads a session by id, strictly gated on (tenant_id, user_id, not-archived).
 * Returns null when not found, foreign-tenant, or archived — no error.
 *
 * Replaces `getActiveSessionWithTurns` (PR-C M4): the rail picks an explicit
 * sessionId from the URL, so the read needs to be by-id rather than "the most
 * recent active one". Applies the same `isNotStubTurn` filter to returned
 * turns to hide v1.6 stub replies that still live in some tenants' history.
 */
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
  if (sErr) throw new Error(`getSessionWithTurns read failed: ${sErr.message}`);
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

/**
 * Returns the user's most recent non-archived session, or null if none.
 *
 * Read-only counterpart to `createSession` — callers decide whether to
 * create a new session or land on the most recent one. This replaces the
 * "find-or-create" behaviour of `getOrCreateActiveSession`; the chat
 * history rail (PR-C) wants explicit per-session navigation.
 */
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
  return (data as HomeSession | null) ?? null;
}

/**
 * Creates a fresh /home session for the given (tenant, user). Caller is
 * responsible for deciding when a new session should exist (e.g. "+ New
 * chat" click or no current sessionId on first message).
 */
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

/**
 * Derive a short, human-readable session title from the first user message.
 * Used by the rail (PR-C) and the title-on-first-turn write path. Pure —
 * no DB. Collapses whitespace, trims, caps at ~40 chars, prefers word
 * boundaries, falls back to `(empty)` for blank input.
 */
export function deriveTitle(text: string): string {
  const collapsed = text.replace(/\s+/g, " ").trim();
  if (collapsed.length === 0) return "(empty)";
  if (collapsed.length <= 40) return collapsed;
  const slice = collapsed.slice(0, 40);
  const lastSpace = slice.lastIndexOf(" ");
  if (lastSpace >= 20) {
    return slice.slice(0, lastSpace) + "...";
  }
  return slice + "...";
}
