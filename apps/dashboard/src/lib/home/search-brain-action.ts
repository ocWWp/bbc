"use server";

// searchBrain: deterministic supertag-less brain lookup for the /home chat-home
// "Ask brain" intent. NO LLM, NO synthesis — keyword ilike against
// memory_files.title + memory_files.content, RLS-gated to the actor's tenant.
// Returns source-backed hits the user clicks through to inspect themselves.
//
// Rationale: ADR-0006 (no vector retrieval) + Phase P "Trust Made Visible"
// theme. Synthesizing a fluent answer from incomplete memory is a citation-
// liability risk we are not taking on in this phase. See the codex consult on
// 2026-05-15 for the read-vs-make split rationale.

import { requireActor } from "@/lib/auth/require-user";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { searchMemories } from "@/lib/brain-api";

export type BrainHit = {
  id: string;
  type: string | null;
  title: string;
  updated_at: string;
};

export type SearchBrainResult =
  | { ok: true; hits: ReadonlyArray<BrainHit> }
  | { ok: false; error: string };

const MAX_QUERY_LEN = 500;
const MIN_QUERY_LEN = 2;
const HITS_LIMIT = 8;

const rateLimits = new Map<string, number[]>();
function rateLimited(userId: string): boolean {
  const now = Date.now();
  const window = 60_000;
  const max = 20;
  const arr = (rateLimits.get(userId) ?? []).filter((t) => now - t < window);
  if (arr.length >= max) {
    rateLimits.set(userId, arr);
    return true;
  }
  arr.push(now);
  rateLimits.set(userId, arr);
  return false;
}

export async function searchBrain(query: string): Promise<SearchBrainResult> {
  const a = await requireActor();
  if (!a.ok) return { ok: false, error: "not signed in" };

  if (rateLimited(a.actor.user_id)) {
    return { ok: false, error: "Too many searches. Wait a minute and try again." };
  }

  const q = (query ?? "").trim();
  if (q.length < MIN_QUERY_LEN) {
    return { ok: false, error: "Type a few more characters." };
  }
  if (q.length > MAX_QUERY_LEN) {
    return { ok: false, error: `Query too long (max ${MAX_QUERY_LEN} chars).` };
  }

  const supabase = await getSupabaseServerClient();
  try {
    const hits = await searchMemories(supabase, a.actor.tenant_id, {
      query: q,
      limit: HITS_LIMIT,
    });
    return { ok: true, hits };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: msg };
  }
}
