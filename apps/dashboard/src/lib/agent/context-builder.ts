// AgentContextBuilder — assembles the shared `AgentContext` shape used
// by both orchestration paths (homeTurn, observerRun).
//
// Stateless: no module-level mutable state, no top-level side effects.
// DB dependencies are injected via the `ContextDb` interface so the
// builder is trivially testable. See STATELESSNESS.md (M1.12).

import type {
  AgentContext,
  AnomalyContext,
  ConversationTurn,
  Role,
} from "./types";

/**
 * Injected DB-shaped surface. Real implementations bind a Supabase
 * server client; tests bind vi mocks. The builder never imports a
 * Supabase client directly.
 */
export type ContextDb = {
  getRolePack: (
    tenantId: string,
    role: Role,
  ) => Promise<AgentContext["rolePack"]>;
  getMemoryIndexExcerpt: (tenantId: string) => Promise<string>;
  getWorkspaceName: (tenantId: string) => Promise<string>;
};

export type BuildArgsCommon = {
  tenantId: string;
  /**
   * Null for observerRun (service-actor identity). Required for homeTurn.
   */
  actorId: string | null;
  role: Role;
  db: ContextDb;
};

export type BuildConversationArgs = BuildArgsCommon & {
  kind: "conversation";
  conversation: {
    turns: ConversationTurn[];
    userInput: string;
  };
};

export type BuildAnomalyArgs = BuildArgsCommon & {
  kind: "anomaly";
  anomaly: AnomalyContext;
};

export type BuildArgs = BuildConversationArgs | BuildAnomalyArgs;

export async function buildAgentContext(
  args: BuildArgs,
): Promise<AgentContext> {
  // Three independent reads — dispatch in parallel to keep p50 close to
  // max(individual latency) rather than sum.
  const [rolePack, memoryIndexExcerpt, workspaceName] = await Promise.all([
    args.db.getRolePack(args.tenantId, args.role),
    args.db.getMemoryIndexExcerpt(args.tenantId),
    args.db.getWorkspaceName(args.tenantId),
  ]);

  const buffer: AgentContext["buffer"] =
    args.kind === "conversation"
      ? {
          kind: "conversation",
          turns: args.conversation.turns,
          userInput: args.conversation.userInput,
        }
      : { kind: "anomaly", anomaly: args.anomaly };

  return {
    tenantId: args.tenantId,
    actorId: args.actorId,
    role: args.role,
    rolePack,
    buffer,
    alwaysOn: { memoryIndexExcerpt, workspaceName },
  };
}
