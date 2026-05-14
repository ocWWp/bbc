import "server-only";
// Unified, searchable view over all 8 role template registries. The gallery is
// the app's home screen. SERVER-ONLY: pulls in every registry's side-effect
// graph (template registration + buildPrompt). Client code must import
// filterGallery from ./gallery-filter, never from here.

import { ROLE_SHAPES } from "@/lib/studio/role-shapes";
import { roleForTemplateId, type StudioRole } from "@/lib/studio/template-id";
import type { FirstUseInput, PreviewKind } from "@/lib/studio/templates/types";

// Side-effect imports register every role's templates into its registry.
import "@/lib/studio/templates";
import "@/lib/studio/eng-templates";
import "@/lib/studio/founder-templates";
import "@/lib/studio/designer-templates";
import "@/lib/studio/support-templates";
import "@/lib/studio/finance-templates";
import "@/lib/studio/legal-templates";
import "@/lib/studio/hr-templates";

// Each registry's client-template list function comes FROM ITS registry.ts --
// the marketing one is `listClientTemplates`, the rest are
// `listClient<Role>Templates`.
import { listClientTemplates } from "@/lib/studio/templates/registry";
import { listClientEngTemplates } from "@/lib/studio/eng-templates/registry";
import { listClientFounderTemplates } from "@/lib/studio/founder-templates/registry";
import { listClientDesignerTemplates } from "@/lib/studio/designer-templates/registry";
import { listClientSupportTemplates } from "@/lib/studio/support-templates/registry";
import { listClientFinanceTemplates } from "@/lib/studio/finance-templates/registry";
import { listClientLegalTemplates } from "@/lib/studio/legal-templates/registry";
import { listClientHrTemplates } from "@/lib/studio/hr-templates/registry";

// Structural common shape across all 8 Client<Role>Template types. They each
// carry at least these fields; we read them structurally rather than importing
// 8 different named types.
type AnyClientTemplate = {
  id: string;
  label: string;
  hint: string;
  kind: PreviewKind;
  firstUseInputs: FirstUseInput[];
  facets?: StudioRole[];
};

export type GalleryTemplate = AnyClientTemplate & {
  owningRole: StudioRole;
  roles: StudioRole[]; // owning role + facets
  roleLabel: string;
  accentColor: string;
};

const REGISTRY_LISTS: ReadonlyArray<() => AnyClientTemplate[]> = [
  listClientTemplates,
  listClientEngTemplates,
  listClientFounderTemplates,
  listClientDesignerTemplates,
  listClientSupportTemplates,
  listClientFinanceTemplates,
  listClientLegalTemplates,
  listClientHrTemplates,
];

export function buildGallery(): GalleryTemplate[] {
  const out: GalleryTemplate[] = [];
  for (const list of REGISTRY_LISTS) {
    for (const t of list()) {
      const owningRole = roleForTemplateId(t.id);
      if (!owningRole) continue; // unprefixed -- not gallery-eligible
      const shape = ROLE_SHAPES[owningRole];
      const roles = Array.from(new Set<StudioRole>([owningRole, ...(t.facets ?? [])]));
      out.push({
        ...t,
        owningRole,
        roles,
        roleLabel: shape.label,
        accentColor: shape.accentColor,
      });
    }
  }
  return out.sort((a, b) => a.label.localeCompare(b.label));
}
