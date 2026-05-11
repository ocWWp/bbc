import type { Freshness, PricingDeclaration, PricingUnit } from "../types.js";

/**
 * Resolve pricing for a provider whose `source` is `"manual"`. No network call;
 * just reads `units[].amount_usd` from the yaml. Freshness depends on how old
 * `last_verified_at` is vs `refresh_interval_hours`.
 */
export function resolveManualPricing(
  declaration: PricingDeclaration,
  opts: { now?: () => Date } = {},
): {
  units: PricingUnit[];
  fetched_at: string;
  freshness: Freshness;
  fallback_used: boolean;
} {
  const now = opts.now?.() ?? new Date();

  const units: PricingUnit[] = declaration.units.map((u) => {
    if (u.amount_usd === undefined) {
      throw new Error(
        `manual pricing requires amount_usd on every unit (missing on "${u.name}")`,
      );
    }
    return { name: u.name, per: u.per, amount_usd: u.amount_usd, currency: "usd" };
  });

  const verifiedAt = declaration.last_verified_at
    ? new Date(declaration.last_verified_at)
    : null;
  const refreshHours = declaration.refresh_interval_hours ?? 720;
  const ageHours = verifiedAt
    ? (now.getTime() - verifiedAt.getTime()) / 3_600_000
    : Infinity;

  const freshness: Freshness = ageHours > refreshHours ? "stale" : "manual";

  return {
    units,
    fetched_at: verifiedAt?.toISOString() ?? now.toISOString(),
    freshness,
    fallback_used: false,
  };
}
