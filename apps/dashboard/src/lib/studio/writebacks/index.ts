// Writeback emitter entry point. Side-effect imports register each emitter
// keyed by template_id. acceptRun looks up by template_id and runs whatever
// is registered; templates without an emitter simply skip the writeback step.
//
// Templates with emitters land here as they ship. v1 ships
// feature-request-triage as the headline (3-way writeback) -- the other
// support templates' writebacks follow the same pattern in follow-up phases.

import "./feature-request-triage";
import "./eng-adr-draft";

export {
  getWritebackEmitter,
  listWritebackEmitters,
  registerWritebackEmitter,
} from "./registry";

export { blocksToMarkdown, proposalId, slugify } from "./types";

export type {
  WritebackContext,
  WritebackResult,
  WritebackEmitter,
  FiledProposal,
  FiledArtifact,
} from "./types";
