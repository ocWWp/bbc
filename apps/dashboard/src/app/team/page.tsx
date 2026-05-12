import { redirect } from "next/navigation";

/**
 * /team was migrated to /settings/team (Claude Design port).
 * Preserves bookmarks and links from external sources.
 */
export default function TeamRedirect() {
  redirect("/settings/team");
}
