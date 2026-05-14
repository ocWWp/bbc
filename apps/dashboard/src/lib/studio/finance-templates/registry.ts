import type { Template } from "./types";

const registry = new Map<string, Template>();

export function registerFinanceTemplate(t: Template): void {
  if (registry.has(t.id)) {
    throw new Error(`Duplicate finance template id: ${t.id}`);
  }
  registry.set(t.id, t);
}

export function getFinanceTemplate(id: string): Template | undefined {
  return registry.get(id);
}

export function listFinanceTemplates(): Template[] {
  return [...registry.values()];
}

export type ClientFinanceTemplate = {
  id: string;
  label: string;
  hint: string;
  kind: Template["kind"];
  firstUseInputs: Template["firstUseInputs"];
  facets?: Template["facets"];
};

export function listClientFinanceTemplates(): ClientFinanceTemplate[] {
  return [...registry.values()].map((t) => ({
    id: t.id,
    label: t.label,
    hint: t.hint,
    kind: t.kind,
    firstUseInputs: t.firstUseInputs,
    facets: t.facets,
  }));
}
