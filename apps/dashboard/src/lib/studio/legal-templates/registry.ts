import type { Template, TriageLevel } from "./types";
import { legalTriageFor } from "./types";

const registry = new Map<string, Template>();

export function registerLegalTemplate(t: Template): void {
  if (registry.has(t.id)) {
    throw new Error(`Duplicate legal template id: ${t.id}`);
  }
  registry.set(t.id, t);
}

export function getLegalTemplate(id: string): Template | undefined {
  return registry.get(id);
}

export function listLegalTemplates(): Template[] {
  return [...registry.values()];
}

export type ClientLegalTemplate = {
  id: string;
  label: string;
  hint: string;
  kind: Template["kind"];
  firstUseInputs: Template["firstUseInputs"];
  facets?: Template["facets"];
  // Per-doc-type lawyer triage, surfaced as a chip on the workflow card so the
  // user knows the stakes before generating. See legalTriageFor in ./types.
  triageLevel: TriageLevel;
  triageNote: string;
};

export function listClientLegalTemplates(): ClientLegalTemplate[] {
  return [...registry.values()].map((t) => {
    const triage = legalTriageFor(t.id);
    return {
      id: t.id,
      label: t.label,
      hint: t.hint,
      kind: t.kind,
      firstUseInputs: t.firstUseInputs,
      facets: t.facets,
      triageLevel: triage.level,
      triageNote: triage.note,
    };
  });
}
