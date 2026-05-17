"use server";

/**
 * Task 9 of Phase K install-flow: installGithubPat.
 *
 * Server action that:
 *   1. Requires the caller be a tenant admin (PAT install is high-trust).
 *   2. Validates the {pat, owner, repo} form input shape.
 *   3. Pings GitHub /user to confirm the PAT is live + has the right scope
 *      *before* persisting any ciphertext. See validatePatLive (Task 8).
 *   4. Encrypts the PAT and calls install_connector_atomic (migration 0057)
 *      so the external_accounts insert + tenant_connectors upsert land in one
 *      transaction. No orphan rows on partial failure.
 *
 * Security: the returned object never carries the plaintext PAT in any
 * field. Only ids and {ok} are surfaced to the caller. See the matching
 * test for the JSON.stringify(result) assertion that pins this invariant.
 *
 * This is a *PAT* install. p_refresh_*, p_expires_at, p_granted_scopes are
 * all null and p_kind is "api_key" — OAuth installs (Tasks 11–13) use a
 * different action shape with non-null refresh + expiry.
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireActor, requireRole } from "@/lib/auth/require-user";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { encryptSecret, makeDisplayHint } from "@/lib/secrets/encryption";
import { validatePatLive } from "@/lib/connectors/github-validate";

const githubInput = z.object({
  pat: z.string().min(10).max(2000),
  owner: z.string().min(1).max(100),
  repo: z.string().min(1).max(100),
});

export type InstallGithubPatResult =
  | { ok: true; external_account_id: string; tenant_connector_id: string }
  | { ok: false; error: string };

export async function installGithubPat(
  formData: FormData,
): Promise<InstallGithubPatResult> {
  const a = await requireActor();
  if (!a.ok) return { ok: false, error: a.output };
  const r = requireRole(a.actor, "admin");
  if (!r.ok) return { ok: false, error: r.output };

  const parsed = githubInput.safeParse({
    pat: formData.get("pat"),
    owner: formData.get("owner"),
    repo: formData.get("repo"),
  });
  if (!parsed.success) {
    return { ok: false, error: "Invalid form input." };
  }

  const live = await validatePatLive(parsed.data.pat);
  if (!live.ok) {
    return {
      ok: false,
      error:
        live.reason === "invalid_token"
          ? "GitHub rejected this token. Check it has not expired."
          : live.reason === "insufficient_scope"
            ? "Token lacks the repo scope."
            : "Could not reach GitHub. Try again.",
    };
  }

  const enc = encryptSecret(parsed.data.pat);
  const sb = await getSupabaseServerClient();
  const { data, error } = await sb.rpc("install_connector_atomic", {
    p_tenant_id: a.actor.tenant_id,
    p_actor_user_id: a.actor.user_id,
    p_connector_id: "github",
    p_provider_id: "github",
    p_kind: "api_key",
    p_secret_ciphertext: enc.ciphertext,
    p_secret_iv: enc.iv,
    p_secret_tag: enc.tag,
    p_refresh_ciphertext: null,
    p_refresh_iv: null,
    p_refresh_tag: null,
    p_expires_at: null,
    p_granted_scopes: null,
    p_display_hint: makeDisplayHint(parsed.data.pat),
    p_mapping: { owner: parsed.data.owner, repo: parsed.data.repo },
  });

  if (error || !data || !data[0]) {
    return { ok: false, error: error?.message ?? "Install failed." };
  }

  const row = (data as Array<{ external_account_id?: string; tenant_connector_id?: string }>)[0];
  if (!row?.external_account_id || !row?.tenant_connector_id) {
    return { ok: false as const, error: "Install RPC returned unexpected shape." };
  }

  revalidatePath("/library");
  revalidatePath("/library/install");

  return {
    ok: true as const,
    external_account_id: row.external_account_id,
    tenant_connector_id: row.tenant_connector_id,
  };
}
