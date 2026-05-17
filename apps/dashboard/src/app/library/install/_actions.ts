"use server";

/**
 * Task 9 of Phase K install-flow: installGithubPat.
 *
 * Server action that:
 *   1. Requires the caller be a tenant admin (PAT install is high-trust).
 *   2. Validates the {pat, owner, repo} form input shape.
 *   3. Pings GitHub /repos/{owner}/{repo} to confirm the PAT can actually read
 *      the target repo *before* persisting any ciphertext. See validatePatLive
 *      (Task 8). Hitting /user instead would pass for fine-grained PATs that
 *      authenticate but lack repo access — install would succeed and every
 *      sync would 403. Codex P2 on PR #24.
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
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireActor, requireRole } from "@/lib/auth/require-user";
import {
  getSupabaseServerClient,
  getSupabaseServiceClient,
} from "@/lib/supabase/server";
import { encryptSecret, makeDisplayHint } from "@/lib/secrets/encryption";
import { validatePatLive } from "@/lib/connectors/github-validate";
import {
  buildAuthorizeUrl,
  GMAIL_SCOPES,
  DRIVE_SCOPES,
} from "@/lib/connectors/google-oauth";
import { signOAuthState } from "@/lib/connectors/oauth-state";
import { recordNonce } from "@/lib/connectors/oauth-nonce";

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

  const live = await validatePatLive(parsed.data.pat, {
    owner: parsed.data.owner,
    repo: parsed.data.repo,
  });
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

/**
 * Task 13 of Phase K install-flow: startGoogleOAuth.
 *
 * Server action that kicks off the Google OAuth dance for Gmail + Drive.
 *
 *   1. Requires the caller be a tenant admin (OAuth install is high-trust,
 *      same gate as installGithubPat).
 *   2. Refuses to start if BBC_GOOGLE_OAUTH_CLIENT_ID is unset (Cloudflare
 *      treats unset env vars as empty string — see feedback_cloudflare_env_vars_empty_string).
 *   3. Mints a fresh nonce, records it server-side via the oauth_state_nonces
 *      table (5 minute TTL) so the callback (Task 14) can single-use it.
 *   4. Signs an HMAC state payload binding {tenant, actor, provider, scopes,
 *      nonce, expiry} so the callback can verify the redirect came from us
 *      and hasn't been replayed.
 *   5. Calls next/navigation `redirect()` to send the browser to Google's
 *      consent screen. `redirect()` throws by design — that is how Next.js
 *      implements server-side navigation; the throw is the success signal.
 *
 * No tokens are persisted here. The callback route (Task 14) does the code
 * exchange and the install_connector_atomic call. This action is pure setup.
 */
export type StartGoogleOAuthResult = { ok: false; error: string };

export async function startGoogleOAuth(
  _formData: FormData,
): Promise<StartGoogleOAuthResult | never> {
  const a = await requireActor();
  if (!a.ok) return { ok: false, error: a.output };
  const r = requireRole(a.actor, "admin");
  if (!r.ok) return { ok: false, error: r.output };

  const clientId = process.env.BBC_GOOGLE_OAUTH_CLIENT_ID;
  if (!clientId || clientId.length === 0) {
    return { ok: false, error: "Google OAuth not configured on this server." };
  }

  const publicUrl = process.env.BBC_PUBLIC_URL;
  if (!publicUrl || publicUrl.length === 0) {
    return { ok: false, error: "Google OAuth not configured on this server." };
  }

  const nonce = crypto.randomUUID();
  const scopes = ["gmail", "drive"];
  const expires_at_ms = Date.now() + 5 * 60 * 1000;
  const redirect_url = "/library?installed=gmail,drive";

  const sb = getSupabaseServiceClient();
  await recordNonce(sb, {
    nonce,
    tenant_id: a.actor.tenant_id,
    actor_user_id: a.actor.user_id,
    provider: "google",
    scopes,
    redirect_url,
    ttl_seconds: 300,
  });

  const state = signOAuthState({
    tenant_id: a.actor.tenant_id,
    actor_user_id: a.actor.user_id,
    provider: "google",
    scopes,
    nonce,
    expires_at_ms,
  });

  const authorizeUrl = buildAuthorizeUrl({
    clientId,
    redirectUri: `${publicUrl}/api/oauth/google/callback`,
    scopes: [...GMAIL_SCOPES, ...DRIVE_SCOPES],
    state,
  });

  redirect(authorizeUrl);
}
