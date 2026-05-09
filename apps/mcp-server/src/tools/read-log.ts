import type { AuthContext } from "../auth";
import { tenantScopedClient } from "../auth";

export const readLogTool = {
  name: "read_log",
  description:
    "Return the most recent operations_log entries for the current tenant. Useful for agents that want to see what happened recently in the BBC instance.",
  inputSchema: {
    type: "object",
    properties: {
      limit: {
        type: "number",
        description: "Max entries to return (default 50, max 500).",
      },
    },
    required: [],
  },
} as const;

export async function callReadLog(ctx: AuthContext, args: { limit?: number }) {
  const limit = Math.min(Math.max(args.limit ?? 50, 1), 500);
  const sb = tenantScopedClient(ctx.tenant_id);
  const { data, error } = await sb
    .from("operations_log")
    .select("v,ts,actor,action,target,payload")
    .eq("tenant_id", ctx.tenant_id)
    .order("v", { ascending: false })
    .limit(limit);
  if (error) {
    return { content: [{ type: "text" as const, text: `Error: ${error.message}` }] };
  }
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({ tenant: ctx.tenant_id, count: data?.length ?? 0, entries: data ?? [] }, null, 2),
      },
    ],
  };
}
