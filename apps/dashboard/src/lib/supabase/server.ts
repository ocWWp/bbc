import "server-only";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "./database.types";
import { stubSupabaseClient } from "./stub";

export async function getSupabaseServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    // Dev escape hatch: no Supabase configured — return a stub so Server
    // Components that only need user/profile reads can render without crashing.
    return stubSupabaseClient;
  }
  const cookieStore = await cookies();
  return createServerClient<Database>(
    url,
    key,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet, _headers) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Called from a Server Component — cookie writes are forbidden there.
            // The middleware refresh path handles session-cookie rotation, so this is safe to swallow.
          }
          // _headers (Cache-Control: private, no-store et al. from @supabase/ssr ≥0.10)
          // cannot be applied here — Server Components have no response handle, and
          // route handlers build their own NextResponse downstream. The middleware
          // setAll covers the same request's response, which is sufficient.
        },
      },
    },
  );
}

/**
 * Service-role Supabase client. Bypasses RLS. ONLY callable from server actions,
 * route handlers, or server components — never client code. The `server-only`
 * import at the top of this file enforces that at build time.
 *
 * Use for writes where the calling user differs from the row owner — e.g.
 * inbox notifications written to a teammate from an admin resolution, or
 * background workers that operate on behalf of a tenant.
 *
 * Throws if either SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing — those
 * env vars are required in any deployment that writes cross-user state. See
 * apps/dashboard/CLAUDE.md "Env vars".
 */
export function getSupabaseServiceClient() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "getSupabaseServiceClient: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required",
    );
  }
  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
