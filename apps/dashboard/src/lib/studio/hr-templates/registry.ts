import type { Template } from "./types";

const registry = new Map<string, Template>();

export function registerHrTemplate(t: Template): void {
  if (registry.has(t.id)) {
    throw new Error(`Duplicate HR template id: ${t.id}`);
  }
  registry.set(t.id, t);
}

export function getHrTemplate(id: string): Template | undefined {
  return registry.get(id);
}

export function listHrTemplates(): Template[] {
  return [...registry.values()];
}

export type ClientHrTemplate = {
  id: string;
  label: string;
  hint: string;
  kind: Template["kind"];
  firstUseInputs: Template["firstUseInputs"];
  facets?: Template["facets"];
};

export function listClientHrTemplates(): ClientHrTemplate[] {
  return [...registry.values()].map((t) => ({
    id: t.id,
    label: t.label,
    hint: t.hint,
    kind: t.kind,
    firstUseInputs: t.firstUseInputs,
    facets: t.facets,
  }));
}
