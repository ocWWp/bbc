import type { Template } from "./types";

const registry = new Map<string, Template>();

export function registerSupportTemplate(t: Template): void {
  if (registry.has(t.id)) {
    throw new Error(`Duplicate support template id: ${t.id}`);
  }
  registry.set(t.id, t);
}

export function getSupportTemplate(id: string): Template | undefined {
  return registry.get(id);
}

export function listSupportTemplates(): Template[] {
  return [...registry.values()];
}

export type ClientSupportTemplate = {
  id: string;
  label: string;
  hint: string;
  kind: Template["kind"];
  firstUseInputs: Template["firstUseInputs"];
};

export function listClientSupportTemplates(): ClientSupportTemplate[] {
  return [...registry.values()].map((t) => ({
    id: t.id,
    label: t.label,
    hint: t.hint,
    kind: t.kind,
    firstUseInputs: t.firstUseInputs,
  }));
}
