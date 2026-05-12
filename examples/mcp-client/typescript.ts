/**
 * BBC brain client — TypeScript example.
 *
 * Usage:
 *   export BBC_URL="http://localhost:3000"
 *   export BBC_API_KEY="bbc_xxx.yyy"
 *   npx tsx typescript.ts
 *
 * No deps -- uses native fetch (Node 18+).
 */

const BBC_URL = requireEnv("BBC_URL");
const BBC_API_KEY = requireEnv("BBC_API_KEY");

const headers = {
  Authorization: `Bearer ${BBC_API_KEY}`,
  "Content-Type": "application/json",
};

type RpcResponse<T> = {
  jsonrpc: "2.0";
  id: number;
  result?: T;
  error?: { code: number; message: string };
};

async function mcpCall<T = unknown>(method: string, params?: unknown): Promise<T> {
  const res = await fetch(`${BBC_URL}/api/mcp`, {
    method: "POST",
    headers,
    body: JSON.stringify({ jsonrpc: "2.0", id: Date.now(), method, params }),
  });
  const body = (await res.json()) as RpcResponse<T>;
  if (body.error) {
    throw new Error(`MCP ${method}: ${body.error.code} ${body.error.message}`);
  }
  if (body.result === undefined) {
    throw new Error(`MCP ${method}: no result and no error`);
  }
  return body.result;
}

async function callTool(name: string, args: Record<string, unknown> = {}): Promise<unknown> {
  const result = await mcpCall<{ content: Array<{ type: string; text: string }>; isError?: boolean }>(
    "tools/call",
    { name, arguments: args },
  );
  if (result.isError) {
    throw new Error(`Tool ${name} returned error: ${result.content[0]?.text ?? "(unknown)"}`);
  }
  const text = result.content[0]?.text ?? "";
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function main() {
  // 1. Probe the server.
  const init = await mcpCall<{ serverInfo: { name: string; version: string } }>("initialize");
  console.log(`Connected to ${init.serverInfo.name} v${init.serverInfo.version}`);

  // 2. List tools.
  const tools = await mcpCall<{ tools: Array<{ name: string }> }>("tools/list");
  console.log(`Server exposes ${tools.tools.length} tools: ${tools.tools.map((t) => t.name).join(", ")}`);

  // 3. Read recent decisions.
  const decisions = (await callTool("list_decisions", { limit: 5 })) as Array<{
    id: string;
    title: string;
  }>;
  console.log(`\nLatest ${decisions.length} decisions:`);
  for (const d of decisions) {
    console.log(`  - ${d.title} (${d.id.slice(0, 8)}…)`);
  }

  // 4. Search by keyword.
  const hits = (await callTool("search_memories", { query: "auth", limit: 3 })) as Array<{
    title: string;
    type: string | null;
  }>;
  console.log(`\nSearch hits for 'auth' (${hits.length}):`);
  for (const m of hits) {
    console.log(`  - [${m.type ?? "?"}] ${m.title}`);
  }
}

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(`Missing env var ${name}`);
    process.exit(1);
  }
  return v;
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
