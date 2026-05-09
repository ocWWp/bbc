/**
 * BBC MCP server. Speaks Model Context Protocol so agents (Claude Desktop,
 * Cursor, custom) can read+write a tenant's BBC instance.
 *
 * Phase 6 ships read-only tools (read_memory, list_queue, read_log).
 * Write tools (propose_change, accept_proposal, reject_proposal) land in
 * a follow-up.
 *
 * Auth: per-tenant API keys (see migration 0013). Token format
 * `bbc_<key_id>.<secret>`. Pass via Authorization: Bearer <token> header
 * when using the HTTP transport.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

import { authenticate, type AuthContext } from "./auth";
import { readMemoryTool, callReadMemory } from "./tools/read-memory";
import { listQueueTool, callListQueue } from "./tools/list-queue";
import { readLogTool, callReadLog } from "./tools/read-log";

const TOOLS = [readMemoryTool, listQueueTool, readLogTool];

function bearerToken(req: IncomingMessage): string | undefined {
  const auth = req.headers["authorization"];
  if (!auth || typeof auth !== "string") return undefined;
  if (!auth.startsWith("Bearer ")) return undefined;
  return auth.slice(7).trim();
}

async function buildAuthorizedServer(ctx: AuthContext): Promise<Server> {
  const server = new Server(
    { name: "bbc", version: "0.1.0" },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOLS,
  }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const { name, arguments: args = {} } = req.params;
    switch (name) {
      case "read_memory":
        return callReadMemory(ctx, args as { path: string });
      case "list_queue":
        return callListQueue(ctx, args as { status?: "pending" | "accepted" | "rejected"; limit?: number });
      case "read_log":
        return callReadLog(ctx, args as { limit?: number });
      default:
        return {
          content: [{ type: "text" as const, text: `Unknown tool: ${name}` }],
          isError: true,
        };
    }
  });

  return server;
}

const PORT = Number(process.env.PORT ?? 4501);

const httpServer = createServer(async (req: IncomingMessage, res: ServerResponse) => {
  // Health check
  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, name: "bbc-mcp", version: "0.1.0" }));
    return;
  }

  // MCP endpoint (POST /mcp)
  if (req.method === "POST" && req.url === "/mcp") {
    let ctx: AuthContext;
    try {
      ctx = await authenticate(bearerToken(req));
    } catch (e) {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: (e as Error).message }));
      return;
    }

    const server = await buildAuthorizedServer(ctx);
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => `${ctx.key_id}-${Date.now()}`,
    });
    await server.connect(transport);
    await transport.handleRequest(req, res);
    return;
  }

  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "not found" }));
});

httpServer.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`bbc-mcp listening on http://localhost:${PORT}/mcp`);
});
