// Returns the list of BYOK provider names the current tenant is expected to
// have API keys for. Used by /ops to flag missing provider keys.
//
// The list is intersected against the active bindings in memory/ops/bindings.yaml
// so we only flag a key as "missing" if (a) the dashboard's BYOK form can
// actually create that provider_id and (b) the tenant has a bound adapter
// that needs it. Without the intersection, /ops would warn about
// "anthropic-claude-sonnet" — a string operators can't satisfy because
// /settings/keys only accepts the canonical short names (anthropic, openai,
// resend) defined in KeysClient.tsx and validated by PROVIDER_KEY_VALIDATORS.
//
// In DB-mode this should read bindings from the DB once Phase K migrates
// them off bindings.yaml (TODO Phase K-adjacent).

import "server-only";

import { loadRealProviders } from "@/app/library/_providers.server";

/**
 * BYOK provider IDs that /settings/keys can actually create. Canonical source
 * is PROVIDER_KEY_VALIDATORS in src/lib/secrets/encryption.ts and the
 * PROVIDER_OPTIONS list rendered by KeysClient.tsx. Kept in sync by hand —
 * three strings, no need for a shared registry yet. If a new BYOK provider
 * lands in /settings/keys, add it here too.
 */
const BYOK_PROVIDER_IDS = ["anthropic", "openai", "resend"] as const;

/**
 * For each BYOK provider, decide whether the tenant's active bindings imply
 * that key is required. A bound adapter "needs" the BYOK secret when its
 * provider_id equals the BYOK name (e.g. resend === resend) or starts with
 * `<byok>-` (e.g. anthropic-claude-sonnet → anthropic). This mirrors the
 * adapter-naming convention in memory/ops/providers/<provider>.yaml and is
 * good enough until adapters declare their BYOK dependency explicitly.
 */
function bindingImpliesByok(byok: string, boundProviderId: string): boolean {
  return boundProviderId === byok || boundProviderId.startsWith(`${byok}-`);
}

/**
 * BYOK provider names that /ops will look for in `external_accounts` when
 * computing `missingProviderKeys`. Empty array if no bindings reference a
 * BYOK provider (e.g. a demo tenant with no active bindings) — the page
 * then renders the matching "no providers configured" empty state instead
 * of a false missing-keys warning.
 */
export async function getExpectedProviders(): Promise<string[]> {
  const providers = await loadRealProviders();
  const boundProviderIds = providers
    .filter((p) => p.connected) // "bound" in bindings.yaml (active binding)
    .map((p) => p.name.toLowerCase());
  return BYOK_PROVIDER_IDS.filter((byok) =>
    boundProviderIds.some((bound) => bindingImpliesByok(byok, bound)),
  );
}
