import type { AuthContext } from "../auth";
import { tenantScopedClient } from "../auth";

export const listQueueTool = {
  name: "list_queue",
  description:
    "List queue items for the current tenant. Optionally filter by status (pending/accepted/rejected). Returns proposal_id, status, summary, and creation time.",
  inputSchema: {
    type: "object",
    properties: {
      status: {
        type: "string",
        enum: ["pending", "accepted", "rejected"],
        description: "Optional status filter; defaults to pending.",
      },
      limit: {
        type: "number",
        description: "Max items to return (default 25, max 100).",
      },
    },
    required: [],
  },
} as const;

export async function callListQueue(
  ctx: AuthContext,
  args: { status?: "pending" | "accepted" | "rejected"; limit?: number },
) {
  const status = args.status ?? "pending";
  const limit = Math.min(Math.max(args.limit ?? 25, 1), 100);
  const sb = tenantScopedClient(ctx.tenant_id);
  const { data, error } = await sb
    .from("queue_items")
    .select("proposal_id,status,frontmatter,created_at,resolved_at")
    .eq("tenant_id", ctx.tenant_id)
    .eq("status", status)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    return { content: [{ type: "text" as const, text: `Error: ${error.message}` }] };
  }
  const rows = (data ?? []).map((r) => ({
    proposal_id: r.proposal_id,
    status: r.status,
    summary: (r.frontmatter as Record<string, unknown>)?.diff_summary ?? null,
    created_at: r.created_at,
    resolved_at: r.resolved_at,
  }));
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({ tenant: ctx.tenant_id, status, count: rows.length, items: rows }, null, 2),
      },
    ],
  };
}
