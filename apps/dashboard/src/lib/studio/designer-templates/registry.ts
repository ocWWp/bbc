import type { Template } from "./types";

const registry = new Map<string, Template>();

export function registerDesignerTemplate(t: Template): void {
  if (registry.has(t.id)) {
    throw new Error(`Duplicate designer template id: ${t.id}`);
  }
  registry.set(t.id, t);
}

export function getDesignerTemplate(id: string): Template | undefined {
  return registry.get(id);
}

export function listDesignerTemplates(): Template[] {
  return [...registry.values()];
}

export type ClientDesignerTemplate = {
  id: string;
  label: string;
  hint: string;
  kind: Template["kind"];
  firstUseInputs: Template["firstUseInputs"];
};

export function listClientDesignerTemplates(): ClientDesignerTemplate[] {
  return [...registry.values()].map((t) => ({
    id: t.id,
    label: t.label,
    hint: t.hint,
    kind: t.kind,
    firstUseInputs: t.firstUseInputs,
  }));
}
