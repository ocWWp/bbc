"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "./database.types";
import { stubSupabaseClient } from "./stub";

export function getSupabaseBrowserClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    if (process.env.NODE_ENV !== "production") {
      // Dev escape hatch (mirrors Phase G.24 server-side fix): boot without
      // env vars so chrome (theme, palette, marketing pages) renders.
      // Any real auth/query call returns empty as if signed out.
      return stubSupabaseClient as ReturnType<typeof createBrowserClient<Database>>;
    }
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
  }
  return createBrowserClient<Database>(url, key);
}
