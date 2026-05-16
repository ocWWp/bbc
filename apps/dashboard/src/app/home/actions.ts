"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireActor, requireRole } from "@/lib/auth/require-user";
import { softDeleteSession } from "@/lib/home/sessions";

/**
 * Server action: soft-delete a chat-history session for the signed-in
 * (tenant, user). Used by the rail's overflow menu (PR-C).
 *
 * Auth contract:
 *  - `requireActor` proves a Supabase-authenticated session backed by a
 *    profile row created by the invitation trigger; without that the
 *    action throws `"unauth"` and `softDeleteSession` is never reached.
 *  - `requireRole(actor, "admin")` keeps destructive history deletion
 *    out of reach of operator/member/viewer. /home itself is readable
 *    by any role, but archiving is an admin-only operation per the
 *    PR-C design doc.
 *  - `softDeleteSession` filters by (id, tenant_id, user_id) and rejects
 *    when 0 rows match — that's how we prevent cross-tenant deletes and
 *    double-archive races. Errors from that layer rethrow as-is.
 *
 * Cache strategy:
 *  - When the deleted session is the one currently rendered (`targetId
 *    === currentSessionId`), we `redirect("/home")`. `redirect()` throws
 *    NEXT_REDIRECT internally, so any later `revalidatePath` would be
 *    unreachable — the redirect itself triggers a fresh GET of /home and
 *    the page re-reads from the DB.
 *  - Otherwise we revalidate `/home` so the rail (and any other /home
 *    children) refresh their list.
 *
 * @throws `"unauth"` when no Supabase session.
 * @throws `"forbidden"` when the actor is not admin.
 * @throws Whatever `softDeleteSession` throws (foreign tenant / archived).
 * @throws `NEXT_REDIRECT` when redirect() fires — this is the Next.js
 *   contract for server actions; the framework swallows it and replies
 *   with a 307 to the client.
 */
export async function deleteSessionAction(
  targetId: string,
  currentSessionId?: string,
): Promise<void> {
  const auth = await requireActor();
  if (!auth.ok) throw new Error("unauth");
  const role = requireRole(auth.actor, "admin");
  if (!role.ok) throw new Error("forbidden");

  await softDeleteSession(targetId, auth.actor.tenant_id, auth.actor.user_id);

  if (targetId === currentSessionId) {
    redirect("/home"); // throws NEXT_REDIRECT — by design, do not return.
  }
  revalidatePath("/home");
}
