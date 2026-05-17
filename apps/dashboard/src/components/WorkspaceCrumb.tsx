import Link from "next/link";

/**
 * Breadcrumb root that shows the current workspace slug, linking back to /home.
 * Use as the first segment of any page-crumb. Previously every breadcrumb
 * hardcoded "acme" → /home; this centralizes the truth so a future slug
 * source (e.g. multi-workspace switcher) only needs to update one component.
 */
export function WorkspaceCrumb({ tenantSlug }: { tenantSlug: string }) {
  return <Link href="/home">{tenantSlug}</Link>;
}
