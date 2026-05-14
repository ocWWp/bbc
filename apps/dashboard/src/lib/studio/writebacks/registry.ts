import type { WritebackEmitter } from "./types";

const registry = new Map<string, WritebackEmitter>();

export function registerWritebackEmitter(e: WritebackEmitter): void {
  if (registry.has(e.templateId)) {
    throw new Error(`Duplicate writeback emitter for template: ${e.templateId}`);
  }
  registry.set(e.templateId, e);
}

export function getWritebackEmitter(templateId: string): WritebackEmitter | undefined {
  return registry.get(templateId);
}

export function listWritebackEmitters(): WritebackEmitter[] {
  return [...registry.values()];
}
