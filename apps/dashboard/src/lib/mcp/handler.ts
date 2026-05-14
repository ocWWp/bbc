import {
  listMemories,
  getMemory,
  searchMemories,
  listDecisions,
  listVendors,
  listProposals,
  getProposal,
  submitMemory,
} from "@/lib/brain-api";
import {
  adminClient,
  allowedTypesForRole,
  scopeAllows,
  type ResolvedKey,
} from "@/lib/api-auth";

/**
 * BBC MCP JSON-RPC handler. Pure dispatch logic: takes a parsed request +
 * resolved bearer-auth key, returns a JSON-RPC response. The Next.js route at
 * src/app/api/mcp/route.ts is a thin adapter around this.
 *
 * Kept independent of NextRequest/NextResponse so it can be unit-tested
 * without spinning up a server.
 */

export const PROTOCOL_VERSION = "2025-03-26";

export type JsonRpcRequest = {
  jsonrpc: "2.0";
  id?: string | number | null;
  method: string;
  params?: unknown;
};

export type JsonRpcResponse = {
  jsonrpc: "2.0";
  id: string | number | null;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
};

export function rpcError(
  id: string | number | null,
  code: number,
  message: string,
  data?: unknown,
): JsonRpcResponse {
  return { jsonrpc: "2.0", id, error: { code, message, data } };
}

export function rpcOk(id: string | number | null, result: unknown): JsonRpcResponse {
  return { jsonrpc: "2.0", id, result };
}

type ToolScope = ResolvedKey["scope"];

export const TOOL_SCOPES: Record<string, ToolScope> = {
  list_memories: "read",
  get_memory: "read",
  search_memories: "read",
  list_decisions: "read",
  list_vendors: "read",
  list_proposals: "read",
  get_proposal: "read",
  submit_memory: "write",
};

export const TOOLS = [
  {
    name: "list_memories",
    description:
      "List typed memory records from the tenant's brain. Optionally filtered by supertag (decision, voice, glossary, vendor, product, team, skill, source_artifact, note).",
    inputSchema: {
      type: "object",
      properties: {
        type: {
          type: "string",
          description:
            "Filter by memory supertag. Omit to see all types. Valid: decision | voice | glossary | vendor | product | team | skill | source_artifact | note.",
        },
        limit: {
          type: "integer",
          description: "Max rows to return. Default 25, max 200.",
        },
      },
    },
  },
  {
    name: "get_memory",
    description: "Fetch a full memory record (fields, content, status) by id.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Memory uuid." },
      },
      required: ["id"],
    },
  },
  {
    name: "search_memories",
    description: "Search memory titles and bodies for a substring (case-insensitive).",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search text. Minimum 2 characters." },
        limit: { type: "integer", description: "Max rows to return. Default 25, max 200." },
      },
      required: ["query"],
    },
  },
  {
    name: "list_decisions",
    description: "List recent decisions (memory_files where type='decision').",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "integer", description: "Max rows to return. Default 25, max 200." },
      },
    },
  },
  {
    name: "list_vendors",
    description: "List vendor memories the team has documented (memory_files where type='vendor').",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "list_proposals",
    description:
      "List queue items (proposals) awaiting review or in history. Filter by status: pending | accepted | rejected.",
    inputSchema: {
      type: "object",
      properties: {
        status: { type: "string", description: "pending | accepted | rejected" },
        limit: { type: "integer", description: "Max rows. Default 25, max 200." },
      },
    },
  },
  {
    name: "get_proposal",
    description: "Fetch a full proposal body + frontmatter by proposal_id.",
    inputSchema: {
      type: "object",
      properties: {
        proposal_id: { type: "string", description: "The proposal id (e.g. 'prop_2026-05-08_foo')." },
      },
      required: ["proposal_id"],
    },
  },
  {
    name: "submit_memory",
    description:
      "Insert a new memory record. Requires write scope. Memory types: decision | voice | glossary | vendor | product | team | skill | source_artifact | note.",
    inputSchema: {
      type: "object",
      properties: {
        type: { type: "string", description: "Memory supertag." },
        title: { type: "string", description: "Title (1-200 chars)." },
        content: { type: "string", description: "Body markdown (optional, max 50,000 chars)." },
        fields: {
          type: "object",
          description: "Type-specific structured fields (see memory schema). Optional.",
        },
      },
      required: ["type", "title"],
    },
  },
];

function textContent(value: unknown) {
  return {
    content: [
      {
        type: "text",
        text: typeof value === "string" ? value : JSON.stringify(value, null, 2),
      },
    ],
    isError: false,
  };
}

