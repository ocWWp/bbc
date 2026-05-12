import { NextResponse, type NextRequest } from "next/server";
import { resolveBearer } from "@/lib/api-auth";
import {
  PROTOCOL_VERSION,
  TOOLS,
  handleRequest,
  rpcError,
  type JsonRpcRequest,
} from "@/lib/mcp/handler";

/**
 * BBC MCP server. Stateless HTTP transport: each request is a JSON-RPC 2.0
 * message; each response is a JSON-RPC 2.0 message. No SSE streaming yet.
 *
 * Auth: `Authorization: Bearer bbc_<key_id>.<secret>` — keys created at
 * /api-keys. The route validates via the `resolve_api_key` SQL function
 * (security definer, service-role only) and uses the resolved tenant_id
 * for every brain query.
 *
 * Protocol + tool dispatch live in @/lib/mcp/handler so they can be
 * unit-tested without spinning up a server. See handler.ts for the full
 * method + tool catalog.
 *
 * Not yet implemented (queue write tools need auth.uid() context that an
 * api-key bearer doesn't carry; tracked under Phase L+ -- use the dashboard):
 *   - accept_proposal
 *   - reject_proposal
 */

export async function POST(req: NextRequest) {
  const resolved = await resolveBearer(req.headers.get("authorization"));
  if (!resolved) {
    return NextResponse.json(
      rpcError(null, -32001, "Unauthorized: invalid or missing API key."),
      { status: 401 },
    );
  }

  let body: JsonRpcRequest;
  try {
    body = (await req.json()) as JsonRpcRequest;
  } catch {
    return NextResponse.json(rpcError(null, -32700, "Parse error."), { status: 400 });
  }

  const response = await handleRequest(body, resolved);
  // JSON-RPC errors still return HTTP 200 per spec.
  return NextResponse.json(response, { status: 200 });
}

// Convenience: GET returns server info for browsers + curl probes.
export async function GET() {
  return NextResponse.json({
    name: "bbc-mcp",
    protocolVersion: PROTOCOL_VERSION,
    transport: "streamable-http",
    auth: "Bearer api-key from /api-keys",
    methods: ["initialize", "ping", "tools/list", "tools/call"],
    tools: TOOLS.map((t) => ({ name: t.name, description: t.description })),
  });
}
