// Pure filtering for the gallery. Client-safe: imports no registry/side-effect
// modules, so "use client" components can import it freely.
import type { StudioRole } from "@/lib/studio/template-id";

// Structural shape the filter needs -- kept minimal and decoupled from
// GalleryTemplate so this module has zero registry coupling.
export type FilterableTemplate = {
  label: string;
  hint: string;
  roles: StudioRole[];
};

export type GalleryFilter = { query?: string; role?: StudioRole };

export function filterGallery<T extends FilterableTemplate>(
  templates: T[],
  filter: GalleryFilter,
): T[] {
  const q = filter.query?.trim().toLowerCase();
  return templates.filter((t) => {
    if (filter.role && !t.roles.includes(filter.role)) return false;
    if (q && !`${t.label} ${t.hint}`.toLowerCase().includes(q)) return false;
    return true;
  });
}
