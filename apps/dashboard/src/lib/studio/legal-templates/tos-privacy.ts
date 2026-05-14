import {
  decisionsClause,
  glossaryClause,
  overridesClause,
  LEGAL_CITATION_INSTRUCTION,
  LEGAL_REVIEW_CONTRACT,
  outputAsDoc,
  type Template,
} from "./types";
import { registerLegalTemplate } from "./registry";

const template: Template = {
  id: "legal:tos-privacy",
  label: "ToS & privacy",
  hint: "Draft terms of service or a privacy policy. Picks this for 'terms of service for the app', 'privacy policy', 'website legal pages'.",
  kind: "doc",
  firstUseInputs: [
    {
      id: "document",
      label: "Which document",
      hint: "Terms of Service, Privacy Policy, or both? Say which one(s) you need.",
      required: true,
      kind: "text",
    },
    {
      id: "product",
      label: "Product & data",
      hint: "What is the product, and what user data does it collect/process? (e.g. 'a B2B SaaS dashboard; collects email, usage analytics, uploaded files')",
      required: true,
      kind: "text",
    },
    {
      id: "context",
      label: "Specifics",
      hint: "Where are your users (US / EU / global)? Subprocessors, payment provider, anything pre-decided. This drives which regulations apply.",
      required: false,
      kind: "text",
    },
  ],
  buildPrompt({ task, brain, inputs, overrides }) {
    return [
      "You are drafting terms-of-service / privacy-policy documents for a startup. Privacy law is jurisdiction-specific and regulator-enforced — this is the highest-risk legal document type. Anchor to standard structures and flag every jurisdictional dependency.",
      LEGAL_REVIEW_CONTRACT,
      "",
      decisionsClause(brain.recent_decisions),
      glossaryClause(brain.glossary),
      "",
      `Task: ${task}`,
      `Which document: ${inputs.document ?? "(unspecified)"}`,
      `Product & data: ${inputs.product ?? "(unspecified)"}`,
      inputs.context ? `Specifics: ${inputs.context}` : "",
      "",
      "Produce the requested document(s). For a Privacy Policy use this structure:",
      "  DRAFT — not legal advice. For attorney review before use.",
      "  ",
      "  # Privacy Policy",
      "  ",
      "  1. **What we collect** — enumerate the actual data categories from the input.",
      "  2. **How we use it**",
      "  3. **Legal bases** — flag this as jurisdiction-dependent (GDPR requires it,",
      "     others don't). Mark [JURISDICTION-DEPENDENT].",
      "  4. **Sharing & subprocessors** — who else touches the data.",
      "  5. **User rights** — access, deletion, portability. Note these vary by",
      "     jurisdiction (GDPR, CCPA, others). Mark [JURISDICTION-DEPENDENT].",
      "  6. **Retention**",
      "  7. **Security**",
      "  8. **Contact & changes**",
      "  ",
      "  For Terms of Service: parties/acceptance, the service & license, acceptable",
      "  use, payment (if any), disclaimers & limitation of liability, termination,",
      "  governing law [BRACKETED], changes.",
      "  ",
      "  ## Before you use this",
      "  Every bracketed value, EVERY [JURISDICTION-DEPENDENT] clause called out, the",
      "  list of regulations that may apply (GDPR / CCPA / others) for an attorney to",
      "  confirm, and a clear statement that this document type must not be self-served.",
      "",
      "Constraints:",
      "- Only describe data practices the user actually stated. Do not invent data",
      "  collection, subprocessors, or features.",
      "- Mark every clause whose content depends on jurisdiction with [JURISDICTION-DEPENDENT].",
      "- Do not claim the document is compliant with any regulation — you cannot know that.",
      LEGAL_CITATION_INSTRUCTION,
      overridesClause(overrides ?? []),
      "",
      outputAsDoc("ToS & Privacy"),
    ]
      .filter(Boolean)
      .join("\n");
  },
};

registerLegalTemplate(template);
export default template;
