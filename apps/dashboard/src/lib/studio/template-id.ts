// Studio role <-> template_id prefix mapping.
//
// All studio templates are namespaced by role prefix:
//   marketing:tweet-thread, eng:adr-draft, founder:weekly-recap,
//   design:visual-spec, support:bug-ack, finance:runway-analysis,
//   legal:nda
//
// Marketing was historically unprefixed; Task 0e (v1.5 launch polish)
// migration 0041 backfilled the prefix into existing studio_runs +
// studio_template_overrides rows so this helper can use a single
// `like` pattern per role.

export const ROLE_PREFIXES = {
  marketing: "marketing:",
  engineering: "eng:",
  founder: "founder:",
  designer: "design:",
  support: "support:",
  finance: "finance:",
  legal: "legal:",
} as const;

export type StudioRole = keyof typeof ROLE_PREFIXES;

export const STUDIO_ROLES: StudioRole[] = Object.keys(ROLE_PREFIXES) as StudioRole[];

/** Returns the role that owns the given template_id, or null when unprefixed. */
export function roleForTemplateId(templateId: string): StudioRole | null {
  for (const role of STUDIO_ROLES) {
    if (templateId.startsWith(ROLE_PREFIXES[role])) return role;
  }
  return null;
}

/**
 * Returns a Postgres LIKE pattern matching all template_ids owned by the role.
 * Example: templateIdsForRole("marketing") -> "marketing:%"
 * Use with `.like("template_id", templateIdsForRole(role))` in supabase queries.
 */
export function templateIdsForRole(role: StudioRole): string {
  return `${ROLE_PREFIXES[role]}%`;
}
