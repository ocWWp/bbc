// Returns the list of provider names the current tenant is expected to have
// API keys for, derived from memory/ops/bindings.yaml (file-mode). Used by
// /ops to flag missing provider keys.
//
// Thin wrapper around loadRealProviders() so /ops doesn't reach across to
// /library internals directly. In DB-mode this should read from the
// equivalent table once bindings move to the DB (TODO Phase K-adjacent).

import "server-only";

import { loadRealProviders } from "@/app/library/_providers.server";

/**
 * Provider names (lowercase) that have a bindings.yaml row marking them as
 * the active provider for one of the tenant's role contracts. These are the
 * providers /ops will look for in `external_accounts` when computing
 * `missingProviderKeys`.
 *
 * Returns `[]` if no providers are bound — the page renders the matching
 * "no providers configured" empty state instead of a false missing-keys
 * warning.
 */
export async function getExpectedProviders(): Promise<string[]> {
  const providers = await loadRealProviders();
  return providers
    .filter((p) => p.connected) // "bound" in bindings.yaml (active binding)
    .map((p) => p.name.toLowerCase());
}
