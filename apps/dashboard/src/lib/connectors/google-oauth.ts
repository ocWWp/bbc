// v1.5 D-W5-1: shared Google OAuth helper for Gmail + Drive (and any future
// google.* connector). Builds the authorize URL, performs token exchange, and
// refreshes access tokens.
//
// Design notes (per docs/plans/2026-05-12-bbc-launch-plan.md §3 / Week 5):
//   - One consent screen serves both Gmail + Drive scopes when the user
//     installs both. Each connector still owns its own `external_accounts`
//     row keyed by `provider_id` ("gmail" vs "drive") so they can be revoked
//     independently. If both are granted in the same consent, the install
//     server action persists the refresh_token on both rows.
//   - `access_type=offline` + `prompt=consent` are required to reliably get a
//     refresh token back. Google only returns refresh tokens on the first
//     consent unless prompt=consent is set.
//   - Token expiry is ~1h; runSync's token-refresh window is 24h, so the
//     connector's `refresh_token` hook calls into `refreshAccessToken` here.
//
// Like the Notion + Linear modules, the install server action owns the
// Supabase persistence step. This module is pure transport.

export const GMAIL_SCOPES = ["https://www.googleapis.com/auth/gmail.readonly"] as const;

// drive.metadata.readonly is bundled because the launch plan calls for
// folder-based mapping; reading file metadata (parents, mimeType) requires it.
// drive.readonly already implies access to file content, so the two together
// are the minimum useful set.
export const DRIVE_SCOPES = [
  "https://www.googleapis.com/auth/drive.readonly",
  "https://www.googleapis.com/auth/drive.metadata.readonly",
] as const;

const AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";

export type GoogleFetch = (
  url: string,
  init?: { method?: string; headers?: Record<string, string>; body?: string },
) => Promise<{
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
  text: () => Promise<string>;
  headers: { get: (name: string) => string | null };
}>;

export type GoogleOAuthCredentials = {
  clientId: string;
  clientSecret: string;
};

export type BuildAuthorizeUrlInput = {
  clientId: string;
  redirectUri: string;
  scopes: readonly string[];
  /** Opaque per-request state (encode tenant + nonce). */
  state: string;
  /** Override `prompt`. Default: "consent" so we reliably get a refresh_token
   *  even if the user previously authorized BBC under different scopes. */
  prompt?: "none" | "consent" | "select_account";
  /** Override `login_hint` (the email to pre-fill on the consent screen). */
  loginHint?: string;
};

export function buildAuthorizeUrl(input: BuildAuthorizeUrlInput): string {
  const url = new URL(AUTHORIZE_URL);
  url.searchParams.set("client_id", input.clientId);
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", input.scopes.join(" "));
  url.searchParams.set("state", input.state);
  // access_type=offline + prompt=consent are the documented recipe for getting
  // a refresh_token on every consent. Without them Google returns one only on
  // first consent for a given (user, client) pair.
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", input.prompt ?? "consent");
  url.searchParams.set("include_granted_scopes", "true");
  if (input.loginHint) url.searchParams.set("login_hint", input.loginHint);
  return url.toString();
}

export type TokenResponse = {
  access_token: string;
  /** Present on first consent; absent on subsequent refreshes. */
  refresh_token?: string;
  expires_in: number;
  token_type: string;
  /** Space-separated list of granted scopes. May be a subset of what we asked. */
  scope: string;
  id_token?: string;
};

export type ExchangeCodeInput = {
  code: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  fetch?: GoogleFetch;
};

/** Exchange an authorization code for tokens. Throws on non-2xx (the caller —
 *  the install server action — is responsible for translating into a UI
 *  error). */
export async function exchangeCodeForTokens(input: ExchangeCodeInput): Promise<TokenResponse> {
  const fetchImpl = input.fetch ?? defaultFetchAdapter();
  const body = new URLSearchParams({
    code: input.code,
    client_id: input.clientId,
    client_secret: input.clientSecret,
    redirect_uri: input.redirectUri,
    grant_type: "authorization_code",
  });
  const res = await fetchImpl(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`google oauth token exchange failed (${res.status}): ${text.slice(0, 200)}`);
  }
  return (await res.json()) as TokenResponse;
}

export type RefreshTokenInput = {
  refreshToken: string;
  clientId: string;
  clientSecret: string;
  fetch?: GoogleFetch;
};

/** Use a stored refresh token to get a fresh access token. Maps a 4xx response
 *  to AuthExpiredError so the framework can surface "auth_expired" cleanly. */
export async function refreshAccessToken(input: RefreshTokenInput): Promise<TokenResponse> {
  const fetchImpl = input.fetch ?? defaultFetchAdapter();
  const body = new URLSearchParams({
    refresh_token: input.refreshToken,
    client_id: input.clientId,
    client_secret: input.clientSecret,
    grant_type: "refresh_token",
  });
  const res = await fetchImpl(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (res.status === 400 || res.status === 401) {
    const { AuthExpiredError } = await import("./framework");
    const text = await res.text().catch(() => "");
    throw new AuthExpiredError(`google refresh ${res.status}: ${text.slice(0, 200)}`);
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`google oauth refresh failed (${res.status}): ${text.slice(0, 200)}`);
  }
  return (await res.json()) as TokenResponse;
}

/** Whether the BBC's Google OAuth app has cleared Google's verification
 *  review. Until it does, Gmail + Drive cards show a "beta" pill and the
 *  install drawer surfaces an unverified-app warning (D-W5-4). */
export function isGoogleAppVerified(env: Record<string, string | undefined> = process.env): boolean {
  const v = (env.BBC_GOOGLE_OAUTH_VERIFIED ?? "").toLowerCase();
  return v === "true" || v === "1" || v === "yes";
}

/** State helper — encodes tenant + nonce + the provider triggering the
 *  consent. Used by callbacks to know whether to write a gmail or a drive
 *  row (or both, if the user installed the bundle). */
export function buildOAuthState(input: { tenant_id: string; provider: string; nonce: string }): string {
  return `tenant=${encodeURIComponent(input.tenant_id)};provider=${encodeURIComponent(input.provider)};nonce=${encodeURIComponent(input.nonce)}`;
}

export function parseOAuthState(raw: string): { tenant_id: string; provider: string; nonce: string } | null {
  const parts = raw.split(";").reduce<Record<string, string>>((acc, kv) => {
    const [k, v] = kv.split("=");
    if (k && v != null) acc[k] = decodeURIComponent(v);
    return acc;
  }, {});
  if (!parts.tenant || !parts.provider || !parts.nonce) return null;
  return { tenant_id: parts.tenant, provider: parts.provider, nonce: parts.nonce };
}

/** Cloudflare Workers + Node both expose globalThis.crypto. */
export function cryptoRandomHex(bytes: number): string {
  const arr = new Uint8Array(bytes);
  globalThis.crypto.getRandomValues(arr);
  return Array.from(arr, (b) => b.toString(16).padStart(2, "0")).join("");
}

function defaultFetchAdapter(): GoogleFetch {
  return async (url, init) => {
    const res = await fetch(url, init);
    return {
      ok: res.ok,
      status: res.status,
      json: () => res.json(),
      text: () => res.text(),
      headers: { get: (n: string) => res.headers.get(n) },
    };
  };
}
