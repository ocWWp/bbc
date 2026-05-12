import { describe, expect, it, vi, beforeEach } from "vitest";

// Stub @supabase/supabase-js so adminClient() inside dispatchTool doesn't
// touch the network. The mocked brain-api functions ignore the client arg.
vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({})),
}));

// Mock the brain-api module BEFORE importing the handler.
vi.mock("@/lib/brain-api", () => ({
  listMemories: vi.fn(),
  getMemory: vi.fn(),
  searchMemories: vi.fn(),
  listDecisions: vi.fn(),
  listVendors: vi.fn(),
  listProposals: vi.fn(),
  getProposal: vi.fn(),
  submitMemory: vi.fn(),
}));

import { handleRequest, TOOLS, type JsonRpcRequest } from "./handler";
import type { ResolvedKey } from "@/lib/api-auth";
import * as brainApi from "@/lib/brain-api";

const READ_KEY: ResolvedKey = { tenant_id: "tenant-abc", scope: "read", role: null };
const WRITE_KEY: ResolvedKey = { tenant_id: "tenant-abc", scope: "write", role: null };
const MARKETING_READ_KEY: ResolvedKey = {
  tenant_id: "tenant-abc",
  scope: "read",
  role: "marketing-writer",
};
const MARKETING_WRITE_KEY: ResolvedKey = {
  tenant_id: "tenant-abc",
  scope: "write",
  role: "marketing-writer",
};

function rpcCall(method: string, params?: unknown, id: string | number = 1): JsonRpcRequest {
  return { jsonrpc: "2.0", id, method, params };
}

beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "fake";
  vi.clearAllMocks();
});

describe("handleRequest — protocol", () => {
  it("rejects a non-2.0 jsonrpc envelope", async () => {
    const res = await handleRequest(
      { ...rpcCall("ping"), jsonrpc: "1.0" as unknown as "2.0" },
      READ_KEY,
    );
    expect(res.error?.code).toBe(-32600);
  });

  it("initialize returns protocol version and serverInfo", async () => {
    const res = await handleRequest(rpcCall("initialize"), READ_KEY);
    expect(res.result).toMatchObject({
      protocolVersion: "2025-03-26",
      serverInfo: { name: "bbc-mcp" },
    });
  });

  it("ping returns {}", async () => {
    const res = await handleRequest(rpcCall("ping"), READ_KEY);
    expect(res.result).toEqual({});
  });

  it("tools/list returns all 8 tools", async () => {
    const res = await handleRequest(rpcCall("tools/list"), READ_KEY);
    expect(res.result).toMatchObject({ tools: TOOLS });
    expect((res.result as { tools: unknown[] }).tools).toHaveLength(8);
  });

  it("unknown methods return -32601", async () => {
    const res = await handleRequest(rpcCall("nonsense/method"), READ_KEY);
    expect(res.error?.code).toBe(-32601);
  });

  it("preserves the request id in the response", async () => {
    const res = await handleRequest(rpcCall("ping", undefined, "client-id-42"), READ_KEY);
    expect(res.id).toBe("client-id-42");
  });
});

describe("handleRequest — scope guards", () => {
  it("rejects submit_memory with a read-scope key", async () => {
    const res = await handleRequest(
      rpcCall("tools/call", { name: "submit_memory", arguments: { type: "note", title: "x" } }),
      READ_KEY,
    );
    expect(res.error?.code).toBe(-32001);
    expect(res.error?.message).toMatch(/Insufficient scope/);
    expect(brainApi.submitMemory).not.toHaveBeenCalled();
  });

  it("allows submit_memory with a write-scope key", async () => {
    vi.mocked(brainApi.submitMemory).mockResolvedValue({ ok: true, id: "mem-1" });
    const res = await handleRequest(
      rpcCall("tools/call", {
        name: "submit_memory",
        arguments: { type: "note", title: "hello" },
      }),
      WRITE_KEY,
    );
    expect(res.error).toBeUndefined();
    expect(brainApi.submitMemory).toHaveBeenCalledOnce();
  });

  it("allows read tools with a read-scope key", async () => {
    vi.mocked(brainApi.listMemories).mockResolvedValue([]);
    const res = await handleRequest(
      rpcCall("tools/call", { name: "list_memories", arguments: {} }),
      READ_KEY,
    );
    expect(res.error).toBeUndefined();
    expect(brainApi.listMemories).toHaveBeenCalledOnce();
  });
});

