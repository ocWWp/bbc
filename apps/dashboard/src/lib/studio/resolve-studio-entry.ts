import "server-only";
// Resolves a studio page's ?template=&task= search params into a StudioSeed,
// validating the template exists AND its owning role matches the page. Used by
// all 8 studio page.tsx wrappers. Bad/foreign ids -> undefined (page boots idle).
import { resolveTemplate } from "@/lib/studio/resolve-template";
import { TASK_MAX_LEN } from "@/lib/studio/task-limits";
import type { StudioRole } from "@/lib/studio/template-id";
import type { StudioSeed } from "@/components/studio/template-first-config";

type RawParam = string | string[] | undefined;
const first = (p: RawParam): string | undefined => (Array.isArray(p) ? p[0] : p);

export function resolveStudioEntry(
  pageRole: StudioRole,
  params: { template?: RawParam; task?: RawParam },
): StudioSeed | undefined {
  const templateId = first(params.template);
  if (!templateId) return undefined;
  const resolved = resolveTemplate(templateId);
  if (!resolved || resolved.role !== pageRole) return undefined;
  const task = (first(params.task) ?? "").slice(0, TASK_MAX_LEN[pageRole]);
  return { templateId, task, inputs: {} };
}
