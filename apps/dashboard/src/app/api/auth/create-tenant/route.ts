import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { getSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Logged-in user creates an additional tenant. They become its admin via
 * create_tenant_with_seed (Phase 4 SQL fn). Their existing tenants stay
 * untouched.
 *
 * Differs from /api/auth/self-serve-signup:
 *   - signup endpoint: not logged in → creates user + tenant atomically
 *   - this endpoint:   logged in     → just creates the tenant
 */

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Server misconfigured: SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY required");
  return createClient<Database>(url, key, { auth: { persistSession: false } });
}

function deriveSlug(seed: string): string {
  const s = seed.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  if (s.length >= 3 && /^[a-z]/.test(s)) return s.slice(0, 60);
  return `team-${Math.random().toString(36).slice(2, 8)}-bbc`;
}

export async function POST(req: NextRequest) {
  if (process.env.BBC_SIGNUP_MODE !== "open") {
    return NextResponse.json(
      { error: "Tenant creation is disabled on this BBC instance." },
      { status: 403 },
    );
  }

  // Require auth: user must be logged in.
  const userClient = await getSupabaseServerClient();
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  }

  let body: { tenant_name?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const tenantName = String(body.tenant_name ?? "").trim();
  if (!tenantName || tenantName.length < 2) {
    return NextResponse.json({ error: "Tenant name required (min 2 chars)." }, { status: 400 });
  }

  const slug = deriveSlug(tenantName);
  const sb = adminClient();

  // Try the slug; if it collides, append a short suffix and retry once.
  for (const candidateSlug of [slug, `${slug}-${Math.random().toString(36).slice(2, 6)}`]) {
    const { data, error } = await sb.rpc("create_tenant_with_seed", {
      p_slug: candidateSlug,
      p_name: tenantName,
      p_owner_user_id: user.id,
    });
    if (!error) {
      return NextResponse.json({
        ok: true,
        tenant_id: data,
        tenant_slug: candidateSlug,
        next: "/team",
        message: `Tenant '${tenantName}' created. Redirecting…`,
      });
    }
    // Slug collision retry
    if (error.message?.includes("duplicate") || error.message?.includes("unique")) continue;
    return NextResponse.json({ error: `Tenant creation failed: ${error.message}` }, { status: 400 });
  }

  return NextResponse.json({ error: "Slug collision; please retry with a different name." }, { status: 409 });
}
