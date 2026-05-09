import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Server-side Supabase client used for auth and tenant-scoped queries.
 * Created with the service-role key so it bypasses RLS at the connection
 * layer; tenant scoping is enforced explicitly in every query (and via
 * the RPC functions when called).
 */
function adminClient(): SupabaseClient {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) throw new Error("SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL required");
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY required");
  return createClient(url, key, { auth: { persistSession: false } });
}

export type ApiKeyScope = "read" | "write" | "admin";

export type AuthContext = {
  tenant_id: string;
  scope: ApiKeyScope;
  key_id: string;
  /** Stable actor string for operations_log writes. */
  actor: string;
};

/**
 * Resolve a presented bearer token (format `bbc_<key_id>.<secret>`) to a
 * tenant + scope. Validates against the api_keys table via the
 * resolve_api_key SQL function.
 */
export async function authenticate(token: string | undefined): Promise<AuthContext> {
  if (!token) throw new Error("missing Authorization header");
  const sb = adminClient();
  const { data, error } = await sb.rpc("resolve_api_key", { p_token: token });
  if (error) throw new Error(`unauthorized: ${error.message}`);
  if (!data || (Array.isArray(data) && data.length === 0)) {
    throw new Error("unauthorized: invalid token");
  }
  const row = Array.isArray(data) ? data[0] : data;
  return {
    tenant_id: row.out_tenant_id,
    scope: row.out_scope,
    key_id: row.out_key_id,
    actor: `agent:${row.out_key_id}`,
  };
}

/** Produces a service-role client scoped to a tenant via explicit filter. */
export function tenantScopedClient(tenant_id: string): SupabaseClient {
  // The service-role client bypasses RLS, so tenant filtering is the
  // caller's responsibility. Helper functions in this server always
  // .eq("tenant_id", ctx.tenant_id) on every query.
  void tenant_id;
  return adminClient();
}
