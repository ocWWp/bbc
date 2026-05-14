// v1.5 D-W4-2: connector recommendation rules.
//
// Split out from recommend.ts because the rule set differs in kind: skill
// recommendations close gaps (role with 0 skills), connector recommendations
// look at memory signal ("you have a lot of X but no connector that produces
// X — install Y"). Same Signal shape, different reasoning.

import type { Recommendation, Signal } from "./recommend";

// Each rule: which memory supertag + min-count threshold + which connector
// to recommend + human-readable reason. Order matters — earlier rules emit
// first, dedupe at the engine level if needed.
const CONNECTOR_RULES: Array<{
  connector_id: string;
  connector_name: string;
  signal_type: keyof Signal["memory_counts_by_type"] | "any_count";
  threshold: number;
  reason_code: string;
  reason_template: (count: number) => string;
}> = [
  {
    connector_id: "github",
    connector_name: "GitHub",
    signal_type: "decision",
    threshold: 5,
    reason_code: "memory_signal_decisions_no_github",
    reason_template: (n) => `You have ${n} decisions but no GitHub connector — ADRs in /docs would surface here.`,
  },
  {
    connector_id: "notion",
    connector_name: "Notion",
    signal_type: "note",
    threshold: 5,
    reason_code: "memory_signal_notes_no_notion",
    reason_template: (n) =>
      `${n} notes in memory and no Notion connector — pages with type properties would auto-route to the right supertag.`,
  },
  {
    connector_id: "linear",
    connector_name: "Linear",
    signal_type: "product",
    threshold: 2,
    reason_code: "memory_signal_products_no_linear",
    reason_template: (n) =>
      `${n} product rows but no Linear — cycles and projects would back the product memory automatically.`,
  },
  {
    connector_id: "webhook-generic",
    connector_name: "Generic Webhook",
    signal_type: "any_count",
    threshold: 5,
    reason_code: "no_push_source",
    reason_template: () =>
      `No push-based source installed — a webhook endpoint lets CI / Zapier / custom hooks file memory directly.`,
  },
];

export function recommendConnectors(signal: Signal): Recommendation[] {
  const out: Recommendation[] = [];
  for (const rule of CONNECTOR_RULES) {
    if (signal.installed_connectors.has(rule.connector_id)) continue;

    let count = 0;
    if (rule.signal_type === "any_count") {
      // "any_count" is a catch-all rule that fires only if the tenant has
      // any memory at all (so we don't recommend webhooks to literally-empty
      // workspaces). Sum across all supertags.
      count = Object.values(signal.memory_counts_by_type).reduce<number>(
        (acc, n) => acc + (n ?? 0),
        0,
      );
      if (count < rule.threshold) continue; // catch-all needs at least some memory
    } else {
      count = signal.memory_counts_by_type[rule.signal_type] ?? 0;
      if (count < rule.threshold) continue;
    }

    // Skip the catch-all if any push-source-shaped connector (webhook) is
    // already present — but other rules only need their own connector absent.
    out.push({
      target_kind: "connector",
      target_id: rule.connector_id,
      reason_code: rule.reason_code,
      reason_human: rule.reason_template(count),
      observed_signal: {
        signal_type: rule.signal_type,
        count,
        threshold: rule.threshold,
      },
    });
  }
  return out;
}
