import "server-only";
import { LocalStore, SupabaseStore, type Store } from "@bbc/store";
import { bbcRepoRoot } from "@/lib/bbc-paths";
import { getSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Get the BBC storage backend for the current request.
 *
 * BBC_MODE=file → LocalStore (filesystem; single-tenant; default).
 * BBC_MODE=db   → SupabaseStore (Postgres; multi-tenant; RLS-gated).
 *
 * Lives outside the dashboard component tree because it needs cookies
 * for the Supabase client when in DB-mode.
 */
export async function getStore(): Promise<Store> {
  const mode = (process.env.BBC_MODE ?? "file").toLowerCase();
  if (mode === "db") {
    const client = await getSupabaseServerClient();
    return new SupabaseStore(client);
  }
  return new LocalStore(bbcRepoRoot());
}
