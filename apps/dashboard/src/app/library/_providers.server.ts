import "server-only";

import { readBindings } from "@/lib/read-bindings";
import { readProviders } from "@/lib/read-providers";
import type { ProviderItem } from "./_data";

/** Map a provider-role contract (e.g. "llm-provider") to the ProviderItem.role
 *  bucket used by /library filter chips. Returns null for contracts we don't
 *  surface yet — the caller drops the provider from the list. */
function roleFromImplements(impl: string | undefined): ProviderItem["role"] | null {
  switch (impl) {
    case "llm-provider":         return "llm";
    case "db-provider":          return "db";
    case "email-delivery":       return "email";
    case "web-host":
    case "api-host":             return "hosting";
    case "analytics":            return "analytics";
    case "design-source":        return "design";
    case "subscription-receipt": return "billing";
    default:                     return null;
  }
}

/** Read the real provider adapter yamls (memory/ops/providers/*.yaml) + the
 *  active bindings (memory/ops/bindings.yaml) and shape them into the
 *  ProviderItem records /library renders. Lives in its own server-only
 *  module so `./_data` stays safe to import from client components. */
export async function loadRealProviders(): Promise<ProviderItem[]> {
  const [adapters, bindings] = await Promise.all([readProviders(), readBindings()]);
  const activeBoundProviders = new Set(
    bindings.filter((b) => b.kind === "active").map((b) => b.provider),
  );

  const items: ProviderItem[] = [];
  for (const a of adapters) {
    const role = roleFromImplements(a.implements[0]);
    if (!role) continue;
    items.push({
      id: `pr_${a.providerId}`,
      kind: "provider",
      role,
      name: a.providerId,
      author: "BBC",
      desc: a.description || a.headline,
      connected: activeBoundProviders.has(a.providerId),
      recommended: false,
      badge: null,
      license: "–",
      env: "",
      lastTest: "—",
      glyph: a.providerId.charAt(0).toUpperCase(),
    });
  }
  // Active (bound) first, then by name.
  items.sort((x, y) => {
    if (x.connected !== y.connected) return x.connected ? -1 : 1;
    return x.name.localeCompare(y.name);
  });
  return items;
}
