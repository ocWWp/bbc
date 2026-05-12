import { redirect } from "next/navigation";

/**
 * /skills was migrated to /settings/skills (Claude Design port).
 * Stub preserves bookmarks and any /skills links in older docs.
 */
export default function SkillsRedirect() {
  redirect("/settings/skills");
}
