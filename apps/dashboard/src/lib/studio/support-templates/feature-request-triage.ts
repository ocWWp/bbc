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
import {
  findRelevantDecisions,
  findSimilarShipped,
  findRelevantVendors,
} from "./retrieval";
import { registerSupportTemplate } from "./registry";

// Feature-request triage reply. THE headline demo of BBC's three-loop
// architecture: retrieval-then-generation against three brain probes
// (roadmap status, similar shipped, relevant decisions), then a verdict
// (already-shipped / planned / unprioritized / wont-build) that, on accept,
// produces a 3-way writeback (feature-request-log + propose-ADR on
// wont-build + propose-roadmap-status correction on already-shipped).
//
// Anchored to 37signals' "Ask 37signals: How do you say no?", Savio's
// triage template guide, Productboard's six-state status taxonomy, and
// Linear Triage Intelligence's "find the similar issue first" pattern.

const VERDICT_OPTIONS = [
  "auto",
  "already-shipped",
  "planned",
  "unprioritized",
  "wont-build",
];

const CHANNEL_OPTIONS = ["email", "in-app", "github-issue", "x-reply", "discord"];

const template: Template = {
  id: "support:feature-request-triage",
  label: "Triage a feature request",
  hint: "Customer is asking for a feature. Retrieves roadmap status + similar shipped + relevant decisions, then drafts a principled-decline / on-roadmap / already-shipped reply.",
  kind: "plain",
  firstUseInputs: [
    {
      id: "request_text",
      label: "What the customer asked for",
      hint: "Paste the request verbatim (email body, ticket, DM, GitHub issue). Include enough context to identify the feature -- the reply names it back to them.",
      required: true,
      kind: "text",
    },
    {
      id: "feature_summary",
      label: "One-line summary of the requested feature (optional)",
      hint: "If blank, the studio will infer from the message. Filling it in pins the retrieval probe -- recommended when the customer's message is vague.",
      required: false,
      kind: "text",
    },
    {
      id: "verdict",
      label: "Your call",
      hint: "'auto' lets the studio infer from roadmap/decisions memory. Override when you want the reply to take a stance the brain doesn't yet record (accept writes that stance back).",
      required: false,
      kind: "select",
      options: VERDICT_OPTIONS,
      default: "auto",
    },
    {
      id: "customer_name",
      label: "Customer's first name (optional)",
      hint: "If provided, the reply opens with the name; otherwise no salutation (founder-direct register).",
      required: false,
      kind: "text",
    },
    {
      id: "channel",
      label: "Reply channel",
      hint: "email allows 3-4 paragraphs and links; x-reply caps at 280 chars; github-issue uses markdown lists.",
      required: false,
      kind: "select",
      options: CHANNEL_OPTIONS,
      default: "email",
    },
  ],
  buildPrompt({ task, brain, inputs, overrides }) {
    const requestText = (inputs.request_text ?? "").trim();
    const featureSummary = (inputs.feature_summary ?? "").trim();
    const verdict = (inputs.verdict ?? "auto").trim() || "auto";
    const customerName = (inputs.customer_name ?? "").trim();
    const channel = (inputs.channel ?? "email").trim() || "email";

    const retrievalQuery = featureSummary || requestText;
    const similarShipped = findSimilarShipped(retrievalQuery, brain.product);
    const relevantDecisions = findRelevantDecisions(retrievalQuery, brain.recent_decisions);
    const relevantVendors = findRelevantVendors(retrievalQuery, brain.vendors);

    const similarBlock = similarShipped.length
      ? `Similar shipped capabilities (deterministic substring match against product.differentiators):\n${similarShipped.map((s) => `- ${s}`).join("\n")}`
      : "Similar shipped capabilities: none found in product memory. Do NOT invent one.";

    const decisionsBlock = relevantDecisions.length
      ? `Decisions matching this request (cite mem_id when you lean on one):\n${relevantDecisions.map((d) => `- ${d.title}: ${d.decision}`).join("\n")}`
      : "Matching decisions: none found in the brain. Do NOT cite an unrelated decision.";

    const vendorsBlock = relevantVendors.length
      ? `Vendors we already use that might serve as workaround:\n${relevantVendors.map((v) => `- ${v.name} (${v.role})`).join("\n")}`
      : "";

    const verdictGuidance = (() => {
      switch (verdict) {
        case "already-shipped":
          return "Verdict is ALREADY-SHIPPED. Lead by naming the feature back, then point at the matching capability above. If similar shipped was empty, the founder is overriding the brain -- say so politely ('we shipped this -- I'll get the brain updated').";
        case "planned":
          return "Verdict is PLANNED. State it's on the roadmap; do NOT invent an ETA unless brain.product or brain.recent_decisions explicitly supplies one. 'No committed timeline' is the honest fallback.";
        case "unprioritized":
          return "Verdict is UNPRIORITIZED. Honest stance: 'we read every request, no promise on timing'. No fake roadmap.";
        case "wont-build":
          return "Verdict is WONT-BUILD. Cite the relevant decision (if one matches above). One sentence of reasoning, no apology, no 'but maybe in the future'. 37signals-style principled decline.";
        default:
          return "Verdict is AUTO -- you decide based on the brain context. If similar shipped is non-empty, lean already-shipped. If relevant decisions explicitly forbid it, lean wont-build. Otherwise unprioritized is the honest default.";
      }
    })();

    const opener = customerName
      ? `Open by naming the feature back to ${customerName} in the first sentence. No "Hi there", no "Thanks for reaching out".`
      : `Open by naming the feature back in the first sentence. No greeting filler -- founder-direct register.`;

    const channelConstraint = (() => {
      switch (channel) {
        case "x-reply":
          return "Channel is X reply: cap at 280 characters total. Skip the workaround paragraph. One sentence of verdict + one sentence of reasoning.";
        case "in-app":
          return "Channel is in-app widget: keep under ~120 words. Skip outbound links.";
        case "github-issue":
          return "Channel is GitHub issue: markdown is welcome. Use a brief code-style mention for feature slugs if helpful.";
        case "discord":
          return "Channel is Discord: keep paragraphs short, no formal email opener.";
        default:
          return "Channel is email: 3-4 short paragraphs, links allowed, no Subject line (the founder pastes into an existing thread).";
      }
    })();

    const teamConstraint =
      brain.team.length <= 1
        ? "Solo founder: use 'I', NEVER 'we'll pass this to the team' or 'I'll forward this to product' -- there is no team."
        : "Team has multiple members. 'I' or 'we' both acceptable; do NOT forward-to-team unless the founder added that as an override.";

    return [
      "You are drafting a feature-request triage reply on behalf of the founder. The draft lands in an existing customer thread for the founder to review and edit before sending.",
      "",
      productClause(brain.product),
      "",
      voiceClause(brain.voice),
      "",
      glossaryClause(brain.glossary),
      "",
      supportDecisionsClause(brain.recent_decisions),
      "",
      "Retrieval probes (deterministic, run before this prompt):",
      similarBlock,
      "",
      decisionsBlock,
      vendorsBlock,
      "",
      `Founder framing: ${task}`,
      featureSummary ? `Founder's one-line summary of the request: ${featureSummary}` : "",
      "",
      "Customer's request:",
      "```",
      requestText || "(no request provided)",
      "```",
      "",
      verdictGuidance,
      opener,
      teamConstraint,
      channelConstraint,
      "",
      "Reply shape (skip paragraphs that don't apply):",
      "  1. Name the requested feature back in one sentence.",
      "  2. State the verdict explicitly: shipped / planned / unprioritized / won't-build.",
      "  3. If already-shipped: point at the matching capability. If won't-build: one sentence of reasoning, cite the decision. If unprioritized: honest 'no promise on timing'. If planned: no ETA invention.",
      "  4. (Optional) One workaround line if a vendor above applies. Skip otherwise.",
      "",
      "Hard constraints:",
      "- Never invent a similar-shipped feature. If the retrieval block above says 'none found', no 'we already ship something like this' paragraph.",
      "- Never invent an ETA. Phrases like 'soon', 'in the coming weeks', 'next release' are banned.",
      "- Never apologize for not building something. Principled decline, not apology theater.",
      "- Never cite a decision that wasn't in the retrieval block. A spurious citation is worse than none.",
      "- Never reveal that other customers asked for this (aggregate counters are private brain state).",
      "- No legal hedges ('subject to change', 'this is not a commitment') -- they read corporate.",
      "- No 'Thanks for reaching out', 'Thanks for the message', 'Hi there' openers.",
      "- Never use voice.dont_words.",
      "",
      overridesClause(overrides ?? []),
      "",
      CITATION_INSTRUCTION,
      "",
      OUTPUT_AS_PLAIN_MARKDOWN,
      "",
      "Output only the reply body. No Subject: line, no meta-commentary about the verdict.",
    ]
      .filter(Boolean)
      .join("\n");
  },
};

registerSupportTemplate(template);
export default template;
