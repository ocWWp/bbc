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
    // Tasks 8-11 fill these in. Sketch keys to make the contract visible.
    headline: "" as string,
    subhead: "" as string,
    cta_primary: "" as string,
    cta_secondary: "" as string,
  },
  walkthrough: {
    title: "" as string,
    steps: [] as Array<{ title: string; body: string }>,
  },
  moat: {
    title: "" as string,
    body: "" as string,
    /**
     * The end-user-facing tool names referenced in the moat section.
     * Each MUST have an entry in memory/ops/vendors.md.
     */
    referenced_tools: [] as Array<"claude" | "chatgpt" | "cursor">,
  },
} as const;

export type LandingCopy = typeof LANDING_COPY;
