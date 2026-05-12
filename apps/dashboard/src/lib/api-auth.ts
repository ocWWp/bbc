import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

/**
 * Shared Bearer-token auth for non-session API surfaces (MCP server, REST
 * shim). The api_keys table + resolve_api_key SQL function (migrations
 * 0013 + 0031) does the verification; this helper just wraps it.
 *
 * Returns null on any failure (malformed token, no header, revoked key) so
 * callers can `if (!resolved) return 401` without leaking which failure.
 */

export type ResolvedKey = {
  tenant_id: string;
  scope: "read" | "write" | "admin";
  /**
   * Optional role binding. When set, MCP/REST reads filter memory_files to
   * the type allowlist in ROLE_MEMORY_TYPES below. Null = "all types" (the
   * pre-0031 behavior, still the default for unbound keys).
   */
  role: string | null;
};

export function adminClient(): SupabaseClient<Database> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("API auth misconfigured: missing SUPABASE_URL or SERVICE_ROLE_KEY");
  }
  return createClient<Database>(url, key, { auth: { persistSession: false } });
}

export async function resolveBearer(
  authHeader: string | null,
): Promise<ResolvedKey | null> {
  if (!authHeader) return null;
  const match = authHeader.match(/^Bearer\s+(bbc_[A-Za-z0-9_]+\.[a-f0-9]+)$/);
  if (!match) return null;
  const token = match[1];

  try {
    const supabase = adminClient();
    const { data, error } = await supabase.rpc("resolve_api_key", { p_token: token });
    if (error || !data || data.length === 0) return null;
    const row = data[0] as {
      out_tenant_id: string;
      out_scope: ResolvedKey["scope"];
      out_key_id: string;
      out_role: string | null;
    };
    return {
      tenant_id: row.out_tenant_id,
      scope: row.out_scope,
      role: row.out_role ?? null,
    };
  } catch {
    return null;
  }
}

const RANK: Record<ResolvedKey["scope"], number> = { read: 0, write: 1, admin: 2 };

export function scopeAllows(
  have: ResolvedKey["scope"],
  need: ResolvedKey["scope"],
): boolean {
  return RANK[have] >= RANK[need];
}

/**
 * Memory types each role is allowed to read/write through the MCP server +
 * REST shim. The mapping mirrors the role-tool-bundle catalog under
 * memory/ops/profiles/, but stripped to the memory-relevance dimension:
 * what types of memory does this role need to do its job?
 *
 *   marketing-writer    Copy generation: voice, glossary, product positioning,
 *                       and vendor records (so it knows which tools are
 *                       available to plug). Does NOT need decisions/team/skill.
 *
 *   engineering-reviewer Tech docs: prior decisions, vendor evaluations,
 *                       skill catalog (capability mapping), glossary. Does
 *                       NOT need voice/product (those are marketing's lane).
 *
 *   founder             Full access. The founder sees everything because
 *                       Loop 2's founder studio needs context from every
 *                       part of the brain to draft strategy docs.
 *
 *   designer            Voice + product + glossary. Designer needs brand
 *                       and product context but not engineering decisions.
 *
 *   support-writer      Customer-reply drafting: voice + product + glossary
 *                       grounds the reply; decisions cover "we don't do X"
 *                       rules; vendor lets the studio recognize integration
 *                       reports ("Stripe webhook isn't firing"). Does NOT
 *                       need team/skill/source_artifact.
 *
 * Unknown roles fall back to "all types" (same as role=null) — we'd rather
 * be permissive than break a key. The DB column is intentionally free-form
 * so new role names can ship without a migration.
 */
const ALL_MEMORY_TYPES = [
  "decision",
  "voice",
  "glossary",
  "vendor",
  "product",
  "team",
  "skill",
  "source_artifact",
  "note",
] as const;

export type MemoryType = (typeof ALL_MEMORY_TYPES)[number];

// Display order for the /api-keys create form. Keep alphabetical so the
// dropdown is predictable. The values must match the keys in
// ROLE_MEMORY_TYPES below.
export const KNOWN_API_KEY_ROLES = [
  "designer",
  "engineering-reviewer",
  "founder",
  "marketing-writer",
  "support-writer",
] as const;

export type KnownApiKeyRole = (typeof KNOWN_API_KEY_ROLES)[number];

export const ROLE_MEMORY_TYPES: Record<string, ReadonlySet<MemoryType>> = {
  "marketing-writer": new Set<MemoryType>(["voice", "glossary", "product", "vendor", "note"]),
  "engineering-reviewer": new Set<MemoryType>([
    "decision",
    "vendor",
    "skill",
    "glossary",
    "team",
    "note",
  ]),
  "founder": new Set<MemoryType>([...ALL_MEMORY_TYPES]),
  "designer": new Set<MemoryType>(["voice", "product", "glossary", "note"]),
  "support-writer": new Set<MemoryType>([
    "voice",
    "product",
    "glossary",
    "vendor",
    "decision",
    "note",
  ]),
};

/**
 * Returns the set of memory types this key is allowed to read/write, or null
 * if the key has no role (= all types allowed, current behavior).
 *
 * Unknown role strings return null (permissive fallback). Callers should
 * treat null as "no filter" and apply no .in() clause.
 */
export function allowedTypesForRole(role: string | null): ReadonlySet<MemoryType> | null {
  if (!role) return null;
  const set = ROLE_MEMORY_TYPES[role];
  return set ?? null;
}
