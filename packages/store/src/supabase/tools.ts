import type { SupabaseClient } from "@supabase/supabase-js";
import type { Tool, ToolsStore } from "../interfaces";

/**
 * DB-mode tool catalog.
 *
 * Reads `provider_adapters` (global seed catalog + this tenant's additions —
 * RLS filters automatically) and joins to `bindings` for `resolveRole`.
 *
 * Schema lives in migration 0027 (provider_adapters) + 0007 (bindings).
 * Tenant context comes from the authenticated Supabase client; this store
 * never accepts an explicit tenant_id — RLS is the security boundary.
 */
type ProviderRow = {
  provider_id: string;
  implements: string[] | null;
  status: string | null;
  metadata: Record<string, unknown> | null;
  tags: string[] | null;
};

type BindingRow = {
  role: string;
  provider_id: string;
};

function rowToTool(row: ProviderRow): Tool {
  const rawStatus = row.status ?? "unknown";
  const status: Tool["status"] =
    rawStatus === "active" || rawStatus === "candidate" || rawStatus === "archived"
      ? rawStatus
      : "unknown";
  const metadata: Record<string, string> = {};
  for (const [k, v] of Object.entries(row.metadata ?? {})) {
    if (typeof v === "string") metadata[k] = v;
    else if (v != null) metadata[k] = String(v);
  }
  return {
    provider_id: row.provider_id,
    implements: row.implements ?? [],
    status,
    metadata,
    tags: row.tags ?? [],
  };
}

export class SupabaseToolsStore implements ToolsStore {
  constructor(private readonly client: SupabaseClient) {}

  async list(): Promise<Tool[]> {
    const { data, error } = await this.client
      .from("provider_adapters")
      .select("provider_id, implements, status, metadata, tags")
      .order("provider_id", { ascending: true });
    if (error) throw new Error(`SupabaseToolsStore.list: ${error.message}`);
    return (data as ProviderRow[]).map(rowToTool);
  }

  async resolveRole(role: string): Promise<Tool | null> {
    const { data: bindingRows, error: bErr } = await this.client
      .from("bindings")
      .select("role, provider_id")
      .eq("role", role)
      .limit(1);
    if (bErr) throw new Error(`SupabaseToolsStore.resolveRole: ${bErr.message}`);
    const binding = (bindingRows as BindingRow[])[0];
    if (!binding || !binding.provider_id || binding.provider_id === "(unbound)") {
      return null;
    }

    const { data: providerRows, error: pErr } = await this.client
      .from("provider_adapters")
      .select("provider_id, implements, status, metadata, tags")
      .eq("provider_id", binding.provider_id)
      .limit(1);
    if (pErr) throw new Error(`SupabaseToolsStore.resolveRole: ${pErr.message}`);
    const row = (providerRows as ProviderRow[])[0];
    return row ? rowToTool(row) : null;
  }

  async candidatesFor(role: string): Promise<Tool[]> {
    const { data, error } = await this.client
      .from("provider_adapters")
      .select("provider_id, implements, status, metadata, tags")
      .contains("implements", [role])
      .neq("status", "archived")
      .order("status", { ascending: true })
      .order("provider_id", { ascending: true });
    if (error) throw new Error(`SupabaseToolsStore.candidatesFor: ${error.message}`);
    return (data as ProviderRow[]).map(rowToTool);
  }
}
