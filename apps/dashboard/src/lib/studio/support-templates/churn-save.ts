import {
  voiceClause,
  overridesClause,
  glossaryClause,
  productClause,
  supportDecisionsClause,
  CITATION_INSTRUCTION,
  OUTPUT_AS_PLAIN_MARKDOWN,
  type Template,
} from "./types";
import { registerSupportTemplate } from "./registry";

// Churn-save / cancellation reply. Decisions-grounded -- the template that
// proves the brain's decision memory pays off. Anchors to Baremetrics /
// Sequenzy / Outseta / patio11 founder-personal cancellation replies: 4-6
// sentences, no apology theater, no blanket discount, one concrete
// non-discount offer (founder call / extended trial / migration help /
// roadmap context / graceful door-open).
//
// The "we don't discount under $X" rule is the canonical example. If the
// brain has a no-discount decision recorded, the prompt refuses discount
// offers unless the founder explicitly lists 'discount' in allowed_offers
// (the in-band one-shot override that complements J.14/J.15 persistent
// overrides).

const DEFAULT_OFFER_MENU = [
  "founder call",
  "extended trial",
  "migration help",
  "roadmap context",
  "graceful goodbye with door open",
];

const SHAPE_EXEMPLARS = [
  // Voice-neutral shape exemplars (hypothetical products) so the model gets
  // the cadence without copying tone. 4-sentence Baremetrics / patio11 shape.
  `Example A (short):\n"Hey Sam, I saw you cancelled. Migration sounds like the real blocker -- want a 30-minute call where I walk you through importing your existing data? If not, the door's open whenever. -- oc"`,
  `Example B (decision-cited):\n"Hey Jordan, cancellation noted. On pricing -- we've made a deliberate choice not to discount, because the price IS the value claim we're making. What I can do: extend your current plan by 30 days while you decide. Reply if that helps."`,
];

