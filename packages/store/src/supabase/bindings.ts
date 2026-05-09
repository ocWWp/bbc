import type { SupabaseClient } from "@supabase/supabase-js";
import type { Binding, BindingsStore } from "../interfaces";

type BindingRow = {
  role: string;
  provider_id: string;
  provisional: boolean;
  bound_at: string;
  notes: string | null;
};

function rowToBinding(row: BindingRow): Binding {
  let provider: string;
  let kind: Binding["kind"];
  if (!row.provider_id || row.provider_id === "(unbound)") {
    provider = "(unbound)";
    kind = "unbound";
  } else {
    provider = row.provider_id;
    kind = row.provisional ? "provisional" : "active";
  }
  return {
    role: row.role,
    provider,
    bound_at: row.bound_at,
    notes: row.notes ?? "",
    provisional: row.provisional,
    kind,
  };
}

export class SupabaseBindingsStore implements BindingsStore {
  constructor(private readonly client: SupabaseClient) {}

  async list(): Promise<Binding[]> {
    const { data, error } = await this.client
      .from("bindings")
      .select("role,provider_id,provisional,bound_at,notes")
      .order("role", { ascending: true });
    if (error) throw new Error(`SupabaseBindingsStore.list: ${error.message}`);
    return (data as BindingRow[]).map(rowToBinding);
  }
}
