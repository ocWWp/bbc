"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireActor, requireRole } from "@/lib/auth/require-user";
import { getSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Server actions for the /api-keys page. Mirrors /team/actions.ts —
 * void-returning to satisfy Next.js inline-form-action constraints,
 * feedback via redirect("/api-keys?ok=…|error=…").
 *
 * The plaintext token is shown ONCE (after creation, on the next page render)
 * via a query param. Server stores only the bcrypt hash via the SQL function.
 */

function bounce(qs: Record<string, string>): never {
  const params = new URLSearchParams(qs);
  redirect(`/api-keys?${params.toString()}`);
}

export async function createApiKey(formData: FormData): Promise<void> {
  const a = await requireActor();
  if (!a.ok) bounce({ error: a.output });
  const r = requireRole(a.actor, "admin");
  if (!r.ok) bounce({ error: r.output });

  const name = String(formData.get("name") ?? "").trim();
  const scope = String(formData.get("scope") ?? "read");

  if (!name) bounce({ error: "Key name required." });
  if (!["read", "write", "admin"].includes(scope)) {
    bounce({ error: "Scope must be read, write, or admin." });
  }

  const sb = await getSupabaseServerClient();
  const { data, error } = await sb.rpc("create_api_key", {
    p_name: name,
    p_scope: scope as "read" | "write" | "admin",
  });
  if (error) bounce({ error: error.message });

  // Surface the plaintext token via the query param. After this redirect,
  // the user copies it and never sees it again.
  revalidatePath("/api-keys");
  revalidatePath("/log");
  bounce({ token: String(data ?? ""), name, scope });
}

export async function revokeApiKey(formData: FormData): Promise<void> {
  const a = await requireActor();
  if (!a.ok) bounce({ error: a.output });
  const r = requireRole(a.actor, "admin");
  if (!r.ok) bounce({ error: r.output });

  const keyId = String(formData.get("key_id") ?? "");
  if (!keyId) bounce({ error: "key_id required." });

  const sb = await getSupabaseServerClient();
  const { error } = await sb.rpc("revoke_api_key", { p_key_id: keyId });
  if (error) bounce({ error: error.message });

  revalidatePath("/api-keys");
  revalidatePath("/log");
  bounce({ ok: `Key ${keyId} revoked.` });
}
