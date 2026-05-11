/**
 * Smoke test: hits the OpenRouter live catalog + reads a manual yaml + estimates
 * a sample monthly cost. Prints the freshness badges so we see the data we get.
 *
 * Run from the repo root:  pnpm --filter @bbc/pricing smoke
 */
import { getMonthlyEstimate, getPricing } from "../src/index.js";
import path from "node:path";

const repoRoot = path.resolve(import.meta.dirname, "..", "..", "..");

async function main(): Promise<void> {
  console.log("# BBC pricing smoke test");
  console.log(`# bbcRepoRoot=${repoRoot}\n`);

  console.log("## getPricing(example-llm-provider)  — live OpenRouter source");
  try {
    const llm = await getPricing("example-llm-provider", { bbcRepoRoot: repoRoot });
    console.log(`  source:        ${llm.source}`);
    console.log(`  freshness:     ${llm.freshness}`);
    console.log(`  fallback_used: ${llm.fallback_used}`);
    console.log(`  fetched_at:    ${llm.fetched_at}`);
    for (const u of llm.units) {
      console.log(`  - ${u.name.padEnd(18)} $${u.amount_usd.toFixed(2)} per ${u.per ?? 1}`);
    }
  } catch (e) {
    console.log(`  ERROR: ${(e as Error).message}`);
  }

  console.log("\n## getPricing(example-email-delivery) — manual source");
  try {
    const email = await getPricing("example-email-delivery", { bbcRepoRoot: repoRoot });
    console.log(`  source:        ${email.source}`);
    console.log(`  freshness:     ${email.freshness}`);
    for (const u of email.units) {
      console.log(`  - ${u.name.padEnd(18)} $${u.amount_usd.toFixed(2)} per ${u.per ?? 1}`);
    }
  } catch (e) {
    console.log(`  ERROR: ${(e as Error).message}`);
  }

  console.log("\n## getMonthlyEstimate (LLM + email at sample volumes)");
  const est = await getMonthlyEstimate(
    ["example-llm-provider", "example-email-delivery"],
    {
      "example-llm-provider.input_tokens": 2_000_000,
      "example-llm-provider.output_tokens": 500_000,
      "example-email-delivery.emails_sent": 10_000,
    },
    { bbcRepoRoot: repoRoot },
  );
  console.log(`  total: $${est.total_usd.toFixed(2)}/mo`);
  for (const li of est.line_items) {
    console.log(
      `  - ${li.provider_slug}.${li.unit.padEnd(18)} ` +
        `volume=${li.volume.toString().padStart(10)} ` +
        `cost=$${li.amount_usd.toFixed(2)} [${li.freshness}]`,
    );
  }
  if (est.warnings.length > 0) {
    console.log("\n  warnings:");
    for (const w of est.warnings) console.log(`  - ${w}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
