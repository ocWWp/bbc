// Task 15 of Phase K install-flow: Google OAuth callback.
//
// This route closes the loop on the consent flow started by startGoogleOAuth
// (Task 13). It verifies the signed state, redeems the single-use nonce,
// exchanges the auth code for tokens, encrypts them, and writes one
// external_accounts row per requested scope via install_connector_atomic.
//
// Failure modes all redirect back to /library with a queryable install_error
// so the UI can surface a human-readable message without leaking specifics.
//
// Security ordering (do not reorder without understanding why):
//   1. assertOAuthEnv first — refuse to boot on misconfigured env.
//   2. Reject obvious junk (missing code/state, Google's own error param).
//   3. Verify HMAC signature + expiry on state BEFORE touching any DB.
//   4. Confirm the *authenticated* caller matches the actor encoded in state
//      so a leaked state can't be redeemed by a different signed-in user.
//   5. Consume the nonce BEFORE exchanging the code. Replay protection has
//      to run before any side-effecting RPC; otherwise a duplicate redirect
//      could spend the same auth code twice.
//   6. Token exchange.
//   7. Encrypt access + refresh tokens. Plaintext never goes to the DB or
//      into any redirect URL.
//   8. Per-scope install via install_connector_atomic. If a later scope
//      fails, earlier scopes stay committed — there is no rollback RPC. The
//      user can re-run install for the failed connector individually.
//
// TODO(K.2 follow-up): consumeNonce currently returns null on BOTH
// missing-row (legitimate replay) and DB error (Supabase outage). Today both
// surface as install_error=state_reused, which is dishonest for the DB-error
// case. Before any production OAuth traffic, add a sibling helper that
// distinguishes the two so we can return install_error=db_unavailable when
// appropriate.

import { NextRequest, NextResponse } from "next/server";
import { exchangeCodeForTokens, GMAIL_SCOPES, DRIVE_SCOPES } from "@/lib/connectors/google-oauth";
import { verifyOAuthState } from "@/lib/connectors/oauth-state";
import { consumeNonce } from "@/lib/connectors/oauth-nonce";
import { encryptSecret } from "@/lib/secrets/encryption";
import { requireActor } from "@/lib/auth/require-user";
import { getSupabaseServiceClient } from "@/lib/supabase/server";
import { assertOAuthEnv } from "@/lib/connectors/oauth-env-guard";

export const dynamic = "force-dynamic";

function redirectTo(req: NextRequest, path: string): NextResponse {
  return NextResponse.redirect(new URL(path, req.url));
}

export async function GET(req: NextRequest) {
  // File-mode short-circuit: install + OAuth need DB-mode (RLS-gated secret
  // ciphertext rows + nonces). Without this guard a stale bookmark to the
  // callback in a file-mode deployment hits assertOAuthEnv or the Supabase
  // service client and produces a 500 instead of an honest redirect.
  if ((process.env.BBC_MODE ?? "file").toLowerCase() !== "db") {
    return redirectTo(req, "/library?install_error=file_mode");
  }

  assertOAuthEnv();

  const code = req.nextUrl.searchParams.get("code");
  const stateRaw = req.nextUrl.searchParams.get("state");
  const errParam = req.nextUrl.searchParams.get("error");

  // Google denied consent or returned its own error.
  if (errParam) {
    return redirectTo(req, `/library?install_error=${encodeURIComponent(errParam)}`);
  }

  if (!code || !stateRaw) {
    return redirectTo(req, "/library?install_error=missing_params");
  }

  const payload = verifyOAuthState(stateRaw, Date.now());
  if (!payload) {
    return redirectTo(req, "/library?install_error=state_invalid");
  }

  const actor = await requireActor();
  if (!actor.ok || actor.actor.user_id !== payload.actor_user_id) {
    return redirectTo(req, "/library?install_error=actor_mismatch");
  }

  // `install_connector_atomic` (migration 0057) is not yet in the generated
  // Database types, so we widen here. Matches the cast pattern in
  // src/app/library/install/_actions.ts.
  const sb = getSupabaseServiceClient() as unknown as {
    rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message?: string } | null }>;
    from: (t: string) => unknown;
  };
  const used = await consumeNonce(sb, payload.nonce);
  if (!used) {
    return redirectTo(req, "/library?install_error=state_reused");
  }

  let tokens;
  try {
    tokens = await exchangeCodeForTokens({
      code,
      clientId: process.env.BBC_GOOGLE_OAUTH_CLIENT_ID!,
      clientSecret: process.env.BBC_GOOGLE_OAUTH_CLIENT_SECRET!,
      redirectUri: `${process.env.BBC_PUBLIC_URL}/api/oauth/google/callback`,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message.slice(0, 100) : "";
    return redirectTo(
      req,
      `/library?install_error=token_exchange&detail=${encodeURIComponent(message)}`,
    );
  }

  const access = encryptSecret(tokens.access_token);
  const refresh = tokens.refresh_token ? encryptSecret(tokens.refresh_token) : null;
  const expires_at = new Date(Date.now() + (tokens.expires_in ?? 3600) * 1000).toISOString();
  const grantedScopes = tokens.scope.split(" ");

  // Per-connector scope check. Google may grant a subset of what we asked for
  // (the consent screen lets the user check/uncheck individual scopes). We
  // must not insert an external_accounts row for a connector the user denied
  // — every subsequent API call would 403, and the row would look installed
  // in the UI (BBC no-placeholders rule).
  //
  // Exact match, not prefix: codex P2 on PR #24 — the old prefix check let
  // `drive.metadata.readonly` alone satisfy "drive granted", but the drive
  // connector also needs `drive.readonly` to read file contents. We require
  // ALL of a connector's declared scopes (from google-oauth.ts) to be in
  // grantedScopes; partial grants count as denied.
  const REQUIRED_SCOPES: Record<string, readonly string[]> = {
    gmail: GMAIL_SCOPES,
    drive: DRIVE_SCOPES,
  };

  const installed: string[] = [];
  const denied: string[] = [];
  for (const scope of payload.scopes) {
    const required = REQUIRED_SCOPES[scope];
    if (!required) {
      // Unknown scope key (shouldn't happen from our own signed state) — skip
      denied.push(scope);
      continue;
    }
    const granted = required.every((s) => grantedScopes.includes(s));
    if (!granted) {
      denied.push(scope);
      continue;
    }
    const { error } = await sb.rpc("install_connector_atomic", {
      p_tenant_id: payload.tenant_id,
      p_actor_user_id: payload.actor_user_id,
      p_connector_id: scope,
      p_provider_id: scope,
      p_kind: "oauth_token",
      p_secret_ciphertext: access.ciphertext,
      p_secret_iv: access.iv,
      p_secret_tag: access.tag,
      p_refresh_ciphertext: refresh?.ciphertext ?? null,
      p_refresh_iv: refresh?.iv ?? null,
      p_refresh_tag: refresh?.tag ?? null,
      p_expires_at: expires_at,
      p_granted_scopes: grantedScopes,
      p_display_hint: "google",
      p_mapping: {},
    });
    if (error) {
      return redirectTo(
        req,
        `/library?install_error=install_failed&connector=${encodeURIComponent(scope)}`,
      );
    }
    installed.push(scope);
  }

  if (installed.length === 0) {
    return redirectTo(
      req,
      `/library?install_error=all_denied&denied=${denied.join(",")}`,
    );
  }
  if (denied.length > 0) {
    return redirectTo(
      req,
      `/library?installed=${installed.join(",")}&partial=${denied.join(",")}`,
    );
  }
  return redirectTo(req, `/library?installed=${installed.join(",")}`);
}
