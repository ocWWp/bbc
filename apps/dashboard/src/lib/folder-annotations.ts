/**
 * Short comments for important folders. Keyed by path relative to BBC repo root
 * (matches FolderEntry.rel_path). One-liner each — if you find yourself writing
 * a paragraph here, that folder belongs in a docs page instead.
 */
export const FOLDER_ANNOTATIONS: Record<string, string> = {
  // Root + top-level
  "": "the BBC root — this whole tree is the company brain",
  ".claude": "slash commands & local Claude config",
  ".claude/commands": "where /bbc:* runbooks live (status, propose, review, accept, …)",
  ".claude/commands/bbc": "one .md per slash command",
  ".planning": "GSD-style phase tracking (PROJECT, ROADMAP, STATE + per-phase dirs)",
  ".planning/phases": "one dir per phase, each with PLAN.md + SUMMARY.md",
  ".planning/research": "pre-phase research outputs (pre-/gsd:plan-phase)",
  ".planning/codebase": "/gsd:map-codebase outputs",
  ".planning/debug": "/gsd:debug session state",
  ".planning/quick": "/gsd:quick state",
  "_log": "append-only versioned ops log + heartbeat + LKG pointer (F3)",
  "distribution": "leaves — one subdir per workstream",
  "distribution/_template": "copy this to start a new leaf",
  "distribution/8azi-web": "frontend leaf (migrated in M1)",
  "distribution/dashboard": "this dashboard's own leaf",
  "manager": "Manager layer — rules + sub-agents + queue review",
  "manager/agents": "sub-agent definitions Manager spawns (queue-reviewer, etc.)",
  "manager/rules": "Manager-owned rules cited during proposal review",
  "memory": "durable knowledge — the source of truth for the org",
  "memory/decisions": "ADRs; immutable once accepted",
  "memory/design": "voice, taste, brand principles",
  "memory/glossary": "canonical terms (Mr. 8aZi, Nayin, Diagnose, …)",
  "memory/ops": "operational facts: vendors, providers, bindings, profiles",
  "memory/ops/external-skills": "library — descriptions for pinned external skills",
  "memory/ops/provider-roles": "F4 role contracts (llm-provider, db-provider, …)",
  "memory/ops/providers": "F4 adapter declarations (one per vendor)",
  "memory/ops/providers/_archived": "decommissioned adapters (kept for history)",
  "memory/ops/profiles": "F1 ranker profiles (org-policy, marketing, engineering)",
  "memory/ops/outcomes": "F1 outcome log per adapter",
  "memory/people": "team and roles",
  "memory/product": "vision + PRD excerpts",
  "memory/skills": "F2 skill hierarchy (abstract / general / leaf)",
  "memory/skills/_abstract": "F2 abstract bases — contracts only, not invocable",
  "memory/skills/general": "F2 concrete org-wide skills",
  "memory/skills/marketing": "F2 marketing-leaf specializations",
  "memory/skills/8azi-web": "F2 web-leaf specializations",
  "memory/skills/8azi-api": "F2 api-leaf specializations",
  "memory/tech": "stack overview (frameworks + role bindings)",
  "queue": "proposal queue: pending at top, _accepted/ + _rejected/ archives",
  "scripts": "bash + python — propose, accept, reject, bootstrap-leaf, rank, log-emit, …",
};

export function annotationFor(rel: string): string | undefined {
  // Normalize: drop leading ./ and trailing /
  const key = rel.replace(/^\.\//, "").replace(/\/$/, "");
  return FOLDER_ANNOTATIONS[key];
}

/** Paths to expand by default on first render. Keeps the tree informative without overwhelming. */
export const DEFAULT_EXPANDED = new Set<string>([
  "",
  "memory",
  "manager",
  "distribution",
]);
