import type { Store } from "../interfaces";
import { LocalQueueStore } from "./queue";
import { LocalLogStore } from "./log";
import { LocalBindingsStore } from "./bindings";
import { LocalToolsStore } from "./tools";

/**
 * File-mode store. Single-tenant by construction (the host's bbc/ directory
 * is the only state). Reads via Node fs; writes (Phase 3) shell out to
 * scripts/{accept,reject,propose}.sh.
 */
export class LocalStore implements Store {
  readonly queue: LocalQueueStore;
  readonly log: LocalLogStore;
  readonly bindings: LocalBindingsStore;
  readonly tools: LocalToolsStore;

  constructor(bbcRoot: string) {
    this.queue = new LocalQueueStore(bbcRoot);
    this.log = new LocalLogStore(bbcRoot);
    this.bindings = new LocalBindingsStore(bbcRoot);
    this.tools = new LocalToolsStore(bbcRoot);
  }
}

export { LocalQueueStore } from "./queue";
export { LocalLogStore } from "./log";
export { LocalBindingsStore } from "./bindings";
export { LocalToolsStore } from "./tools";
