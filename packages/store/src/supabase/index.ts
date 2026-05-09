import type { SupabaseClient } from "@supabase/supabase-js";
import type { Store } from "../interfaces";
import { SupabaseQueueStore } from "./queue";
import { SupabaseLogStore } from "./log";
import { SupabaseBindingsStore } from "./bindings";

/**
 * DB-mode store. Multi-tenant; relies on the caller passing an authenticated
 * Supabase client whose JWT context resolves to a tenant member. RLS does
 * the rest (auth_tenant()-keyed policies on every table).
 */
export class SupabaseStore implements Store {
  readonly queue: SupabaseQueueStore;
  readonly log: SupabaseLogStore;
  readonly bindings: SupabaseBindingsStore;

  constructor(client: SupabaseClient) {
    this.queue = new SupabaseQueueStore(client);
    this.log = new SupabaseLogStore(client);
    this.bindings = new SupabaseBindingsStore(client);
  }
}

export { SupabaseQueueStore } from "./queue";
export { SupabaseLogStore } from "./log";
export { SupabaseBindingsStore } from "./bindings";
