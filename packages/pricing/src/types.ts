/**
 * Shape of a single priced unit. Flexible enough for per-token, per-request,
 * per-GB-bandwidth, per-seat-month, monthly-flat — anything that maps to
 * "X amount per Y unit."
 */
export type PricingUnit = {
  name: string;
  per?: number;
  amount_usd: number;
  currency: "usd";
};

/**
 * Where a price came from + how fresh it is. The dashboard shows this as a
 * badge so users see what they're trusting.
 *
 * - live:     fetched from a vendor API in the last 24h
 * - cached:   from API but older (within refresh_interval_hours)
 * - stale:    past the source's refresh_interval_hours
 * - fallback: live fetch failed, using fallback_amount_usd from yaml
 * - manual:   yaml-only source, within its refresh interval
 */
export type Freshness = "live" | "cached" | "stale" | "fallback" | "manual";

export type PricingSource = string;

/**
 * What a provider's yaml frontmatter declares about its pricing.
 */
export type PricingDeclaration = {
  source: PricingSource;
  units: Array<{
    name: string;
    per?: number;
    amount_usd?: number;
    currency: "usd";
  }>;
  refresh_interval_hours?: number;
  fallback_amount_usd?: Record<string, number>;
  last_verified_at?: string;
  sources?: string[];
};

/**
 * What `getPricing()` returns. Resolved + dated + badged.
 */
export type Pricing = {
  provider_slug: string;
  source: PricingSource;
  units: PricingUnit[];
  fetched_at: string;
  freshness: Freshness;
  fallback_used: boolean;
  source_urls: string[];
  notes?: string;
};

export type GetPricingOptions = {
  bbcRepoRoot?: string;
  noNetwork?: boolean;
  cacheDir?: string;
  now?: () => Date;
};
