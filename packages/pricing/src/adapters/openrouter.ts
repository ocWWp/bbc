import { ageHours, getCached, setCached } from "../cache.js";
import type { Freshness, PricingDeclaration, PricingUnit } from "../types.js";

const ENDPOINT = "https://openrouter.ai/api/v1/models";
const CACHE_KEY = "openrouter:catalog";
const CATALOG_TTL_HOURS = 24;

type OpenRouterModel = {
  id: string;
  name?: string;
  pricing?: {
    prompt?: string;
    completion?: string;
    request?: string;
    image?: string;
  };
};

type OpenRouterResponse = {
  data: OpenRouterModel[];
};

async function fetchCatalog(now: Date): Promise<{ catalog: OpenRouterModel[]; fetched_at: string }> {
  const cached = getCached<OpenRouterModel[]>(CACHE_KEY);
  if (cached && ageHours(cached, now) < CATALOG_TTL_HOURS) {
    return { catalog: cached.value, fetched_at: cached.fetched_at };
  }
  const res = await fetch(ENDPOINT);
  if (!res.ok) throw new Error(`OpenRouter catalog fetch failed: ${res.status}`);
  const json = (await res.json()) as OpenRouterResponse;
  setCached(CACHE_KEY, json.data, now);
  return { catalog: json.data, fetched_at: now.toISOString() };
}

/**
 * Resolve LLM pricing for a provider whose `source` is
 * `openrouter:<vendor>/<model>` (e.g., `openrouter:anthropic/claude-sonnet-4.6`).
 *
 * Per-token amounts in OpenRouter come back as USD-per-token strings like
 * "0.000003". We convert to per-million-tokens ($3.00/M) for the unit shape
 * declared in the provider yaml.
 */
export async function fetchOpenRouterPricing(
  declaration: PricingDeclaration,
  opts: { noNetwork?: boolean; now?: () => Date } = {},
): Promise<{
  units: PricingUnit[];
  fetched_at: string;
  freshness: Freshness;
  fallback_used: boolean;
}> {
  const now = opts.now?.() ?? new Date();
  const slug = declaration.source.replace(/^openrouter:/, "").trim();
  if (!slug) throw new Error(`openrouter source missing model slug: ${declaration.source}`);

  if (opts.noNetwork) {
    return fallback(declaration, now);
  }

  let catalog: OpenRouterModel[];
  let fetchedAt: string;
  try {
    const result = await fetchCatalog(now);
    catalog = result.catalog;
    fetchedAt = result.fetched_at;
  } catch {
    return fallback(declaration, now);
  }

  const model = catalog.find((m) => m.id.toLowerCase() === slug.toLowerCase());
  if (!model || !model.pricing) {
    return fallback(declaration, now);
  }

  const units: PricingUnit[] = [];
  for (const decl of declaration.units) {
    const amount = mapUnit(decl.name, model.pricing);
    if (amount === null) {
      // Declared a unit OpenRouter doesn't surface — keep the fallback if any.
      const fb = declaration.fallback_amount_usd?.[decl.name];
      if (fb !== undefined) units.push({ ...decl, amount_usd: fb, currency: "usd" });
      continue;
    }
    const per = decl.per ?? 1_000_000;
    units.push({ name: decl.name, per, amount_usd: amount * per, currency: "usd" });
  }

  const cached = getCached(CACHE_KEY);
  const ageH = cached ? ageHours(cached, now) : 0;
  const freshness: Freshness = ageH < 1 ? "live" : "cached";

  return { units, fetched_at: fetchedAt, freshness, fallback_used: false };
}

function mapUnit(name: string, pricing: NonNullable<OpenRouterModel["pricing"]>): number | null {
  const usdPerToken = (raw: string | undefined): number | null =>
    raw === undefined ? null : Number.parseFloat(raw);
  switch (name) {
    case "input_tokens":
    case "prompt_tokens":
      return usdPerToken(pricing.prompt);
    case "output_tokens":
    case "completion_tokens":
      return usdPerToken(pricing.completion);
    case "request":
    case "per_request":
      return usdPerToken(pricing.request);
    case "image":
      return usdPerToken(pricing.image);
    default:
      return null;
  }
}

function fallback(
  declaration: PricingDeclaration,
  now: Date,
): {
  units: PricingUnit[];
  fetched_at: string;
  freshness: Freshness;
  fallback_used: boolean;
} {
  const units: PricingUnit[] = declaration.units.map((u) => ({
    name: u.name,
    per: u.per,
    amount_usd: declaration.fallback_amount_usd?.[u.name] ?? u.amount_usd ?? 0,
    currency: "usd",
  }));
  return { units, fetched_at: now.toISOString(), freshness: "fallback", fallback_used: true };
}
