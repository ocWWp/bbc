// oauth-env-guard.ts — fail-fast asserter for /api/oauth/* routes.
//
// Cloudflare unset env vars are empty strings, not undefined (saved memory
// `feedback_cloudflare_env_vars_empty_string`). Routes that need OAuth secrets
// must refuse to boot instead of silently producing broken signatures or
// leaking placeholder behavior. This util consolidates the checks.

export function assertOAuthEnv(): void {
  const stateSecret = process.env.BBC_OAUTH_STATE_SECRET;
  if (!stateSecret || stateSecret.length === 0) {
    throw new Error(
      "BBC_OAUTH_STATE_SECRET is not set. Generate one with `openssl rand -base64 32` and configure it (Cloudflare: `wrangler secret put BBC_OAUTH_STATE_SECRET`).",
    );
  }
}
