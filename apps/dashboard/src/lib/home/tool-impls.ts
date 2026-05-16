import "server-only";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { ROLE_SHAPES } from "@/lib/studio/role-shapes";
import { STUDIO_ROLES, type StudioRole } from "@/lib/studio/template-id";

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
    .eq("status", "active")
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

// ----------------------------------------------------------------------------
// route_match — deterministic lookup that maps a navigation phrase to a known
// route. No LLM call, no DB; just an alias table over the routes we actually
// ship. Per [[feedback-no-placeholders]], unknown phrases return a null route
// rather than hallucinating one — the LLM is told to say "I'm not sure where
// that lives" in that case.
// ----------------------------------------------------------------------------

const routeMatchInputSchema = z.object({
  query: z.string().min(1).max(200),
});

type RouteEntry = {
  route: string;
  label: string;
  aliases: readonly string[];
};

const KNOWN_ROUTES: readonly RouteEntry[] = Object.freeze([
  { route: "/home", label: "Home", aliases: ["home", "ask bbc", "chat"] },
  { route: "/memory", label: "Memory", aliases: ["memory", "memories", "memory list", "all memories"] },
  { route: "/memory/new", label: "New memory", aliases: ["new memory", "create memory", "add memory"] },
  { route: "/brain", label: "Brain", aliases: ["brain", "voice", "decisions", "glossary", "the brain"] },
  { route: "/queue", label: "Queue", aliases: ["queue", "proposals", "queued proposals", "pending proposals", "review queue"] },
  { route: "/inbox", label: "Inbox", aliases: ["inbox"] },
  { route: "/sources", label: "Sources", aliases: ["sources", "ingest sources", "connectors"] },
  { route: "/library", label: "Library", aliases: ["library", "skills library"] },
  { route: "/marketplace", label: "Marketplace", aliases: ["marketplace"] },
  { route: "/settings", label: "Settings", aliases: ["settings"] },
  { route: "/settings/keys", label: "API keys (BYOK)", aliases: ["api keys", "byok keys", "anthropic key", "openai key", "provider keys", "llm keys", "keys"] },
  { route: "/settings/api-keys", label: "Outbound API keys", aliases: ["outbound api keys", "service api keys", "mcp keys"] },
  { route: "/settings/team", label: "Team", aliases: ["team", "invite", "invites", "members", "people in workspace"] },
  { route: "/settings/observers", label: "Observers", aliases: ["observers", "watches", "signals", "observer signals", "watch list"] },
  { route: "/settings/tools", label: "Tools", aliases: ["tools", "tool settings"] },
  { route: "/settings/skills", label: "Skills", aliases: ["skills", "installed skills"] },
  { route: "/settings/bindings", label: "Bindings", aliases: ["bindings", "tool bindings"] },
  { route: "/settings/log", label: "Audit log", aliases: ["audit log", "activity log", "log", "audit"] },
  { route: "/studio", label: "Studio", aliases: ["studio", "studios", "all studios"] },
  { route: "/studio/marketing", label: "Marketing Studio", aliases: ["marketing studio", "marketing"] },
  { route: "/studio/engineering", label: "Engineering Studio", aliases: ["engineering studio", "engineering", "eng studio"] },
  { route: "/studio/founder", label: "Founder Studio", aliases: ["founder studio", "founder"] },
  { route: "/studio/designer", label: "Designer Studio", aliases: ["designer studio", "designer", "design studio"] },
  { route: "/studio/support", label: "Support Studio", aliases: ["support studio", "support"] },
  { route: "/studio/finance", label: "Finance Studio", aliases: ["finance studio", "finance"] },
  { route: "/studio/legal", label: "Legal Studio", aliases: ["legal studio", "legal"] },
  { route: "/studio/hr", label: "People Studio", aliases: ["people studio", "hr studio", "hr", "people"] },
]);

/** Score how well `q` (lowercased) matches `phrase` (lowercased). */
function aliasScore(q: string, phrase: string): number {
  if (q === phrase) return 100;
  if (q.includes(phrase)) {
    // Reward longer phrase matches more — "marketing studio" beats "studio".
    return 40 + Math.min(40, phrase.length);
  }
  if (phrase.includes(q) && q.length >= 4) return 35;
  return 0;
}

/**
 * Bonus that prefers more specific routes when alias scores tie. Without
 * this, "team settings" scores `settings` (8 chars) higher than `team`
 * (4 chars) and routes to `/settings` instead of `/settings/team`. Depth
 * is (slash count − 1), so /settings = 1 and /settings/team = 2.
 */
