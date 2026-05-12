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

// Incident / status post. The one-shot, high-stress, voice-register-overridden
// template. Anchors to Atlassian Statuspage's four-state lifecycle
// (Investigating / Identified / Monitoring / Resolved), Better Stack's
// "name the component, name the symptom, commit to cadence not ETA",
// FireHydrant's "silence is worse than no-news".
//
// Voice register is intentionally downshifted: a brand that's normally
// playful still writes calm, capitalized, emoji-free incident posts. The
// prompt overrides voice.register for this template specifically while
// keeping voice.do_words / voice.dont_words / glossary in force.

const STATUS_OPTIONS = ["investigating", "identified", "monitoring", "resolved"];
const CADENCE_OPTIONS = ["15 min", "30 min", "60 min"];

const template: Template = {
  id: "support:incident-status",
  label: "Draft an incident / status post",
  hint: "Outage or degradation comm. Statuspage-shaped: component, symptom, scope, cadence. No ETAs, no liability admission, no emoji.",
  kind: "plain",
  firstUseInputs: [
    {
      id: "component",
      label: "Affected component",
      hint: "What's broken from the user's perspective? E.g. 'public API', 'sign-in', 'webhook delivery'. One line.",
      required: true,
      kind: "text",
    },
    {
      id: "symptom",
      label: "User-visible symptom",
      hint: "5xx errors, slow response, login loop, missing data. Plain language a customer would recognize -- not the internal error.",
      required: true,
      kind: "text",
    },
    {
      id: "current_status",
      label: "Current status",
      hint: "Mirrors Statuspage's four states. 'investigating' is the default first post.",
      required: true,
      kind: "select",
      options: STATUS_OPTIONS,
      default: "investigating",
    },
    {
      id: "impact_scope",
      label: "Impact scope (optional)",
      hint: "Who is affected? 'All users', 'EU customers only', 'paid plans on the legacy stack'. Blank = the post says scope is being assessed.",
      required: false,
      kind: "text",
    },
    {
      id: "update_cadence",
      label: "Next update in",
      hint: "30 min is the industry norm. 15 min for high-traffic outages, 60 min for slow-burn degradations.",
      required: false,
      kind: "select",
      options: CADENCE_OPTIONS,
      default: "30 min",
    },
    {
      id: "cause_summary",
      label: "Cause (optional, only if known)",
      hint: "Fill in ONLY when status is identified/monitoring/resolved AND you actually know. Blank = the post says 'investigating' -- the model will not invent a cause.",
      required: false,
      kind: "text",
    },
  ],
  buildPrompt({ task, brain, inputs, overrides }) {
    const component = (inputs.component ?? "").trim();
    const symptom = (inputs.symptom ?? "").trim();
    const status = (inputs.current_status ?? "investigating").trim() || "investigating";
    const scope = (inputs.impact_scope ?? "").trim();
    const cadence = (inputs.update_cadence ?? "30 min").trim() || "30 min";
    const cause = (inputs.cause_summary ?? "").trim();

    const statusGuidance = (() => {
      switch (status) {
        case "identified":
          return "Status IDENTIFIED: only include a cause sentence if cause_summary above is non-empty. Otherwise the 'What we know' section says 'cause has been identified; engineers are working on the fix' WITHOUT specifics.";
        case "monitoring":
          return "Status MONITORING: state that the fix has been deployed and the team is watching for recurrence. Only include cause/fix specifics if cause_summary is non-empty.";
        case "resolved":
          return "Status RESOLVED: state the incident is resolved as of <approximate time -- founder fills in>. If cause_summary is non-empty, include a one-sentence summary. If a follow-up post-mortem is planned, the founder will add that via override or in the destination tool.";
        default:
          return "Status INVESTIGATING: this is the first post. 'What we know' section is short -- one sentence about when the symptom began, if known, otherwise just 'engineers are investigating'. DO NOT add fix-status language.";
      }
    })();

    const causeBlock = cause
      ? `Founder-supplied cause (use ONLY this; do NOT extend or paraphrase into root-cause speculation): ${cause}`
      : "No cause supplied. DO NOT invent one. The 'What we know' section says 'investigating' or, for non-investigating statuses, generic 'engineers are working the issue' phrasing.";

    const scopeBlock = scope
      ? `Impact scope (founder-supplied): ${scope}`
      : "Impact scope not yet known. The post should say 'we are assessing the scope of impact' rather than guessing.";

    return [
      "You are drafting a public incident status post for a software product. Tone: calm, factual, reassuring, capitalized. Goal: reduce uncertainty for affected users; commit to a cadence; do not overpromise.",
      "",
      productClause(brain.product),
      "",
      "VOICE-REGISTER OVERRIDE for incident posts:",
      "Regardless of brain.voice.register, this post is written in a calm, capitalized, emoji-free register. Vocabulary from voice.do_words and voice.dont_words still applies; glossary terms are still pinned; but tone-level register (playful, lowercase, irreverent) is OVERRIDDEN. A brand that's normally chatty still writes a calm incident post.",
      "",
      voiceClause(brain.voice),
      " (Vocabulary only -- register is overridden per above.)",
      "",
      glossaryClause(brain.glossary),
      "",
      `Founder framing: ${task}`,
      scopeBlock,
      causeBlock,
      "",
      statusGuidance,
      "",
      "Required structure (use these headings verbatim; omit a section only if explicitly allowed below):",
      "  # <Status>: <one-line headline naming component + symptom>",
      "  **Status:** <Investigating / Identified / Monitoring / Resolved>",
      "  **Started:** <approximate time or '[founder fills in]' placeholder>",
      "  **Components affected:** <component(s) -- user-facing names only, no internal service names>",
      "  **User impact:** <one sentence in plain language -- what users will see>",
      "  **What we know:** <constrained by statusGuidance above; for 'investigating' status this is one short sentence>",
      `  **Next update:** in ${cadence} (or sooner if there's new information)`,
      "",
      "Hard constraints:",
      "- NEVER commit to an ETA for resolution. Use the cadence line above instead.",
      "- NEVER write apologies that admit liability ('our negligence', 'we failed our customers', 'we caused data loss'). Use 'we know this is frustrating' or 'we're sorry for the disruption' framing.",
      "- NEVER invent a cause. If cause_summary is blank, the 'What we know' section stays short.",
      "- NEVER name an upstream vendor by brand. If translation is needed, use the role from brain.vendors ('our email-delivery provider', 'our CDN').",
      "- NEVER leak internal service names, error IDs, stack traces, or customer IDs even if they appear in the inputs.",
      "- NEVER use emoji in this post (overrides voice).",
      "- NEVER use exclamation points.",
      "- NEVER promise refunds, SLA credits, or compensation. Founder handles those separately.",
      "- NEVER use marketing superlatives ('lightning-fast', 'rock-solid', 'world-class').",
      "- Target: ~80-120 words for an Investigating post; longer is acceptable for Resolved.",
      "- NEVER use voice.dont_words.",
      "",
      overridesClause(overrides ?? []),
      "",
      CITATION_INSTRUCTION,
      "",
      OUTPUT_AS_PLAIN_MARKDOWN,
      "",
      `Component to write about: ${component || "(none specified)"}.`,
      `Symptom: ${symptom || "(none specified)"}.`,
      "",
      "Output only the status post markdown. No meta-commentary about the draft.",
    ]
      .filter(Boolean)
      .join("\n");
  },
};

registerSupportTemplate(template);
export default template;
