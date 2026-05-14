import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import type { StudioRole } from "@/lib/studio/template-id";
import { RoleSwitcher } from "./RoleSwitcher";

export type StudioShellProps = {
  role: StudioRole;
  tenantName: string;
  /** The actor's templateSlug, surfaced in the header as a chip. */
  templateSlug: string | null;
  /** CSS variable string (e.g. "#f59e0b" or "var(--accent)") applied as --studio-accent on the root. */
  accentColor: string;
  /** Role-specific prompt UI. Optional during the v1.5 wrap pass — Studios
   *  whose existing client renders its own prompt internally can skip this
   *  and put the entire client in `bodySlot`. Phase N extracts the prompt
   *  per-role. When null/undefined the prompt region is omitted from the DOM. */
  promptSlot?: ReactNode;
  /** Role-specific recent-drafts list. */
  recentDraftsSlot: ReactNode;
  /** Optional role-specific brain-context sidebar (voice summary, recent decisions, etc.). */
  sidebarSlot?: ReactNode;
  /** Optional role-specific main panel (Marketing's review grid, Founder's run output, etc.). */
  bodySlot?: ReactNode;
};

/**
 * Task 17: presentational shell shared across the five Studios.
 *
 * StudioShell is a *layout-only* component — no action state, no callbacks
 * apart from rendering its children. Each role's existing client owns the
 * action flow (Marketing's propose/run/config/review/override; Founder's
 * direct-run; etc.) and slots its render tree in here. This is the codex P2
 * constraint: behavioral state machines stay where they are. Only chrome
 * unifies.
 */
export function StudioShell({
  role,
  tenantName,
  templateSlug,
  accentColor,
  promptSlot,
  recentDraftsSlot,
  sidebarSlot,
  bodySlot,
}: StudioShellProps) {
  const style = { "--studio-accent": accentColor } as CSSProperties;

  return (
    <div className="studio-shell" data-role={role} style={style}>
      <header className="studio-shell-head">
        <div className="studio-shell-crumb">
          <Link href="/studio" className="studio-shell-tenant">
            {tenantName}
          </Link>
          <span className="studio-shell-sep">/</span>
          <span className="studio-shell-role" data-testid="studio-role-chip">
            <span className="studio-shell-dot" aria-hidden />
            {role}
          </span>
          {templateSlug && (
            <>
              <span className="studio-shell-sep">/</span>
              <span className="studio-shell-template mono">{templateSlug}</span>
            </>
          )}
        </div>
        <RoleSwitcher active={role} />
      </header>

      <div className="studio-shell-grid">
        {promptSlot ? (
          <section className="studio-shell-prompt" aria-label="prompt">
            {promptSlot}
          </section>
        ) : null}

        {sidebarSlot ? (
          <aside className="studio-shell-sidebar" aria-label="brain context">
            {sidebarSlot}
          </aside>
        ) : null}

        {bodySlot ? (
          <main className="studio-shell-body" aria-label="output">
            {bodySlot}
          </main>
        ) : null}

        <section className="studio-shell-drafts" aria-label="recent drafts">
          {recentDraftsSlot}
        </section>
      </div>
    </div>
  );
}
