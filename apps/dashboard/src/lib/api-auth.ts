import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

/**
 * Shared Bearer-token auth for non-session API surfaces (MCP server, REST
 * shim). The api_keys table + resolve_api_key SQL function (migration 0013)
 * does the verification; this helper just wraps it.
 *
 * Returns null on any failure (malformed token, no header, revoked key) so
 * callers can `if (!resolved) return 401` without leaking which failure.
 */

export type ResolvedKey = {
  tenant_id: string;
  scope: "read" | "write" | "admin";
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
    };
    return { tenant_id: row.out_tenant_id, scope: row.out_scope };
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
