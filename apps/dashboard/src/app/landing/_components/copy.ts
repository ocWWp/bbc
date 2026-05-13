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
    // Headline renders as:
    //   <h1>{headline_lead} <span className="serif">{headline_serif}</span><br />{headline_tail}</h1>
    headline_lead: "Your AI doesn't know",
    headline_serif: "your company.",
    headline_tail: "BBC fixes that.",
    subhead:
      "One shared brain. Every AI tool — Claude, ChatGPT, Cursor, your role-specific assistants — cites the same answers about your team's decisions, voice, vendors, and people. Stop re-explaining your company every time.",
    // CTAs (Task 9 flips order so demo is primary, self-host is secondary).
    cta_primary_label: "Try the hosted demo →",
    cta_primary_href: "/auth/signin?demo=1",
    cta_secondary_label: "Self-host on Cloudflare ↗",
    cta_secondary_href: "https://github.com/ZethT/bbc",
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
      "Five layers, each one a moat. Notion is text; Claude Projects is context; BBC is auditable institutional knowledge that every AI tool reads the same.",
    /**
     * Tool names referenced in the moat layers below.
     * Each MUST have a matching entry in memory/ops/vendors.md.
     */
    referenced_tools: ["claude", "chatgpt", "cursor"] as const,
    layers: [
      {
        title: "Typed memory + queue gate",
        body: "Nine supertags. Every memory human-reviewed before commit. Notion is text; Claude Projects is context; BBC is auditable institutional knowledge.",
      },
      {
        title: "Role-shaped Studios",
        body: "Marketing, Eng, Founder, Designer, Support. Each Studio is pre-loaded with your brain and pre-equipped with the best tools for that role. You don't reconfigure for every task.",
      },
      {
        title: "Skill inheritance",
        body: "Skills extend abstract bases. Your tenant specializes. Override modes (replace / add / remove). A real type system for prompts, not flat Custom GPTs.",
      },
      {
        title: "Skill discovery (rule-based today)",
        body: "BBC matches installed skills and tools to your team's roles via the W4 recommender. You see what fits — you accept it. Phase N expands this to daily ecosystem crawling.",
      },
      {
        title: "MCP + REST",
        body: "Every AI tool reads the same brain — Claude, Cursor, ChatGPT, anything with MCP. One source of truth across the stack you already use.",
      },
    ],
  },
} as const;

export type LandingCopy = typeof LANDING_COPY;
