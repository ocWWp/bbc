import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

/**
 * Protect every route except /auth/* and /api/auth/* and Next-internal paths.
 * Unauthenticated requests redirect to /auth/signin?callbackUrl=<original>.
 */
export async function middleware(request: NextRequest) {
  const { nextUrl } = request;
  const isAuthRoute =
    nextUrl.pathname.startsWith("/auth") ||
    nextUrl.pathname.startsWith("/api/auth") ||
    nextUrl.pathname.startsWith("/api/mcp") ||  // MCP server: authenticates via Bearer api-key, not session
    nextUrl.pathname.startsWith("/api/v1") ||   // REST brain API: same Bearer api-key auth
    nextUrl.pathname.startsWith("/invite") ||  // invitation landing pages must be reachable without a session
    nextUrl.pathname.startsWith("/landing");   // public marketing page

  const { response, user } = await updateSession(request);

  if (isAuthRoute) return response;

  // Dev escape hatch: when Supabase env vars aren't set, skip the auth redirect
  // so Phase G's public chrome (theme, /terms, /privacy, cookie banner) is browsable.
  const supabaseConfigured = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL);

  if (!user && supabaseConfigured) {
    const signInUrl = new URL("/auth/signin", nextUrl.origin);
    signInUrl.searchParams.set("callbackUrl", nextUrl.pathname + nextUrl.search);
    return NextResponse.redirect(signInUrl);
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
