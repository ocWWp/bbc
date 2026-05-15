// v1.6 agent libraries — composable pieces consumed by homeTurn() and
// observerRun(). Two paths, one library set; see STATELESSNESS.md (M1.12).
export type {
  Role,
  ConversationTurn,
  AnomalyContext,
  AgentContext,
  Intent,
} from "./types";

export { buildAgentContext } from "./context-builder";
export type {
  ContextDb,
  BuildArgs,
  BuildConversationArgs,
  BuildAnomalyArgs,
} from "./context-builder";

export { TOOLS, toolsForIntent } from "./tools";
export type { ToolDef } from "./tools";

export { verifyGrounding } from "./grounding";
export type { GroundingResult } from "./grounding";

export { reserveQuota, reconcileQuota } from "./quota";
export type {
  QuotaKind,
  ReserveArgs,
  ReserveResult,
  ReserveRpc,
  ReconcileArgs,
  ReconcileRpc,
} from "./quota";

export { classifyIntent } from "./classify";
export type { ClassifierLlm } from "./classify";
