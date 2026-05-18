/**
 * Landing-page copy module.
 *
 * Voice rules: derive from `memory/design/voice-tone.md` (the canonical
 * voice source). Public-marketing exemption: the landing page may use
 * punchier phrasing than internal product UI, but must not contradict
 * the canonical voice rules.
 *
 * Vendor names: any vendor referenced here (Claude, ChatGPT, Cursor,
 * Supabase, Cloudflare, etc.) must have a corresponding entry in
 * `memory/ops/vendors.md` cited by role (`llm-provider`, `db-provider`,
 * `mcp-client`, etc.). End-user-facing tool names (Claude, ChatGPT,
 * Cursor) are allowed because the BBC moat depends on naming the tools
 * a founder might bring. Do NOT add a new vendor name to this file
 * without first adding it to `vendors.md`.
 *
 * Tasks 8-11 (later in the v1.5 plan) populate the remaining sections.
 * This file is the contract; landing components import `LANDING_COPY`
 * instead of inlining strings.
 *
 * Per CLAUDE.md non-negotiable principles #4 (vendor names) and #5
 * (single-source voice).
 */

export const LANDING_COPY = {
  hero: {
    eyebrow: "open source · AGPLv3 · self-hosted or hosted demo",
    // Headline renders as two visual lines: `{lead}` then `{serif}`.
    // `tail` is optional; when set it adds a third line.
    headline_lead: "the company brain for your team",
    headline_serif: "and their agents.",
    headline_tail: "",
    subhead:
      "open-source typed memory. one source of truth across claude, cursor, and the studio agents you wire up.",
    // CTAs: deploy primary (per brief), github secondary, hosted demo as tertiary text link.
    cta_primary_label: "deploy to cloudflare",
    cta_primary_href:
      "https://deploy.workers.cloudflare.com/?url=https://github.com/ocWWp/bbc",
    cta_secondary_label: "github",
    cta_secondary_href: "https://github.com/ocWWp/bbc",
    cta_tertiary_label: "try the hosted demo →",
    cta_tertiary_href: "/auth/signin?demo=1",
  },
  walkthrough: {
    // Task 10: the section-blurb under "how it works".
    blurb_lead:
      "the entire path from “a slack thread happened” to “an agent answers correctly” is three deterministic steps. click through them.",
    // Loop-3 line — true-to-v1.5 framing per codex pass: today rule-based
    // suggestions, future tense for self-proposing brain.
    loop3_promise:
      "BBC learns. It watches what your team actually accepts and rejects, and suggests improvements you approve with one click. Today: new skills + tools matched to your roles. Soon: the brain proposes its own next page.",
  },
  moat: {
    title: "Why BBC",
    intro:
      "notion is text. claude projects is context. bbc is typed memory. same answer for every tool that reads it.",
    /**
     * Tool names referenced in the moat layers below.
     * Each MUST have a matching entry in memory/ops/vendors.md.
     */
    referenced_tools: ["claude", "chatgpt", "cursor"] as const,
    layers: [
      {
        title: "typed, not text",
        body: "nine supertags — voice, decision, vendor, team, glossary, and four more. a human approves every one before it lands.",
      },
      {
        title: "one agent per role",
        body: "marketing, eng, founder, designer, support. each one comes with the brain pre-loaded and the right tools wired up. no reconfiguring per task.",
      },
      {
        title: "skills you can customize",
        body: "prompts and how-tos extend a shared base. your team can replace, add, or remove. a real type system for prompts, not flat copies like custom gpts.",
      },
      {
        title: "it suggests what's missing",
        body: "bbc sees which skills and tools fit your roles and proposes them. rule-based today. ecosystem crawler later. you accept one click at a time.",
      },
      {
        title: "every ai reads the same brain",
        body: "claude, cursor, chatgpt — anything that speaks mcp. same answers, every tool. or hit the rest endpoint.",
      },
    ],
  },
} as const;

export type LandingCopy = typeof LANDING_COPY;