describe("tools/call — dispatch", () => {
  it("missing tool name returns -32602", async () => {
    const res = await handleRequest(
      rpcCall("tools/call", { arguments: {} }),
      READ_KEY,
    );
    expect(res.error?.code).toBe(-32602);
  });

  it("unknown tool name returns isError content", async () => {
    const res = await handleRequest(
      rpcCall("tools/call", { name: "no_such_tool", arguments: {} }),
      // Use admin scope so the scope guard doesn't fire first.
      { tenant_id: "tenant-abc", scope: "admin", role: null },
    );
    expect(res.result).toMatchObject({ isError: true });
  });

  it("list_memories passes tenant + filters to brain-api", async () => {
    vi.mocked(brainApi.listMemories).mockResolvedValue([
      { id: "m1", type: "decision", title: "ADR-1", updated_at: "2026-05-12T00:00:00Z" },
    ]);
    const res = await handleRequest(
      rpcCall("tools/call", {
        name: "list_memories",
        arguments: { type: "decision", limit: 10 },
      }),
      READ_KEY,
    );
    expect(brainApi.listMemories).toHaveBeenCalledWith(
      expect.anything(),
      "tenant-abc",
      { type: "decision", limit: 10, allowedTypes: null },
    );
    const result = res.result as { content: Array<{ text: string }>; isError: boolean };
    expect(result.isError).toBe(false);
    expect(JSON.parse(result.content[0].text)).toHaveLength(1);
  });

  it("get_memory rejects a non-uuid id", async () => {
    const res = await handleRequest(
      rpcCall("tools/call", { name: "get_memory", arguments: { id: "not-a-uuid" } }),
      READ_KEY,
    );
    expect(res.result).toMatchObject({ isError: true });
    expect(brainApi.getMemory).not.toHaveBeenCalled();
  });

  it("get_memory returns not-found content when brain-api returns null", async () => {
    vi.mocked(brainApi.getMemory).mockResolvedValue(null);
    const res = await handleRequest(
      rpcCall("tools/call", {
        name: "get_memory",
        arguments: { id: "11111111-2222-3333-4444-555555555555" },
      }),
      READ_KEY,
    );
    expect(res.result).toMatchObject({ isError: true });
  });

  it("get_proposal requires proposal_id", async () => {
    const res = await handleRequest(
      rpcCall("tools/call", { name: "get_proposal", arguments: {} }),
      READ_KEY,
    );
    expect(res.result).toMatchObject({ isError: true });
    expect(brainApi.getProposal).not.toHaveBeenCalled();
  });

  it("list_proposals normalizes an invalid status to undefined", async () => {
    vi.mocked(brainApi.listProposals).mockResolvedValue([]);
    await handleRequest(
      rpcCall("tools/call", {
        name: "list_proposals",
        arguments: { status: "bogus" },
      }),
      READ_KEY,
    );
    // list_proposals isn't role-filtered (proposals aren't memory types).
    expect(brainApi.listProposals).toHaveBeenCalledWith(
      expect.anything(),
      "tenant-abc",
      { status: undefined, limit: undefined },
    );
  });

  it("submit_memory surfaces a brain-api validation error as isError content", async () => {
    vi.mocked(brainApi.submitMemory).mockResolvedValue({ ok: false, error: "title required" });
    const res = await handleRequest(
      rpcCall("tools/call", {
        name: "submit_memory",
        arguments: { type: "note", title: "" },
      }),
      WRITE_KEY,
    );
    expect(res.result).toMatchObject({ isError: true });
  });

  it("dispatch-level exceptions become -32603 errors", async () => {
    vi.mocked(brainApi.listMemories).mockRejectedValue(new Error("db down"));
    const res = await handleRequest(
      rpcCall("tools/call", { name: "list_memories", arguments: {} }),
      READ_KEY,
    );
    expect(res.error?.code).toBe(-32603);
    expect(res.error?.message).toMatch(/Tool execution failed/);
  });
});

