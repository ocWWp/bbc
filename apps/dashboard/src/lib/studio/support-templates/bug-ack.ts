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
  findRelevantVendors,
} from "./retrieval";
import { registerSupportTemplate } from "./registry";

// Bug acknowledgement reply. The "studio reaches into brain memory to find a
// known related component" demonstration. Pattern-matches the inbound ticket
// against decisions + vendors so the reply can say "this looks like it might
// involve <our email-delivery provider>" when there's evidence, and stays
// silent otherwise.
//
// Anchored to GitHub saved-replies / Plain.com Linear templates /
// Help Scout's "Tricky emails" patterns: empathy -> echo -> action ->
// expectation-setting. 80-160 words, no fix ETA, no fabricated workaround.

const REPRO_OPTIONS = ["not_yet_tried", "yes", "no"];
const SEVERITY_OPTIONS = ["low", "medium", "high"];

const template: Template = {
  id: "support:bug-ack",
  label: "Acknowledge a bug report",
  hint: "Customer reported a bug. Drafts an ack-and-investigate reply that surfaces 'this looks related to <known component>' only when the brain has evidence.",
  kind: "plain",
  firstUseInputs: [
    {
      id: "ticket_text",
      label: "The bug report",
      hint: "Paste the customer's report verbatim. Error messages, repro steps, screenshot descriptions -- the more specific, the better the reply.",
      required: true,
      kind: "text",
    },
    {
      id: "customer_name",
      label: "Customer first name (optional)",
      hint: "Used to personalize the opener. Blank = generic open.",
      required: false,
      kind: "text",
    },
    {
      id: "can_reproduce",
      label: "Have you reproduced it?",
      hint: "Drives whether the reply says 'I can reproduce this on my end' vs 'can you share more detail'.",
      required: false,
      kind: "select",
      options: REPRO_OPTIONS,
      default: "not_yet_tried",
    },
    {
      id: "severity",
      label: "Severity",
      hint: "low = weekly-triage framing; medium = next-update-by-horizon; high = same-day-update promise.",
      required: false,
      kind: "select",
      options: SEVERITY_OPTIONS,
      default: "medium",
    },
    {
      id: "known_related_id",
      label: "Related memory id (advanced, optional)",
      hint: "If you know this matches a decision/vendor in the brain, paste the mem_id. Otherwise the studio searches automatically.",
      required: false,
      kind: "text",
    },
  ],
  buildPrompt({ task, brain, inputs, overrides }) {
    const ticket = (inputs.ticket_text ?? "").trim();
    const customerName = (inputs.customer_name ?? "").trim();
    const canReproduce = (inputs.can_reproduce ?? "not_yet_tried").trim() || "not_yet_tried";
    const severity = (inputs.severity ?? "medium").trim() || "medium";
    const knownRelatedId = (inputs.known_related_id ?? "").trim();

    const retrievalQuery = ticket;
    const relevantDecisions = findRelevantDecisions(retrievalQuery, brain.recent_decisions, 2);
    const relevantVendors = findRelevantVendors(retrievalQuery, brain.vendors, 2);

    const knownRelatedBlock = (() => {
      const lines: string[] = [];
      if (knownRelatedId) {
        lines.push(`Founder asserts this is related to memory id ${knownRelatedId}. Treat that connection as confirmed.`);
      }
      if (relevantDecisions.length > 0) {
        lines.push(
          "Decisions whose tags overlap the ticket (use only when material; cite mem_id when surfaced):",
          ...relevantDecisions.map((d) => `- ${d.title}: ${d.decision}`),
        );
      }
      if (relevantVendors.length > 0) {
        lines.push(
          "Vendors whose role/name overlaps the ticket. Surface the ROLE not the brand name unless can_reproduce=yes:",
          ...relevantVendors.map((v) => `- role=${v.role}, name=${v.name}`),
        );
      }
      if (lines.length === 0) {
        return "Known related context: nothing in the brain matched this ticket. Do NOT invent a related component, vendor, or decision.";
      }
      return ["Known related context (use only with hedging language unless confirmed):", ...lines].join("\n");
    })();

    const reproStance = (() => {
      switch (canReproduce) {
        case "yes":
          return 'You CAN reproduce it. Open with "you\'re right that <symptom>" / "I can reproduce this on my end." Confident posture.';
        case "no":
          return "You CANNOT reproduce it. Ask the smallest single piece of repro info still missing. Do NOT close as 'works for me'. Do NOT ask for information the ticket already contains.";
        default:
          return "You haven't tried repro yet. Acknowledge honestly and commit to looking. Don't pretend confidence you don't have.";
      }
    })();

    const severityCommitment = (() => {
      switch (severity) {
        case "high":
          return "Severity HIGH: same-day update promise. 'I'll write back by end of day' (use the literal phrase '[end of day <horizon>]' if you can't compute the actual day -- the founder fills in).";
        case "low":
          return "Severity LOW: weekly-triage framing. 'I look at issues like this weekly; will write back if it surfaces something specific.' No same-day promise.";
        default:
          return "Severity MEDIUM: next-update-by-horizon framing. 'I'll come back to you by <horizon>, even if the answer is \"still digging\".' Use '[horizon]' as a placeholder.";
      }
    })();

    const opener = customerName
      ? `Open with "Hey ${customerName}," then go straight into the echo sentence.`
      : "No greeting filler. Open with one sentence echoing the specific symptom.";

    const signoff = brain.team.length <= 1
      ? "Solo-founder voice: 'I see this', 'I'll write back'. Never 'we' or 'our team' or 'I'll pass this to engineering' -- there is no engineering team."
      : "Team-voice or solo-voice both acceptable; do NOT promise to forward to a team that doesn't exist.";

    return [
      "You are drafting a short reply to a user who reported a bug. Tone: honest, warm, concrete. Goal: make the user feel heard and set a realistic expectation. NOT to fix the bug.",
      "",
      productClause(brain.product),
      "",
      voiceClause(brain.voice),
      "",
      glossaryClause(brain.glossary),
      "",
      supportDecisionsClause(brain.recent_decisions),
      "",
      knownRelatedBlock,
      "",
      `Founder framing: ${task}`,
      "",
      "Bug report from the customer:",
      "```",
      ticket || "(no ticket provided)",
      "```",
      "",
      reproStance,
      severityCommitment,
      opener,
      signoff,
      "",
      "Reply shape (80-160 words, plain prose, no headings):",
      "  1. Echo the specific symptom in one sentence. No 'thanks for reaching out' filler.",
      "  2. Stance line based on can_reproduce.",
      "  3. If known_related_block contains evidence: ONE hedged sentence connecting to the related component ('this looks like it might involve <role> -- I'm pulling on that thread now'). Skip otherwise.",
      "  4. Expectation-setting line per the severity guidance.",
      "  5. Optional: ONE concrete workaround line, ONLY if it's in the ticket inputs or in the known-related block. Never invent a workaround.",
      "",
      "Hard constraints:",
      "- NEVER promise a fix ETA or specific date. Use horizon framing ('by end of day', 'this week').",
      "- NEVER promise a refund, credit, free month. The founder handles compensation separately.",
      "- NEVER admit legal liability ('this is our fault', 'we caused you harm'). Use 'I see what's happening' / 'you're right that this is broken'.",
      "- NEVER name an upstream vendor by brand unless can_reproduce=yes AND the founder confirmed the link. Default to the role ('our email-delivery provider').",
      "- NEVER quote, paraphrase, or reference specifics from other customers' tickets. Aggregate phrasing ('we've seen reports like this') only when the known-related block supports it.",
      "- NEVER invent a workaround. If none is in the inputs or known-related block, omit the workaround line.",
      "- NEVER fabricate that a fix has shipped, is in review, or is in any engineering stage.",
      "- NEVER write 'we apologize for the inconvenience', 'sorry for the trouble', 'unfortunately'.",
      "- NEVER include internal stack traces, error IDs, customer IDs from the inputs in the reply text.",
      "- NEVER use voice.dont_words.",
      "",
      overridesClause(overrides ?? []),
      "",
      CITATION_INSTRUCTION,
      "",
      OUTPUT_AS_PLAIN_MARKDOWN,
      "",
      "Output only the reply body. No Subject: line, no meta-commentary.",
    ]
      .filter(Boolean)
      .join("\n");
  },
};

registerSupportTemplate(template);
export default template;
