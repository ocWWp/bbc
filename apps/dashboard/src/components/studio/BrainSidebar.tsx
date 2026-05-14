import Link from "next/link";
import type { RoleShape } from "@/lib/studio/role-shapes";
import type { BrainSummary } from "@/lib/studio/templates/types";

export type BrainSidebarProps = {
  shape: RoleShape;
  brain: BrainSummary;
};

/**
 * Task 22: per-role brain-context sidebar. Each Studio's page passes a
 * BrainSummary plus its RoleShape; this component renders the configured
 * sidebarSections, hiding any section whose itemsFromBrain returns empty.
 *
 * Pure render — no fetch, no state. Same component for every role; per-role
 * shape comes from ROLE_SHAPES in apps/dashboard/src/lib/studio/role-shapes.ts.
 */
export function BrainSidebar({ shape, brain }: BrainSidebarProps) {
  const sections = shape.sidebarSections
    .map((section) => ({ section, items: section.itemsFromBrain(brain) }))
    .filter(({ items }) => items.length > 0);

  if (sections.length === 0) {
    return (
      <div className="studio-brain-empty" data-testid="brain-sidebar-empty">
        Add memories at <Link href="/brain">/brain</Link> to ground this Studio.
      </div>
    );
  }

  return (
    <div className="studio-brain-sidebar" data-testid="brain-sidebar">
      {sections.map(({ section, items }) => (
        <section key={section.heading} className="studio-brain-section">
          <h3 className="studio-brain-heading">{section.heading}</h3>
          <ul className="studio-brain-list">
            {items.map((item) => (
              <li key={item.id}>
                <Link href={item.href} className="studio-brain-link">
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
