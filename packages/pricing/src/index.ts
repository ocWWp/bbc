import { fetchOpenRouterPricing } from "./adapters/openrouter.js";
import { resolveManualPricing } from "./adapters/manual.js";
import { loadProvider } from "./providers.js";
import type { GetPricingOptions, Pricing } from "./types.js";

export type {
  Pricing,
  PricingUnit,
  PricingDeclaration,
  PricingSource,
  Freshness,
  GetPricingOptions,
} from "./types.js";
export { listProviders, loadProvider, parseFrontmatter, bbcRepoRoot } from "./providers.js";
export { _resetCache } from "./cache.js";

/**
 * Resolve pricing for a provider by slug. Returns the latest available pricing,
 * tagged with a freshness badge (live/cached/stale/manual/fallback). See
 * docs/pricing-architecture.md for the strategy.
 *
 * Throws if the provider yaml is missing or has no `pricing:` block.
 */
export async function getPricing(
  providerSlug: string,
  opts: GetPricingOptions = {},
): Promise<Pricing> {
  const record = await loadProvider(providerSlug, { bbcRepoRoot: opts.bbcRepoRoot });
  if (!record.pricing) {
    throw new Error(`Provider "${providerSlug}" has no pricing block in its yaml.`);
  }
  const decl = record.pricing;

  const adapterId = decl.source.split(":")[0] ?? decl.source;
  let result: Awaited<ReturnType<typeof fetchOpenRouterPricing>>;
  switch (adapterId) {
    case "openrouter":
      result = await fetchOpenRouterPricing(decl, {
        noNetwork: opts.noNetwork,
        now: opts.now,
      });
      break;
    case "manual":
      result = resolveManualPricing(decl, { now: opts.now });
      break;
    default:
      throw new Error(
        `Unknown pricing source adapter: "${adapterId}" (provider: ${providerSlug}). ` +
          `Supported: openrouter, manual.`,
      );
  }

  return {
    provider_slug: providerSlug,
    source: decl.source,
    units: result.units,
    fetched_at: result.fetched_at,
    freshness: result.freshness,
    fallback_used: result.fallback_used,
    source_urls: decl.sources ?? [],
  };
}

/**
 * Estimate monthly cost given a set of vendor picks + the user's declared
 * volume per unit. Volumes is a flat object keyed by `<provider_slug>.<unit_name>`.
 *
 * Example:
 *   getMonthlyEstimate(
 *     ["example-llm-provider", "example-email-delivery"],
 *     {
 *       "example-llm-provider.input_tokens":   2_000_000,
 *       "example-llm-provider.output_tokens":    500_000,
 *       "example-email-delivery.emails_sent":     10_000,
 *     },
 *   )
 */
export async function getMonthlyEstimate(
  providerSlugs: string[],
  volumes: Record<string, number>,
  opts: GetPricingOptions = {},
): Promise<{
  total_usd: number;
  line_items: Array<{
    provider_slug: string;
    unit: string;
    volume: number;
    amount_usd: number;
    freshness: Pricing["freshness"];
  }>;
  warnings: string[];
}> {
  const line_items: Array<{
    provider_slug: string;
    unit: string;
    volume: number;
    amount_usd: number;
    freshness: Pricing["freshness"];
  }> = [];
  const warnings: string[] = [];
  let total = 0;

  for (const slug of providerSlugs) {
    let pricing: Pricing;
    try {
      pricing = await getPricing(slug, opts);
    } catch (e) {
      warnings.push(`${slug}: ${(e as Error).message}`);
      continue;
    }
    if (pricing.fallback_used) {
      warnings.push(`${slug}: live fetch failed, using fallback prices`);
    }
    for (const unit of pricing.units) {
      const key = `${slug}.${unit.name}`;
      const volume = volumes[key] ?? 0;
      const per = unit.per ?? 1;
      const cost = (volume / per) * unit.amount_usd;
      total += cost;
      line_items.push({
        provider_slug: slug,
        unit: unit.name,
        volume,
        amount_usd: cost,
        freshness: pricing.freshness,
      });
    }
  }

  return { total_usd: Math.round(total * 100) / 100, line_items, warnings };
}
