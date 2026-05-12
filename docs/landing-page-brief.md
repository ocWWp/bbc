# Landing page brief — bbc.tools

Paste this into a design tool. Product-only, no aesthetic prescriptions. Reflects [ADR-0008 three-loop architecture](../memory/decisions/0008-three-loop-architecture.md).

---

## Design a landing page for BBC ("Big Brain Company").

### What it is

An open-source company brain. Three things happen on top of it:

1. Your team **dumps unstructured stuff into BBC** — Slack threads, README files, decisions made over coffee, brand voice rules, vendor choices, hiring rubrics, anything. BBC structures it into typed memory — voice, decision, vendor, product, team, glossary, skill, source artifact, note. Every memory is human-reviewed before it commits.
2. Your **AI agents read from that brain deterministically.** Each role on the team — founder, engineering, marketing, design — gets its own agent with the brain pre-loaded. The marketing agent already knows your voice. The eng agent already knows your tech-stack decisions. No "let me explain our company for the 50th time."
3. Over time, **BBC files improvement proposals about your company** back into the same queue your team uses. "Your eng team has rejected 8 of 10 vendor proposals from marketing — there's a misaligned decision authority, want to formalize it?" "Companies your size typically have a documented hiring rubric, you don't, want a draft?" "A new agentic skill 'pricing-page-audit' shipped this week, fits your profile, add it?" Humans accept or reject every one.

Self-hosted under AGPLv3. Hosted demo at bbc.tools running on Cloudflare. No SaaS billing in v1 — bring your own API key, or use the small free quota.

### Who it's for

Technical founders and 1-10 person teams building AI-heavy products. The kind of person who reads Hacker News, has strong opinions about RLS vs ORMs, and gets frustrated when their AI agent doesn't know who their CTO is or what their refund policy says. They run small companies that are growing fast and feeling the pain of context loss — between Slack, Notion, Cursor, and three different LLMs that all need to be onboarded again every week.

### The wedge

Most "agent memory" products are vector stores — they retrieve fuzzy approximations of what was said. BBC is the opposite: brain-dumps are extracted into typed supertags, every memory is human-reviewed, and agents query by type. The difference between "what's our refund policy?" returning **one answer** versus three vaguely-related paragraphs.

### Three concrete things you do with it

1. **Paste a brain-dump** (Slack export, founder's notes, a product PRD). BBC extracts 15-30 typed memory entries in 30 seconds. You approve each one.
2. **Spin up the Marketing Studio.** Type *"announce our seed round"*. It generates an X post + LinkedIn post + Threads post, all in your brand voice, all citing the memories that shaped them.
3. **Wire a Claude or GPT agent** to your BBC instance via the MCP server. The agent answers *"what's our voice on Twitter?"* deterministically instead of hallucinating.

That's v1. The next chapter (already designed, building soon) is the role-agent expansion — your founder agent, eng agent, designer agent — each with the brain pre-loaded. The chapter after that is BBC proposing changes to your company's operations.

### Vibe of the customer

Lowercase. Allergic to "leverage" and "synergy." Reads ADRs for fun. Has a `~/.claude/CLAUDE.md` file. Closes the tab if the hero says "supercharge your team's productivity."

### Stack-level facts (for credibility section)

TypeScript + Next.js 16, Supabase Postgres + Row-Level Security, Anthropic Claude as the default LLM (BYOK supported), AES-256-GCM encryption for stored secrets, deploy via OpenNext + Cloudflare Workers, AGPLv3.

### Must-haves on the page

- **A hero** that explains the wedge in one sentence without buzzwords. Three-loop arc hinted: "the company brain that gets your team and your AI agents on the same page — and proposes the next page"
- **A "this is what it looks like in your repo / brain" moment** — concrete preview of the typed memory list (VOICE / DECISION / VENDOR / GLOSSARY chips), not abstract diagrams
- **A 3-step walkthrough** — Loop 1 (brain-dump → typed memory) shown end-to-end. Loops 2 & 3 mentioned in framing but not necessarily drawn in detail
- **A "why not just use a vector store?" section** that names the obvious objection and handles it
- **A code / CLI snippet section** — this is the audience, they want to see the seams
- **A "what's next" or roadmap teaser** — the three-loop framing as the arc, with v1 = Loop 1 done, Loop 2 in progress, Loop 3 coming
- **Two CTAs:** **Deploy to Cloudflare** (one-click self-host) and **GitHub** (star the repo). Hosted demo link as a secondary
- **An "open source" footer** with AGPLv3 + a link to the spec

### Do NOT include

- Trust-bar logos of fake companies
- "Loved by 10,000+ teams"
- Pricing tiers (the product is free)
- A gradient sphere
- The phrase "AI-powered"
- Anything that screams Notion clone or generic SaaS template
- A "watch the demo" hero video unless it's actually a real screen recording — fakes are obvious to this audience

### Tone

Like a Stripe docs page wrote it after a long conversation with a database engineer.
