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
    nextUrl.pathname.startsWith("/invite");  // invitation landing pages must be reachable without a session

  const { response, user } = await updateSession(request);

  if (isAuthRoute) return response;

  if (!user) {
    const signInUrl = new URL("/auth/signin", nextUrl.origin);
    signInUrl.searchParams.set("callbackUrl", nextUrl.pathname + nextUrl.search);
    return NextResponse.redirect(signInUrl);
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
