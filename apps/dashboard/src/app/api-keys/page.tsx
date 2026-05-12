import { redirect } from "next/navigation";

/**
 * /api-keys was migrated to /settings/api-keys (Claude Design port).
 * This stub preserves bookmarks and links from welcome flow + landing
 * footer. Once the absorbed-routes migration completes, this file goes
 * away in favor of a next.config redirect.
 */
export default function ApiKeysRedirect() {
  redirect("/settings/api-keys");
}
