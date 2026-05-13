import Link from "next/link";

/**
 * Inter-role nav for /studio/<role> pages. Renders five small chips above the
 * studio header so a user mid-demo can hop from Founder → Marketing → Eng
 * without bouncing back to /studio. The chooser page (/studio) doesn't render
 * this — it's already the picker.
 *
 * Active role gets a foreground tone; the others stay muted. Each chip routes
 * to /studio/<slug>; the "back" chip routes to /studio (the chooser).
 */

export type StudioRole = "support" | "engineering" | "marketing" | "founder" | "designer";

const ROLES: { slug: StudioRole; label: string }[] = [
  { slug: "support", label: "Support" },
  { slug: "engineering", label: "Engineering" },
  { slug: "marketing", label: "Marketing" },
  { slug: "founder", label: "Founder" },
  { slug: "designer", label: "Designer" },
];

export function RoleSwitcher({ active }: { active: StudioRole }) {
  return (
    <nav
      aria-label="Studio roles"
      className="mb-6 flex items-center gap-1.5 text-xs sm:text-[13px] flex-wrap"
    >
      <Link
        href="/studio"
        className="rounded-full border px-2.5 py-1 text-muted-foreground hover:text-foreground transition-colors"
      >
        ← all studios
      </Link>
      <span className="text-muted-foreground/40">/</span>
      {ROLES.map((r) => {
        const isActive = r.slug === active;
        return (
          <Link
            key={r.slug}
            href={`/studio/${r.slug}`}
            aria-current={isActive ? "page" : undefined}
            className={
              "rounded-full border px-2.5 py-1 transition-colors " +
              (isActive
                ? "border-foreground/40 bg-foreground/5 text-foreground font-medium"
                : "text-muted-foreground hover:text-foreground")
            }
          >
            {r.label}
          </Link>
        );
      })}
    </nav>
  );
}