function routeDepthBonus(route: string): number {
  const segments = (route.match(/\//g) ?? []).length;
  return Math.max(0, segments - 1) * 5;
}

export type RouteMatchResult = {
  route: string;
  label: string;
} | {
  route: null;
  hint: string;
};

export function matchRoute(rawQuery: string): RouteMatchResult {
  const q = rawQuery.trim().toLowerCase();
  if (!q) return { route: null, hint: "empty query" };
  let best: { entry: RouteEntry; score: number } | null = null;
  for (const entry of KNOWN_ROUTES) {
    const bonus = routeDepthBonus(entry.route);
    for (const alias of entry.aliases) {
      const raw = aliasScore(q, alias.toLowerCase());
      if (raw === 0) continue;
      const s = raw + bonus;
      if (!best || s > best.score) best = { entry, score: s };
    }
  }
  if (!best || best.score < 30) {
    return { route: null, hint: `no known route matches "${rawQuery}"` };
  }
  return { route: best.entry.route, label: best.entry.label };
}

export async function executeRouteMatch(
  rawInput: unknown,
): Promise<ToolExecutionResult> {
  const parsed = routeMatchInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return {
      ok: false,
      error: `bad route_match input: ${parsed.error.issues[0]?.message ?? "unknown"}`,
    };
  }
  return { ok: true, result: matchRoute(parsed.data.query) };
}

// ----------------------------------------------------------------------------
// studio_compose — validates role + template against the curated menu in
// ROLE_SHAPES and returns a deep link the user can click to land on the
// matching Studio. PR-B does not invoke runWorkflow inline: the Studio owns
// the heavyweight action (auth, rate limits, 4096-token generation, writeback
// emitters, pending_review canvas). /home's job is to route precisely.
//
// `inputs` is accepted by the schema but not yet consumed — Studio-side
// prefill from query params is v1.7-M-future. Today the user clicks through
// to the Studio, sees the named template highlighted in chat, types the task,
// and clicks Run.
// ----------------------------------------------------------------------------

const studioComposeInputSchema = z.object({
  role: z.string().min(1).max(40),
  template: z.string().min(1).max(80),
  inputs: z.record(z.string(), z.unknown()).optional(),
});

export type StudioComposeResult = {
  url: string;
  role: StudioRole;
  roleLabel: string;
  templateSlug: string;
  templateLabel: string;
  hint?: string;
};

export type StudioMenuRole = {
  role: StudioRole;
  roleLabel: string;
  templates: Array<{ slug: string; label: string; id: string }>;
};

/** Curated menu exposed to the LLM so it can only call studio_compose with valid pairs. */
export function listStudioMenu(): readonly StudioMenuRole[] {
  return STUDIO_ROLES.map((role) => ({
    role,
    roleLabel: ROLE_SHAPES[role].label,
    templates: ROLE_SHAPES[role].defaultChips.map((c) => ({
      slug: c.templateSlug,
      label: c.label,
      id: c.id,
    })),
  }));
}

export async function executeStudioCompose(
  rawInput: unknown,
): Promise<ToolExecutionResult> {
  const parsed = studioComposeInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return {
      ok: false,
      error: `bad studio_compose input: ${parsed.error.issues[0]?.message ?? "unknown"}`,
    };
  }
  const { role: rawRole, template: rawTemplate } = parsed.data;
  if (!(STUDIO_ROLES as readonly string[]).includes(rawRole)) {
    return {
      ok: false,
      error: `unknown studio role: "${rawRole}" — valid roles: ${STUDIO_ROLES.join(", ")}`,
    };
  }
  const role = rawRole as StudioRole;
  const shape = ROLE_SHAPES[role];
  // Accept either the chip id ("tweet") or the full templateSlug ("marketing:tweet-thread").
  const chip = shape.defaultChips.find(
    (c) => c.templateSlug === rawTemplate || c.id === rawTemplate,
  );
  if (!chip) {
    const available = shape.defaultChips
      .map((c) => `${c.id} (${c.templateSlug})`)
      .join(", ");
    return {
      ok: false,
      error: `no "${rawTemplate}" template in ${shape.label}. Available: ${available}`,
    };
  }
  const result: StudioComposeResult = {
    url: `/studio/${role}`,
    role,
    roleLabel: shape.label,
    templateSlug: chip.templateSlug,
    templateLabel: chip.label,
  };
  return { ok: true, result };
}

export type HomeToolExecutor = (
  name: string,
  input: unknown,
) => Promise<ToolExecutionResult>;

/**
 * Build a tool executor bound to (supabase, tenantId). PR-B ships
 * route_match + studio_compose as deterministic helpers — no LLM, no DB
 * mutations — so /home can honestly answer navigate and draft intents.
 * observer_* tools still return "not implemented" and are filtered out of
 * the LLM-facing tool list by SHIPPED_TOOL_NAMES in real-invoke.ts.
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
      case "route_match":
        return executeRouteMatch(input);
      case "studio_compose":
        return executeStudioCompose(input);
      default:
        return { ok: false, error: `tool not implemented in this build: ${name}` };
    }
  };
}
