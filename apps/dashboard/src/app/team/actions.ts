"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { requireActor, requireRole } from "@/lib/auth/require-user";
import type { Role } from "@/lib/auth/require-user";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { sendEmail, invitationEmailHtml, invitationEmailText } from "@/lib/email";

/**
 * Server actions for the /team page. They return void (Next.js requirement
 * for inline form actions in server components) and surface errors via
 * `redirect("/team?error=<msg>")`. Successes also land back on /team
 * implicitly via revalidatePath; an `?ok=<msg>` query param surfaces
 * the success message to the page.
 */

function bounce(qs: Record<string, string>): never {
  const params = new URLSearchParams(qs);
  redirect(`/team?${params.toString()}`);
}

export async function inviteMember(formData: FormData): Promise<void> {
  const a = await requireActor();
  if (!a.ok) bounce({ error: a.output });
  const r = requireRole(a.actor, "admin");
  if (!r.ok) bounce({ error: r.output });

  const provider = String(formData.get("provider") ?? "");
  const identifier = String(formData.get("identifier") ?? "").trim().toLowerCase();
  const templateSlug = String(formData.get("template_slug") ?? "engineering");

  if (!["github", "google", "email"].includes(provider)) {
    bounce({ error: "Provider must be github, google, or email." });
  }
  if (!identifier) bounce({ error: "Identifier required." });

  const sb = await getSupabaseServerClient();
  const { error } = await sb.rpc("create_invitation", {
    p_provider: provider,
    p_identifier: identifier,
    p_template_slug: templateSlug,
  });
  if (error) bounce({ error: error.message });

  // Email the invitee (if provider is email; we don't have a way to email
  // GitHub/Google handles, those still rely on the invitee knowing to sign in).
  // Falls back to console log when RESEND_API_KEY is not set.
  let emailNote = "";
  if (provider === "email") {
    // Look up the freshly-inserted invitation_token + the template's display name
    // to put in the email URL + body.
    const [{ data: inv }, { data: tmpl }] = await Promise.all([
      sb
        .from("tenant_invitations")
        .select("invitation_token")
        .eq("provider", provider)
        .eq("identifier", identifier)
        .maybeSingle(),
      sb
        .from("role_templates")
        .select("display_name")
        .eq("slug", templateSlug)
        .maybeSingle(),
    ]);

    const h = await headers();
    const origin = h.get("origin") ?? `http://${h.get("host") ?? "localhost:3000"}`;
    const acceptUrl = inv?.invitation_token
      ? `${origin}/invite/${inv.invitation_token}`
      : `${origin}/auth/signin?email=${encodeURIComponent(identifier)}&source=invite`;
    const roleLabel = tmpl?.display_name ?? templateSlug;
    const args = {
      to: identifier,
      tenantName: a.actor.tenant_slug,
      tenantSlug: a.actor.tenant_slug,
      role: roleLabel,
      invitedByLabel: a.actor.identifier,
      acceptUrl,
    };
    const result = await sendEmail({
      to: identifier,
      subject: `You've been invited to ${a.actor.tenant_slug} on BBC`,
      html: invitationEmailHtml(args),
      text: invitationEmailText(args),
    });
    emailNote = result.ok ? ` · email: ${result.output}` : ` · email FAILED: ${result.output}`;
  }

  revalidatePath("/team");
  revalidatePath("/log");
  bounce({ ok: `Invited ${provider}:${identifier} as ${templateSlug}${emailNote}` });
}

export async function revokeInvitation(formData: FormData): Promise<void> {
  const a = await requireActor();
  if (!a.ok) bounce({ error: a.output });
  const r = requireRole(a.actor, "admin");
  if (!r.ok) bounce({ error: r.output });

  const id = String(formData.get("id") ?? "");
  if (!id) bounce({ error: "Invitation id required." });

  const sb = await getSupabaseServerClient();
  const { error } = await sb.rpc("revoke_invitation", { p_invitation_id: id });
  if (error) bounce({ error: error.message });

  revalidatePath("/team");
  revalidatePath("/log");
  bounce({ ok: "Invitation revoked" });
}

export async function changeMemberRole(formData: FormData): Promise<void> {
  const a = await requireActor();
  if (!a.ok) bounce({ error: a.output });
  const r = requireRole(a.actor, "admin");
  if (!r.ok) bounce({ error: r.output });

  const userId = String(formData.get("user_id") ?? "");
  const newRole = String(formData.get("new_role") ?? "") as Role;

  if (!userId) bounce({ error: "user_id required." });
  if (!["admin", "member", "viewer"].includes(newRole)) {
    bounce({ error: "new_role must be admin, member, or viewer." });
  }

  const sb = await getSupabaseServerClient();
  const { error } = await sb.rpc("change_member_role", {
    p_user_id: userId,
    p_new_role: newRole,
  });
  if (error) bounce({ error: error.message });

  revalidatePath("/team");
  revalidatePath("/log");
  bounce({ ok: `Role changed to ${newRole}` });
}

export async function removeMember(formData: FormData): Promise<void> {
  const a = await requireActor();
  if (!a.ok) bounce({ error: a.output });
  const r = requireRole(a.actor, "admin");
  if (!r.ok) bounce({ error: r.output });

  const userId = String(formData.get("user_id") ?? "");
  if (!userId) bounce({ error: "user_id required." });

  const sb = await getSupabaseServerClient();
  const { error } = await sb.rpc("remove_member", { p_user_id: userId });
  if (error) bounce({ error: error.message });

  revalidatePath("/team");
  revalidatePath("/log");
  bounce({ ok: "Member removed" });
}
