import {
  voiceClause,
  overridesClause,
  glossaryClause,
  productClause,
  CITATION_INSTRUCTION,
  OUTPUT_AS_PLAIN_MARKDOWN,
  type Template,
} from "./types";
import { registerSupportTemplate } from "./registry";

// Customer reply (general inbound). The de-risk template for the studio --
// proves voice + product + glossary grounding works before the heavier
// decisions-coupled templates (churn-save, feature-request-triage) ship.
// Anchored to Help Scout AI Drafts / Intercom Fin Copilot / Chatwoot reply
// suggestion: assemble a draft from tenant memory, hand back for review,
// never auto-send. Four-beat reply shape: situation acknowledgement -> answer
// or next step -> optional disambiguation -> founder sign-off.

const template: Template = {
  id: "support:customer-reply",
  label: "Draft a customer reply",
  hint: "General inbound message -- question, complaint, or feature ask. Voice-grounded, glossary-pinned, no auto-send.",
  kind: "plain",
  firstUseInputs: [
    {
      id: "ticket_text",
      label: "Inbound message",
      hint: "Paste the customer's message verbatim. Include any prior thread context if it matters.",
      required: true,
      kind: "text",
    },
    {
      id: "customer_name",
      label: "Customer name (optional)",
      hint: "First name is fine. Lets the draft open with a real opener instead of 'Hi there'.",
      required: false,
      kind: "text",
    },
    {
      id: "severity",
      label: "Severity",
      hint: "low = curious question; medium = blocking but workaroundable; high = production down / paying customer angry.",
      required: false,
      kind: "select",
      options: ["low", "medium", "high"],
      default: "low",
    },
    {
      id: "context_note",
      label: "Anything I should know that the customer didn't say (optional)",
      hint: "E.g. 'this is a paying customer on the team plan' or 'they emailed 3 days ago and I never replied'.",
      required: false,
      kind: "text",
    },
  ],
  buildPrompt({ task, brain, inputs, overrides }) {
    const severity = (inputs.severity ?? "low").trim() || "low";
    const customerName = (inputs.customer_name ?? "").trim();
    const contextNote = (inputs.context_note ?? "").trim();
    const ticket = (inputs.ticket_text ?? "").trim();

    const opener = customerName
      ? `Open with the customer's first name ("${customerName}"). No "Hi there" or "Hello there".`
      : `No greeting filler. Open with a one-sentence acknowledgement of the specific situation -- not "thanks for reaching out".`;

    const severityNote =
      severity === "high"
        ? "Severity is HIGH -- production-impacting or paying-customer angry. Drop the playful register; be plain, factual, fast. Acknowledge the impact without admitting legal liability."
        : severity === "medium"
          ? "Severity is medium -- blocking but workaroundable. Acknowledge it's blocking, give the workaround or next step, no apology theater."
          : "Severity is low -- curious question or routine inbound. Match the voice register; this is the normal-tone case.";

    const signoff = (() => {
      const teamSize = brain.team.length;
      if (teamSize === 0) return "Sign off using 'I' (solo founder voice). Pick a short signature, e.g. the founder's first name lowercase.";
      if (teamSize === 1) return `Sign off as ${brain.team[0]!.name} using 'I' -- solo founder voice, not 'we'.`;
      return "Sign off using 'we' as the team. Pick the appropriate signer from the team list if relevant.";
    })();

    return [
      "You are drafting a customer-support reply on behalf of the founder. The draft will land in an existing thread (Help Scout / Front / Gmail reply / in-app chat) for the founder to review and edit before sending.",
      "",
      productClause(brain.product),
      "",
      voiceClause(brain.voice),
      "",
      glossaryClause(brain.glossary),
      "",
      `Task framing from the founder: ${task}`,
      contextNote ? `Hidden context the founder added: ${contextNote}` : "",
      "",
      "Inbound message from the customer:",
      "```",
      ticket || "(no message provided)",
      "```",
      "",
      severityNote,
      opener,
      signoff,
      "",
      "Reply shape (four beats, kept tight):",
      "  1. One-sentence acknowledgement of the SPECIFIC situation (not 'thanks for reaching out').",
      "  2. The answer or concrete next step (1-3 short paragraphs).",
      "  3. One disambiguating question if the ticket is genuinely under-specified -- skip otherwise.",
      "  4. Founder sign-off.",
      "",
      "Hard constraints:",
      "- Never commit to a specific ETA or fix date. If the customer asked when, say 'I'll come back to you on timing once I've looked into it' or similar.",
      "- Never quote a refund amount. The founder reviews refunds; the draft may suggest looking into one, not issuing it.",
      "- Never invent other-customer testimony ('many users tell us', 'another customer with the same setup').",
      "- Never admit legal liability for outages or data issues. Acknowledge impact without 'we failed you' phrasing.",
      "- Never end with marketing CTAs ('check out our blog!'). This is a support reply.",
      "- Never use voice.dont_words. They're banned even when natural to the model.",
      "- Forbid these stock filler phrases: 'sorry for the inconvenience', 'we appreciate your patience', 'thanks for reaching out', 'I hope this email finds you well'.",
      "",
      overridesClause(overrides ?? []),
      "",
      CITATION_INSTRUCTION,
      "",
      OUTPUT_AS_PLAIN_MARKDOWN,
      "",
      "Output only the reply body. Do NOT include a Subject: line, a salutation block above the opener, or any meta-commentary about the draft.",
    ]
      .filter(Boolean)
      .join("\n");
  },
};

registerSupportTemplate(template);
export default template;
