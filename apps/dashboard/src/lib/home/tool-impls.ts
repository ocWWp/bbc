import "server-only";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

/**
 * Tool executors for the /home chat tool_use loop. Each executor takes the
 * raw tool input emitted by Anthropic, validates with zod, and returns a
 * JSON-serializable result that becomes the tool_result block in the next
 * turn.
 *
 * All queries are tenant-scoped by explicit filter; RLS also enforces this
 * server-side, but the explicit eq is defense in depth (mirrors brain-api).
 */

const SEARCH_DEFAULT_LIMIT = 8;
const SEARCH_MAX_LIMIT = 20;
const FETCH_CONTENT_MAX_CHARS = 8000;

const memorySearchInputSchema = z.object({
  query: z.string().min(1).max(500),
  kinds: z.array(z.string()).max(8).optional(),
  limit: z.number().int().min(1).max(SEARCH_MAX_LIMIT).optional(),
});

const memoryFetchInputSchema = z.object({
  id: z.string().uuid(),
});

export type MemorySearchHit = {
  id: string;
  type: string | null;
  title: string;
  updated_at: string;
};

export type MemoryFetchResult = {
  id: string;
  type: string | null;
  title: string;
  content: string;
  fields: Record<string, unknown> | null;
  updated_at: string;
};

export type ToolExecutionResult =
  | { ok: true; result: unknown }
  | { ok: false; error: string };

function escapeIlike(q: string): string {
  return q.replace(/[\\%_]/g, (c) => `\\${c}`);
}

export async function executeMemorySearch(
  supabase: SupabaseClient<Database>,
  tenantId: string,
  rawInput: unknown,
): Promise<ToolExecutionResult> {
  const parsed = memorySearchInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return {
      ok: false,
      error: `bad memory_search input: ${parsed.error.issues[0]?.message ?? "unknown"}`,
    };
  }
  const { query, kinds, limit } = parsed.data;
  const pattern = `%${escapeIlike(query)}%`;
  let qb = supabase
    .from("memory_files")
    .select("id, type, title, updated_at")
    .eq("tenant_id", tenantId)
    .eq("status", "active")
    .or(`title.ilike.${pattern},content.ilike.${pattern}`)
    .order("updated_at", { ascending: false })
    .limit(limit ?? SEARCH_DEFAULT_LIMIT);
  if (kinds && kinds.length > 0) {
    qb = qb.in("type", kinds as Database["public"]["Enums"]["memory_type"][]);
  }
  const { data, error } = await qb;
  if (error) return { ok: false, error: `memory_search failed: ${error.message}` };
  type Row = { id: string; type: string | null; title: string | null; updated_at: string };
  const hits: MemorySearchHit[] = ((data ?? []) as Row[]).map((r) => ({
    id: r.id,
    type: r.type,
    title: (r.title ?? "").trim() || "untitled",
    updated_at: r.updated_at,
  }));
  return { ok: true, result: { hits } };
}

export async function executeMemoryFetch(
  supabase: SupabaseClient<Database>,
  tenantId: string,
  rawInput: unknown,
): Promise<ToolExecutionResult> {
  const parsed = memoryFetchInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return {
      ok: false,
      error: `bad memory_fetch input: ${parsed.error.issues[0]?.message ?? "unknown"}`,
    };
  }
  const { id } = parsed.data;
  const { data, error } = await supabase
    .from("memory_files")
    .select("id, type, title, content, fields, updated_at")
    .eq("tenant_id", tenantId)
    .eq("id", id)
    .maybeSingle();
  if (error) return { ok: false, error: `memory_fetch failed: ${error.message}` };
  if (!data) return { ok: false, error: `memory not found: ${id}` };
  type Row = {
    id: string;
    type: string | null;
    title: string | null;
    content: string | null;
    fields: unknown;
    updated_at: string;
  };
  const row = data as Row;
  const content = (row.content ?? "").slice(0, FETCH_CONTENT_MAX_CHARS);
  const result: MemoryFetchResult = {
    id: row.id,
    type: row.type,
    title: (row.title ?? "").trim() || "untitled",
    content,
    fields: (row.fields ?? null) as Record<string, unknown> | null,
    updated_at: row.updated_at,
  };
  return { ok: true, result };
}

export type HomeToolExecutor = (
  name: string,
  input: unknown,
) => Promise<ToolExecutionResult>;

/**
 * Build a tool executor bound to (supabase, tenantId). PR-A ships memory_*
 * tools only; route_match and studio_compose return "not implemented" until
 * PR-B lands. The LLM-facing tools registry (toolsForIntent) does NOT
 * advertise unimplemented tools to the model, so this is just a defensive
 * fallback.
 */
export function makeHomeToolExecutor(
  supabase: SupabaseClient<Database>,
  tenantId: string,
): HomeToolExecutor {
  return async (name, input) => {
    switch (name) {
      case "memory_search":
        return executeMemorySearch(supabase, tenantId, input);
      case "memory_fetch":
        return executeMemoryFetch(supabase, tenantId, input);
      default:
        return { ok: false, error: `tool not implemented in this build: ${name}` };
    }
  };
}
