// Shared, client-safe presentational data for each studio role: short label,
// 2-letter glyph, and the supertag hue the role renders in. Hues map onto
// BBC's existing --t-* palette -- no new colors invented. Used by the gallery
// and the plan-confirm stage. Insertion order sets gallery chip order.

import type { StudioRole } from "@/lib/studio/template-id";

export type StudioPresentation = { label: string; glyph: string; tint: string };

export const STUDIO_PRESENTATION: Record<StudioRole, StudioPresentation> = {
  finance: { label: "Finance", glyph: "Fi", tint: "var(--t-vendor)" },
  legal: { label: "Legal", glyph: "Lg", tint: "var(--t-note)" },
  hr: { label: "People", glyph: "Pe", tint: "var(--t-team)" },
  marketing: { label: "Marketing", glyph: "Mk", tint: "var(--t-voice)" },
  engineering: { label: "Engineering", glyph: "En", tint: "var(--t-decision)" },
  founder: { label: "Founder", glyph: "Fo", tint: "var(--t-skill)" },
  designer: { label: "Designer", glyph: "Ds", tint: "var(--t-product)" },
  support: { label: "Support", glyph: "Sp", tint: "var(--t-glossary)" },
};

export const ROLE_ORDER = Object.keys(STUDIO_PRESENTATION) as StudioRole[];
