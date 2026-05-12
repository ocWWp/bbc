/**
 * Shared data for the landing page. Adapted from the BBC design prototype.
 *
 * Important: this content is illustrative — it tells the BBC story (three loops,
 * typed memory, MCP) but does NOT load from the user's actual brain. The real
 * dashboard at /app does that. This file is marketing copy.
 */

export type SupertagKey =
  | "voice"
  | "decision"
  | "vendor"
  | "team"
  | "product"
  | "glossary"
  | "skill"
  | "source_artifact"
  | "note";

export const SUPERTAGS: ReadonlyArray<{
  key: SupertagKey;
  color: string;
  count: number;
  desc: string;
}> = [
  { key: "voice",           color: "var(--t-voice)",           count: 14, desc: "tone, phrasing rules, words you never use" },
  { key: "decision",        color: "var(--t-decision)",        count: 41, desc: "ADR-style 'we chose X because Y' records" },
  { key: "vendor",          color: "var(--t-vendor)",          count: 23, desc: "external services in use, with credentials handle" },
  { key: "team",            color: "var(--t-team)",            count: 9,  desc: "people, roles, who owns what" },
  { key: "product",         color: "var(--t-product)",         count: 17, desc: "features, surfaces, what the thing does" },
  { key: "glossary",        color: "var(--t-glossary)",        count: 28, desc: "domain terms with one canonical definition" },
  { key: "skill",           color: "var(--t-skill)",           count: 11, desc: "how-tos: 'to do X, run Y, then Z'" },
  { key: "source_artifact", color: "var(--t-source_artifact)", count: 62, desc: "raw inputs the memories were extracted from" },
  { key: "note",            color: "var(--t-note)",            count: 19, desc: "things to remember that don't fit elsewhere" },
];

export type Memory = {
  id: string;
  tag: SupertagKey;
  body: string;
  source: string;
  date: string;
  status: "approved" | "pending";
};

export const MEMORIES: ReadonlyArray<Memory> = [
  { id: "mem_018a3c", tag: "voice",        body: "use lowercase in social copy. avoid 'leverage', 'synergy', 'unlock', 'seamless'. dashes over semicolons.", source: "voice-guide.md", date: "2026-04-12", status: "approved" },
  { id: "mem_018a3d", tag: "decision",     body: "chose <code>Supabase RLS</code> over a separate auth service. simpler audit, one Postgres to back up.", source: "adr/0004-two-deployment-modes.md", date: "2026-03-02", status: "approved" },
  { id: "mem_018a3e", tag: "vendor",       body: "Resend for transactional email. API key in <code>RESEND_KEY</code>. 100/day on free tier.", source: "slack #ops · 4/22", date: "2026-04-22", status: "approved" },
  { id: "mem_018a3f", tag: "team",         body: "the maintainer is solo. every loop has to be runnable by one person.", source: "founders.md", date: "2026-01-18", status: "approved" },
  { id: "mem_018a40", tag: "product",      body: "Marketing Studio composes social posts from approved <code>voice</code> + <code>decision</code> memories.", source: "adr/0006-marketing-studio.md", date: "2026-04-01", status: "approved" },
  { id: "mem_018a41", tag: "glossary",     body: "<em>brain-dump</em> — an unstructured blob (Slack export, doc, notes) BBC parses into typed memories.", source: "docs/glossary", date: "2026-02-11", status: "approved" },
  { id: "mem_018a42", tag: "skill",        body: "to seed a new instance: deploy to Cloudflare, paste a brain-dump at <code>/welcome</code>, accept the typed candidates.", source: "README.md §quickstart", date: "2026-04-28", status: "approved" },
  { id: "mem_018a43", tag: "decision",     body: "no vector store. retrieval is by supertag + filter, not similarity. ambiguity is a parse error, not a ranking.", source: "adr/0008-three-loop-architecture.md", date: "2026-05-12", status: "approved" },
  { id: "mem_018a44", tag: "note",         body: "Loop 3 (BBC proposes changes to the host company) needs a privacy ADR before any code.", source: "founders' notebook", date: "2026-05-12", status: "pending" },
];

export const DUMP_TEXT = `# notes from the planning call · 05/12

three loops compound on top of each other. Loop 1 (ingest) is the wedge — typed memory in, accepted by humans. shipped.

Loop 2 (act) is the pattern — role agents (marketing, founder, eng, design) each pre-loaded with the company brain AND a role-optimal tool kit (marketing gets Higgsfield + n8n, eng gets GitHub + Sentry). Marketing Studio is the first instance; second role agent unlocks the pattern.

Loop 3 (improve) is the wedge that compounds — BBC watches how the team uses the brain, then files improvement proposals about the company itself, not just its own code. needs ADR scoping privacy before any code.

voice on the launch: matter-of-fact, lowercase, no buzzwords. say what we built. cite the ADRs.

stack we're committed to:
- supabase postgres with RLS (ADR-0004)
- claude as default LLM, BYOK supported
- AGPLv3, no monetization in v1 (ADR-0007)
- self-hosted first, hosted demo on Cloudflare`;

export type Extracted = { tag: SupertagKey; body: string; source: string };

export const EXTRACTED: ReadonlyArray<Extracted> = [
  { tag: "decision", body: "BBC is three compounding loops — Ingest → Act → Improve. v1 ships Loop 1 end-to-end and the first Loop 2 instance.", source: "planning-call · 05/12" },
  { tag: "voice",    body: "matter-of-fact, lowercase, no buzzwords. say what we built. cite the ADRs.", source: "planning-call · 05/12" },
  { tag: "decision", body: "<strong>AGPLv3</strong>. no monetization in v1. ADR-0007 supersedes earlier monetization framing.", source: "planning-call · 05/12" },
  { tag: "decision", body: "no vector store. retrieval is by-type, never by similarity. ambiguity is a parse error.", source: "planning-call · 05/12" },
  { tag: "product",  body: "every role agent comes with a brain AND a role-optimal tool kit. Marketing Studio is the first instance.", source: "planning-call · 05/12" },
  { tag: "note",     body: "Loop 3 (company improvement) needs a privacy ADR before any code.", source: "planning-call · 05/12" },
];

export type StudioOutput = {
  channel: string;
  icon: string;
  text: string;
  cites: string[];
};

export const STUDIO: ReadonlyArray<StudioOutput> = [
  {
    channel: "x", icon: "X",
    text: "announcing bbc — open-source typed memory for your team and your AI agents.\n\nnine supertags. every memory human-reviewed. queries by type, not similarity. AGPLv3.\n\ndocs + repo in replies.",
    cites: ["mem_018a43", "mem_018a40", "voice"],
  },
  {
    channel: "linkedin", icon: "in",
    text: "Today we're launching BBC — an open-source structured company brain.\n\nThree compounding loops: brain-dumps in, role-scoped AI agents query out, BBC files improvement proposals back. Built on Postgres + RLS. AGPLv3.",
    cites: ["mem_018a43", "decision", "product"],
  },
  {
    channel: "threads", icon: "@",
    text: "shipped typed memory. nine supertags. human-reviewed. self-hosted. AGPLv3.\n\nthe company brain your agents have been missing.",
    cites: ["voice", "mem_018a43"],
  },
];