export async function dispatchTool(
  tenantId: string,
  toolName: string,
  args: Record<string, unknown>,
  role: string | null = null,
): Promise<unknown> {
  const supabase = adminClient();
  const allowedTypes = allowedTypesForRole(role);
  switch (toolName) {
    case "list_memories": {
      const type = typeof args.type === "string" ? args.type : undefined;
      const limit = typeof args.limit === "number" ? args.limit : undefined;
      const rows = await listMemories(supabase, tenantId, { type, limit, allowedTypes });
      return textContent(rows);
    }
    case "get_memory": {
      const id = typeof args.id === "string" ? args.id : "";
      if (!/^[0-9a-fA-F-]{36}$/.test(id)) {
        return { content: [{ type: "text", text: "Invalid memory id (must be uuid)." }], isError: true };
      }
      const row = await getMemory(supabase, tenantId, id, { allowedTypes });
      if (!row) return { content: [{ type: "text", text: "Not found." }], isError: true };
      return textContent(row);
    }
    case "search_memories": {
      const query = typeof args.query === "string" ? args.query : "";
      const limit = typeof args.limit === "number" ? args.limit : undefined;
      const rows = await searchMemories(supabase, tenantId, { query, limit, allowedTypes });
      return textContent(rows);
    }
    case "list_decisions": {
      const limit = typeof args.limit === "number" ? args.limit : undefined;
      const rows = await listDecisions(supabase, tenantId, { limit, allowedTypes });
      return textContent(rows);
    }
    case "list_vendors": {
      const rows = await listVendors(supabase, tenantId, { allowedTypes });
      return textContent(rows);
    }
    case "list_proposals": {
      const rawStatus = typeof args.status === "string" ? args.status : undefined;
      const status =
        rawStatus === "pending" || rawStatus === "accepted" || rawStatus === "rejected"
          ? rawStatus
          : undefined;
      const limit = typeof args.limit === "number" ? args.limit : undefined;
      const rows = await listProposals(supabase, tenantId, { status, limit });
      return textContent(rows);
    }
    case "get_proposal": {
      const pid = typeof args.proposal_id === "string" ? args.proposal_id : "";
      if (!pid) return { content: [{ type: "text", text: "Missing proposal_id." }], isError: true };
      const row = await getProposal(supabase, tenantId, pid);
      if (!row) return { content: [{ type: "text", text: "Not found." }], isError: true };
      return textContent(row);
    }
    case "submit_memory": {
      const type = typeof args.type === "string" ? args.type : "";
      const title = typeof args.title === "string" ? args.title : "";
      const content = typeof args.content === "string" ? args.content : undefined;
      const fields =
        args.fields && typeof args.fields === "object" && !Array.isArray(args.fields)
          ? (args.fields as Record<string, unknown>)
          : undefined;
      const res = await submitMemory(
        supabase,
        tenantId,
        { type, title, content, fields },
        { allowedTypes },
      );
      if (!res.ok) {
        return { content: [{ type: "text", text: res.error }], isError: true };
      }
      return textContent({ id: res.id, status: "active" });
    }
    default:
      return { content: [{ type: "text", text: `Unknown tool: ${toolName}` }], isError: true };
  }
}

export async function handleRequest(
  body: JsonRpcRequest,
  resolved: ResolvedKey,
): Promise<JsonRpcResponse> {
  const id = body.id ?? null;

  if (body.jsonrpc !== "2.0" || typeof body.method !== "string") {
    return rpcError(id, -32600, "Invalid JSON-RPC request.");
  }

  switch (body.method) {
    case "initialize": {
      return rpcOk(id, {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: { name: "bbc-mcp", version: "0.1.0" },
      });
    }
    case "ping": {
      return rpcOk(id, {});
    }
    case "tools/list": {
      return rpcOk(id, { tools: TOOLS });
    }
    case "tools/call": {
      const params = (body.params ?? {}) as { name?: unknown; arguments?: unknown };
      const name = typeof params.name === "string" ? params.name : "";
      const args =
        params.arguments && typeof params.arguments === "object"
          ? (params.arguments as Record<string, unknown>)
          : {};
      if (!name) return rpcError(id, -32602, "Missing tool name.");

      const need = TOOL_SCOPES[name];
      if (need && !scopeAllows(resolved.scope, need)) {
        return rpcError(
          id,
          -32001,
          `Insufficient scope: tool '${name}' requires '${need}', key has '${resolved.scope}'.`,
        );
      }

      try {
        const result = await dispatchTool(resolved.tenant_id, name, args, resolved.role);
        return rpcOk(id, result);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "unknown";
        return rpcError(id, -32603, `Tool execution failed: ${msg}`);
      }
    }
    default:
      return rpcError(id, -32601, `Method not found: ${body.method}`);
  }
}
