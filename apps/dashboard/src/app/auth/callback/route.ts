import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") ?? "/";
  const safeNext = next.startsWith("/") ? next : "/";

  if (!code) {
    return NextResponse.redirect(new URL("/auth/signin?error=callback_error", url.origin));
  }

  const supabase = await getSupabaseServerClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    const reason = /not_invited/i.test(error.message) ? "not_invited" : "callback_error";
    return NextResponse.redirect(new URL(`/auth/signin?error=${reason}`, url.origin));
  }

  return NextResponse.redirect(new URL(safeNext, url.origin));
}
