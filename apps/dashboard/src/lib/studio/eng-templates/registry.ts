import type { Template } from "./types";

const registry = new Map<string, Template>();

export function registerEngTemplate(t: Template): void {
  if (registry.has(t.id)) {
    throw new Error(`Duplicate engineering template id: ${t.id}`);
  }
  registry.set(t.id, t);
}

export function getEngTemplate(id: string): Template | undefined {
  return registry.get(id);
}

export function listEngTemplates(): Template[] {
  return [...registry.values()];
}

export type ClientEngTemplate = {
  id: string;
  label: string;
  hint: string;
  kind: Template["kind"];
  firstUseInputs: Template["firstUseInputs"];
};

export function listClientEngTemplates(): ClientEngTemplate[] {
  return [...registry.values()].map((t) => ({
    id: t.id,
    label: t.label,
    hint: t.hint,
    kind: t.kind,
    firstUseInputs: t.firstUseInputs,
  }));
}
