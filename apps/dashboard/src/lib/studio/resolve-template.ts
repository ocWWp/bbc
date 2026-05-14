import "server-only";
// Resolves any templateId to its owning role + full Template, across all 8 role
// registries. SERVER-ONLY: side-effect-imports every registry's registration
// graph. roleForTemplateId only maps the id PREFIX; the actual lookup still
// needs the owning registry's getter, so both are used here.

import { roleForTemplateId, type StudioRole } from "@/lib/studio/template-id";
import type { Template } from "@/lib/studio/templates/types";

// Side-effect imports: register every role's templates.
import "@/lib/studio/templates";
import "@/lib/studio/eng-templates";
import "@/lib/studio/founder-templates";
import "@/lib/studio/designer-templates";
import "@/lib/studio/support-templates";
import "@/lib/studio/finance-templates";
import "@/lib/studio/legal-templates";
import "@/lib/studio/hr-templates";

import { getTemplate } from "@/lib/studio/templates/registry";
import { getEngTemplate } from "@/lib/studio/eng-templates/registry";
import { getFounderTemplate } from "@/lib/studio/founder-templates/registry";
import { getDesignerTemplate } from "@/lib/studio/designer-templates/registry";
import { getSupportTemplate } from "@/lib/studio/support-templates/registry";
import { getFinanceTemplate } from "@/lib/studio/finance-templates/registry";
import { getLegalTemplate } from "@/lib/studio/legal-templates/registry";
import { getHrTemplate } from "@/lib/studio/hr-templates/registry";

const GETTERS: Record<StudioRole, (id: string) => Template | undefined> = {
  marketing: getTemplate,
  engineering: getEngTemplate,
  founder: getFounderTemplate,
  designer: getDesignerTemplate,
  support: getSupportTemplate,
  finance: getFinanceTemplate,
  legal: getLegalTemplate,
  hr: getHrTemplate,
};

export type ResolvedTemplate = { role: StudioRole; template: Template };

export function resolveTemplate(templateId: string): ResolvedTemplate | null {
  const role = roleForTemplateId(templateId);
  if (!role) return null;
  const template = GETTERS[role](templateId);
  if (!template) return null;
  return { role, template };
}
