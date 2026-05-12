"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireActor, requireRole } from "@/lib/auth/require-user";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { KNOWN_API_KEY_ROLES } from "@/lib/api-auth";

/**
 * Server actions for the /api-keys page. Mirrors /team/actions.ts —
 * void-returning to satisfy Next.js inline-form-action constraints,
 * feedback via redirect("/api-keys?ok=…|error=…").
 *
 * The plaintext token is shown ONCE (after creation, on the next page render)
 * via a query param. Server stores only the bcrypt hash via the SQL function.
 *
 * Role binding (migration 0031): a key may carry an optional role. Roles are
 * a free-form text column at the DB layer; the application enforces which
 * strings are recognized via KNOWN_API_KEY_ROLES in lib/api-auth.ts. The
 * dropdown on the create form passes one of those values; "none" means no
 * role binding (key sees all memory types, current default for unbound keys).
 */

const VALID_ROLE_VALUES = new Set<string>([...KNOWN_API_KEY_ROLES, "none"]);

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
  const roleRaw = String(formData.get("role") ?? "none");

  if (!name) bounce({ error: "Key name required." });
  if (!["read", "write", "admin"].includes(scope)) {
    bounce({ error: "Scope must be read, write, or admin." });
  }
  if (!VALID_ROLE_VALUES.has(roleRaw)) {
    bounce({ error: `Unknown role: ${roleRaw}` });
  }
  const role = roleRaw === "none" ? null : roleRaw;

  const sb = await getSupabaseServerClient();
  // The TS types for create_api_key are stale (migration 0031 added p_role
  // and the regen hasn't shipped). PostgREST happily accepts the third
  // parameter; cast through `as never` to silence the compiler. Same
  // pattern as resolveBearer reading out_role in lib/api-auth.ts.
  const { data, error } = await sb.rpc("create_api_key", {
    p_name: name,
    p_scope: scope as "read" | "write" | "admin",
    p_role: role,
  } as never);
  if (error) bounce({ error: error.message });

  // Surface the plaintext token via the query param. After this redirect,
  // the user copies it and never sees it again.
  revalidatePath("/api-keys");
  revalidatePath("/log");
  bounce({ token: String(data ?? ""), name, scope, role: roleRaw });
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
