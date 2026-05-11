import type { Template } from "./types";

const registry = new Map<string, Template>();

export function registerTemplate(t: Template): void {
  if (registry.has(t.id)) {
    throw new Error(`Duplicate template id: ${t.id}`);
  }
  registry.set(t.id, t);
}

export function getTemplate(id: string): Template | undefined {
  return registry.get(id);
}

export function listTemplates(): Template[] {
  return [...registry.values()];
}

export function listTemplateSummaries(): Array<{
  id: string;
  label: string;
  hint: string;
  kind: Template["kind"];
}> {
  return [...registry.values()].map((t) => ({
    id: t.id,
    label: t.label,
    hint: t.hint,
    kind: t.kind,
  }));
}
