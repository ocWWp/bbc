import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "./database.types";

/**
 * Refresh the Supabase session cookie on every request and return the
 * NextResponse with up-to-date Set-Cookie headers, plus the resolved user.
 *
 * Always call this from the project's middleware.ts so JWT rotation works.
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    // Dev escape hatch: no Supabase configured. Skip session refresh; caller
    // should also skip the auth redirect. Lets `pnpm dev` boot without env vars.
    return { response: supabaseResponse, user: null };
  }

  const supabase = createServerClient<Database>(
    url,
    key,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          supabaseResponse = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            supabaseResponse.cookies.set(name, value, options);
          }
          // @supabase/ssr ≥0.10 passes Cache-Control: private, no-store et al.
          // alongside auth cookies — apply them so a CDN can't cache the
          // response and serve one user's session to another.
          for (const [name, value] of Object.entries(headers)) {
            supabaseResponse.headers.set(name, value);
          }
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  return { response: supabaseResponse, user };
}
