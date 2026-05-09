"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireActor, requireRole, type Role } from "@/lib/auth/require-user";
import { getSupabaseServerClient } from "@/lib/supabase/server";

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
  const role = String(formData.get("role") ?? "member") as Role;

  if (!["github", "google", "email"].includes(provider)) {
    bounce({ error: "Provider must be github, google, or email." });
  }
  if (!identifier) bounce({ error: "Identifier required." });
  if (!["admin", "member", "viewer"].includes(role)) {
    bounce({ error: "Role must be admin, member, or viewer." });
  }

  const sb = await getSupabaseServerClient();
  const { error } = await sb.rpc("create_invitation", {
    p_provider: provider,
    p_identifier: identifier,
    p_role: role,
  });
  if (error) bounce({ error: error.message });

  revalidatePath("/team");
  revalidatePath("/log");
  bounce({ ok: `Invited ${provider}:${identifier} as ${role}` });
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
