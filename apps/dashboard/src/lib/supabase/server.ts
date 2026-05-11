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
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Called from a Server Component — cookie writes are forbidden there.
            // The middleware refresh path handles session-cookie rotation, so this is safe to swallow.
          }
        },
      },
    },
  );
}
