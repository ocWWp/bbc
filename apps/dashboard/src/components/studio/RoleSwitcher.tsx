import Link from "next/link";
import { STUDIO_ROLES, type StudioRole } from "@/lib/studio/template-id";

// Most role labels are just the capitalized key; a few read better with an
// override (the "hr" key surfaces as "People", matching the Studio name).
const ROLE_LABEL_OVERRIDES: Partial<Record<StudioRole, string>> = {
  hr: "People",
};

function roleLabel(role: StudioRole): string {
  return ROLE_LABEL_OVERRIDES[role] ?? role.charAt(0).toUpperCase() + role.slice(1);
}

/**
 * Inter-role nav, rendered once by StudioShell in the page header. Lets a user
 * mid-demo hop between role Studios (and back to /studio) without bouncing
 * through the chooser. Single source — clients never render this; that inline
 * duplication is what got the v1.5 shell wrap reverted.
 */
export function RoleSwitcher({ active }: { active: StudioRole }) {
  return (
    <nav
      aria-label="Studio roles"
      className="flex items-center gap-1.5 text-xs flex-wrap justify-end"
    >
      <Link
        href="/studio"
        className="rounded-full border px-2.5 py-1 text-muted-foreground hover:text-foreground transition-colors"
      >
        ← all
      </Link>
      {STUDIO_ROLES.map((r) => {
        const isActive = r === active;
        return (
          <Link
            key={r}
            href={`/studio/${r}`}
            aria-current={isActive ? "page" : undefined}
            className={
              "rounded-full border px-2.5 py-1 transition-colors " +
              (isActive
                ? "border-foreground/40 bg-foreground/5 text-foreground font-medium"
                : "text-muted-foreground hover:text-foreground")
            }
          >
            {roleLabel(r)}
          </Link>
        );
      })}
    </nav>
  );
}