const template: Template = {
  id: "support:churn-save",
  label: "Draft a churn-save reply",
  hint: "Cancellation message just landed. Decisions-grounded, no apology theater, no blanket discount, one concrete non-discount offer.",
  kind: "plain",
  firstUseInputs: [
    {
      id: "cancellation_message",
      label: "Cancellation message",
      hint: "Paste the cancellation email / cancel-flow survey / chat verbatim. The specific phrasing matters -- the reply mirrors it back.",
      required: true,
      kind: "text",
    },
    {
      id: "customer_name",
      label: "Customer name (optional)",
      hint: "First name. 'Hi there' fails on a churn-save reply.",
      required: false,
      kind: "text",
    },
    {
      id: "tenure",
      label: "How long have they been a customer? (optional)",
      hint: "E.g. '6 months', '2 years', 'just signed up last week'. Changes the register -- long-tenure churn is heavier than short-tenure.",
      required: false,
      kind: "text",
    },
    {
      id: "plan",
      label: "Plan / MRR tier (optional)",
      hint: "Hobby / Pro / Team / Enterprise -- or actual MRR. Routes which 'don't discount under X' decision applies.",
      required: false,
      kind: "text",
    },
    {
      id: "allowed_offers",
      label: "Offers I'm willing to make (optional)",
      hint: "Comma-separated. Default: founder-call, extended-trial, migration-help, roadmap-context. Add 'discount' explicitly to permit one this time.",
      required: false,
      kind: "text",
    },
  ],
  buildPrompt({ task, brain, inputs, overrides }) {
    const message = (inputs.cancellation_message ?? "").trim();
    const customerName = (inputs.customer_name ?? "").trim();
    const tenure = (inputs.tenure ?? "").trim();
    const plan = (inputs.plan ?? "").trim();
    const allowedOffersRaw = (inputs.allowed_offers ?? "").trim();

    const offers = allowedOffersRaw
      ? allowedOffersRaw
          .split(",")
          .map((o) => o.trim().toLowerCase())
          .filter(Boolean)
      : DEFAULT_OFFER_MENU;
    const discountPermitted = offers.includes("discount");

    const opener = customerName
      ? `Open with "Hey ${customerName}, I saw you cancelled." or a close variant -- no greeting filler.`
      : `Open with a one-sentence acknowledgement that does not apologize or express surprise. No "Hi there".`;

    const tenureNote = tenure
      ? `Tenure context: ${tenure}. ${tenure.match(/\b(year|months?)\b/i) ? "Heavier register -- this is a long-tenure cancellation." : "Lighter register -- short-tenure cancellations often signal onboarding failure, not real churn."}`
      : "";

    const planNote = plan ? `Plan/tier: ${plan}. Filter decisions that have plan-specific thresholds accordingly.` : "";

    const offerLine = discountPermitted
      ? `Allowed offer types this run (founder explicitly permitted discount): ${offers.join(", ")}.`
      : `Allowed offer types this run: ${offers.join(", ")}. NOTE: discount is NOT in the allowed list. Do not offer a discount, prorated refund, or pause-the-bill option even if the customer's reason is "too expensive".`;

    const decisionStanding = (brain.recent_decisions ?? []).length === 0
      ? "WARNING: the brain has no decisions recorded. Lean conservative -- do not invent rules. Offer one non-discount alternative and leave the door open."
      : "Treat prior decisions as non-negotiable. If the customer's cancellation reason would require violating one, surface the constraint honestly (without combat) and offer the alternative that does not violate it.";

    const signoff = brain.team.length <= 1
      ? "Sign off using 'I' -- solo founder voice, not 'we'."
      : "Sign off using 'we' or the appropriate team member's name.";

    return [
      "You are drafting a churn-save reply on behalf of the founder. The draft lands in the existing email / chat thread the customer used to cancel; the founder reviews and edits before sending.",
      "",
      productClause(brain.product),
      "",
      voiceClause(brain.voice),
      " Cancellation context dampens voice cheerfulness: no exclamation points, no upbeat retention-marketing phrases.",
      "",
      glossaryClause(brain.glossary),
      "",
      supportDecisionsClause(brain.recent_decisions),
      decisionStanding,
      "",
      `Founder framing: ${task}`,
      tenureNote,
      planNote,
      offerLine,
      "",
      "Cancellation message from the customer:",
      "```",
      message || "(no message provided)",
      "```",
      "",
      "Shape exemplars (use for cadence and length, NOT for tone or content -- the voice contract above is canonical):",
      ...SHAPE_EXEMPLARS,
      "",
      "Reply shape (strict):",
      "  - 4 short sentences. Hard ceiling: 6 sentences total.",
      "  1. Acknowledgement -- 'I saw you cancelled' or a close variant. No apology, no surprise, no 'sorry to see you go'.",
      "  2. A specific reaction grounded in something the customer said -- mirror their phrasing.",
      "  3. ONE concrete non-discount offer from the allowed list, OR a decision-cited explanation if their reason would require violating a brain decision.",
      "  4. A single open question OR a graceful door-open close.",
      "",
      opener,
      signoff,
      "",
      "Hard constraints:",
      "- Do NOT use these phrases (banned across all churn-save replies): 'sorry to see you go', \"we'd hate to lose you\", 'we appreciate your business', 'we value you as a customer', \"we'd love to keep you\", 'is there anything we can do', 'thanks for being a customer'.",
      "- No exclamation points anywhere in the reply.",
      "- Never argue with the cancellation reason combatively, even if the brain.product memory contradicts it. Gently surface the mismatch: 'we actually shipped X in March -- happy to walk you through it if it's still relevant'.",
      "- Never quote a specific refund amount. The founder reviews refunds; use a placeholder like '[I'll confirm a refund -- oc]' if a refund is genuinely warranted.",
      "- Never promise a feature is on the roadmap unless brain.recent_decisions or brain.product confirms it.",
      "- If you offer a founder call, include the literal placeholder '[calendar link]' -- the founder pastes the URL.",
      "- Never use voice.dont_words.",
      "- Cite the decision that shaped the reply when material -- the founder needs to see which rule the draft is leaning on.",
      "",
      overridesClause(overrides ?? []),
      "",
      CITATION_INSTRUCTION,
      "",
      OUTPUT_AS_PLAIN_MARKDOWN,
      "",
      "Output only the reply body. No Subject: line, no salutation block, no meta-commentary.",
    ]
      .filter(Boolean)
      .join("\n");
  },
};

registerSupportTemplate(template);
export default template;
