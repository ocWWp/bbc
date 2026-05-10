import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

/**
 * Self-service signup: creates a tenant + admin invitation for the email,
 * then signs the user up via Supabase Auth admin API. The signup triggers
 * see the pre-existing invitation and accept the user as admin of the new
 * tenant.
 *
 * Gated by BBC_SIGNUP_MODE env var. Default: invite_only (rejects).
 * Set BBC_SIGNUP_MODE=open in apps/dashboard/.env.local to allow.
 *
 * In invite_only mode, this endpoint returns 403 — the signup flow on
 * /auth/signin (which calls supabase.auth.signUp directly) still works
 * for users with pre-existing invitations.
 */

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) throw new Error("NEXT_PUBLIC_SUPABASE_URL required");
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY required (server-only)");
  return createClient<Database>(url, key, { auth: { persistSession: false } });
}

function deriveSlug(email: string, tenantName: string): string {
  // Prefer a slug derived from the tenant name; fall back to the email local-part.
  const fromName = tenantName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (fromName.length >= 3 && /^[a-z]/.test(fromName)) {
    return fromName.slice(0, 60);
  }
  const local = email.split("@")[0]?.toLowerCase().replace(/[^a-z0-9-]+/g, "-") ?? "";
  const candidate = `${local || "team"}-bbc`;
  return candidate.slice(0, 60);
}

export async function POST(req: NextRequest) {
  const mode = (process.env.BBC_SIGNUP_MODE ?? "invite_only").toLowerCase();
  if (mode !== "open") {
    return NextResponse.json(
      { error: "Self-service signup is disabled on this BBC instance. Ask an admin for an invitation." },
      { status: 403 },
    );
  }

  let body: { email?: string; password?: string; tenant_name?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");
  const tenantName = String(body.tenant_name ?? "").trim();

  if (!email || !/^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(email)) {
    return NextResponse.json({ error: "Valid email required." }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json({ error: "Password must be at least 8 characters." }, { status: 400 });
  }
  if (!tenantName || tenantName.length < 2) {
    return NextResponse.json({ error: "Tenant name required." }, { status: 400 });
  }

  const sb = adminClient();
  const slug = deriveSlug(email, tenantName);

  // Step 1: Set up the tenant + invitation atomically.
  const { error: setupErr } = await sb.rpc("setup_self_serve_tenant", {
    p_email: email,
    p_slug: slug,
    p_name: tenantName,
  });
  if (setupErr) {
    return NextResponse.json(
      { error: `Tenant setup failed: ${setupErr.message}` },
      { status: 400 },
    );
  }

  // Step 2: Create the auth user. The check_invitation BEFORE trigger sees the
  // invitation we just inserted and allows; the create_profile_and_membership
  // AFTER trigger creates the profile + admin tenant_members row.
  const { data: created, error: createErr } = await sb.auth.admin.createUser({
    email,
    password,
    email_confirm: false, // user confirms via Supabase's email link
  });
  if (createErr) {
    // Tenant + invitation already exist; surface the auth error so the user
    // can retry signin if their account already exists.
    return NextResponse.json(
      {
        error: `Auth signup failed: ${createErr.message}. Tenant '${slug}' was created; if your account already exists, sign in normally.`,
      },
      { status: 400 },
    );
  }

  return NextResponse.json({
    ok: true,
    tenant_slug: slug,
    user_id: created.user?.id,
    next: "/auth/signin",
    message: `Tenant '${tenantName}' created. Check your email to confirm, then sign in.`,
  });
}
