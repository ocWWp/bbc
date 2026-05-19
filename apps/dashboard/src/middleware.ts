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
    nextUrl.pathname.startsWith("/api/spike-v16") ||  // v1.6 M1.2 SSE spike: no auth so we can curl it; deleted after M2
    nextUrl.pathname.startsWith("/invite") ||  // invitation landing pages must be reachable without a session
    nextUrl.pathname.startsWith("/landing") || // public marketing page
    nextUrl.pathname.startsWith("/about") ||   // public trust-model disclosure (/about/security et al.)
    nextUrl.pathname === "/privacy" ||         // legal — linked from /auth/signin footer
    nextUrl.pathname === "/terms";             // legal — linked from /auth/signin footer

  const { response, user } = await updateSession(request);

  if (isAuthRoute) return response;

  // Supabase-not-configured escape hatch retained below in case a self-hoster
  // is browsing without env wired up. Public legal/disclosure pages are now
  // gated only by the allowlist above — they don't depend on this branch.
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
