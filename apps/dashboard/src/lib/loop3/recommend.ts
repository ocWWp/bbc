// v1.5 D-W4-2: rule-based recommender for Loop 3 v1.
//
// Pure function: takes a Signal (counts + presence) and emits Recommendation
// rows. Persistence + dedupe + cooldown + cap live in lib/loop3/lifecycle.ts
// (D-W4-3). Cross-tenant signal is explicitly deferred to v1.1 per ADR-0009.
//
// Per design §5: rule-based for v1.5. No learning, no embeddings. The whole
// point is something we can reason about deterministically when a user asks
// "why is this in my recommendations?"
//
// Rules wire to the W4-2 acceptance fixtures from the launch plan:
//   - marketing profile + 0 marketing skills → recommends marketing built-ins
//   - 5+ decisions and no GitHub installed → recommends GitHub
// Plus a handful of analogous "obvious next thing" rules.

import type { Supertag } from "@/lib/memory/types";
import { recommendConnectors } from "./recommend-connector";

// --------------------------------------------------------------------------
// Public types
// --------------------------------------------------------------------------

export type SkillRole = "marketing" | "engineering" | "founder" | "designer" | "support";

export type Signal = {
  /** Roles the tenant is active in (from profile + memory). Empty = unknown,
   *  treated as "all 5 roles" by the engine. */
  tenant_roles: SkillRole[];
  /** Count of installed skills per role. Missing role = 0. */
  installed_skills_by_role: Partial<Record<SkillRole, number>>;
  /** Set of installed connector ids (framework ids: 'github', 'notion', etc). */
  installed_connectors: Set<string>;
  /** Count of memory_files rows per supertag. Missing supertag = 0. */
  memory_counts_by_type: Partial<Record<Supertag, number>>;
};

export type RecommendationTargetKind = "skill" | "connector" | "provider";

export type Recommendation = {
  target_kind: RecommendationTargetKind;
  /** Stable identifier — for skills, the catalog id ('sk_001'); for connectors,
   *  the framework id ('github'). Used as part of the dedupe key. */
  target_id: string;
  /** Machine code for telemetry + analytics ('role_gap_marketing'). */
  reason_code: string;
  /** User-facing one-liner shown under "why this?". */
  reason_human: string;
  /** Raw signal that triggered the rule — recorded for debugging. */
  observed_signal: Record<string, unknown>;
};

// --------------------------------------------------------------------------
// Catalog of built-in skill recommendations per role
// --------------------------------------------------------------------------

/** Per-role, the catalog id of the built-in BBC skill we recommend first when
 *  the role has zero installed skills. Stays in sync with _data.ts SKILLS — if
 *  you rename the catalog ids, update this map. */
const BUILTIN_SKILL_PER_ROLE: Record<SkillRole, { id: string; label: string }> = {
  marketing:   { id: "sk_001", label: "Launch-post writer" },
  engineering: { id: "sk_002", label: "Postmortem author" },
  founder:     { id: "sk_003", label: "Weekly investor recap" },
  designer:    { id: "sk_004", label: "Spec writer" },
  support:     { id: "sk_005", label: "Reply drafter" },
};

const ALL_ROLES: SkillRole[] = ["marketing", "engineering", "founder", "designer", "support"];

// --------------------------------------------------------------------------
// Engine
// --------------------------------------------------------------------------

export function recommend(signal: Signal): Recommendation[] {
  const out: Recommendation[] = [];
  out.push(...recommendSkills(signal));
  out.push(...recommendConnectors(signal));
  return out;
}

/** Role-gap rule: any active role with zero installed skills → recommend the
 *  default built-in for that role. Empty tenant_roles = treat as "all 5". */
export function recommendSkills(signal: Signal): Recommendation[] {
  const roles = signal.tenant_roles.length > 0 ? signal.tenant_roles : ALL_ROLES;
  const out: Recommendation[] = [];
  for (const role of roles) {
    const installed = signal.installed_skills_by_role[role] ?? 0;
    if (installed === 0) {
      const builtin = BUILTIN_SKILL_PER_ROLE[role];
      out.push({
        target_kind: "skill",
        target_id: builtin.id,
        reason_code: `role_gap_${role}`,
        reason_human: `You're active in ${role} but haven't installed a ${role} skill — try ${builtin.label}.`,
        observed_signal: { role, installed_count: 0 },
      });
    }
  }
  return out;
}