describe("tools/call — per-role memory-type filtering", () => {
  it("marketing-writer key passes allowedTypes to list_memories", async () => {
    vi.mocked(brainApi.listMemories).mockResolvedValue([]);
    await handleRequest(
      rpcCall("tools/call", { name: "list_memories", arguments: {} }),
      MARKETING_READ_KEY,
    );
    const call = vi.mocked(brainApi.listMemories).mock.calls[0];
    const opts = call[2] as { allowedTypes?: ReadonlySet<string> };
    expect(opts.allowedTypes).toBeDefined();
    // marketing-writer allowlist: voice, glossary, product, vendor, note
    expect(opts.allowedTypes?.has("voice")).toBe(true);
    expect(opts.allowedTypes?.has("product")).toBe(true);
    expect(opts.allowedTypes?.has("decision")).toBe(false);
    expect(opts.allowedTypes?.has("skill")).toBe(false);
  });

  it("null-role key passes allowedTypes=null (unrestricted)", async () => {
    vi.mocked(brainApi.listMemories).mockResolvedValue([]);
    await handleRequest(
      rpcCall("tools/call", { name: "list_memories", arguments: {} }),
      READ_KEY,
    );
    const call = vi.mocked(brainApi.listMemories).mock.calls[0];
    const opts = call[2] as { allowedTypes?: ReadonlySet<string> | null };
    expect(opts.allowedTypes).toBeNull();
  });

  it("unknown role falls back to null (permissive)", async () => {
    vi.mocked(brainApi.listMemories).mockResolvedValue([]);
    await handleRequest(
      rpcCall("tools/call", { name: "list_memories", arguments: {} }),
      { tenant_id: "tenant-abc", scope: "read", role: "no-such-role" },
    );
    const call = vi.mocked(brainApi.listMemories).mock.calls[0];
    const opts = call[2] as { allowedTypes?: ReadonlySet<string> | null };
    expect(opts.allowedTypes).toBeNull();
  });

  it("marketing-writer key passes allowedTypes to get_memory", async () => {
    vi.mocked(brainApi.getMemory).mockResolvedValue(null);
    await handleRequest(
      rpcCall("tools/call", {
        name: "get_memory",
        arguments: { id: "11111111-2222-3333-4444-555555555555" },
      }),
      MARKETING_READ_KEY,
    );
    const call = vi.mocked(brainApi.getMemory).mock.calls[0];
    const opts = call[3] as { allowedTypes?: ReadonlySet<string> };
    expect(opts.allowedTypes?.has("voice")).toBe(true);
    expect(opts.allowedTypes?.has("decision")).toBe(false);
  });

  it("marketing-writer key passes allowedTypes to submit_memory", async () => {
    vi.mocked(brainApi.submitMemory).mockResolvedValue({ ok: true, id: "mem-1" });
    await handleRequest(
      rpcCall("tools/call", {
        name: "submit_memory",
        arguments: { type: "voice", title: "x" },
      }),
      MARKETING_WRITE_KEY,
    );
    const call = vi.mocked(brainApi.submitMemory).mock.calls[0];
    const opts = call[3] as { allowedTypes?: ReadonlySet<string> };
    expect(opts.allowedTypes?.has("voice")).toBe(true);
    expect(opts.allowedTypes?.has("decision")).toBe(false);
  });
});
