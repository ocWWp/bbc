import { describe, expect, it, vi } from "vitest";
import { SupabaseQueueStore } from "@bbc/store/supabase";

// Task 0d coverage for the DB-mode write path. LocalQueueStore.fileProposal
// is covered by a smoke run against the real propose.sh in
// `packages/store/...` (the bash script's own arg parsing is the contract,
// and that's exercised end-to-end whenever the dashboard files a proposal).

type RpcArgs = Record<string, unknown>;

function makeStub() {
  const calls: { fn: string; args: RpcArgs }[] = [];
  const client = {
    rpc(fn: string, args: RpcArgs) {
      calls.push({ fn, args });
      return Promise.resolve({
        data: "prop_2026-05-13T22-00-00Z_dashboard_test-summary",
        error: null,
      });
    },
  };
  return { client, calls };
}

describe("SupabaseQueueStore.fileProposal", () => {
  it("invokes propose_change with the expected parameter shape", async () => {
    const { client, calls } = makeStub();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const store = new SupabaseQueueStore(client as any);

    const result = await store.fileProposal({
      tenant_id: "00000000-0000-0000-0000-000000000001",
      target_file: "memory/decisions/test.md",
      change_kind: "flag",
      summary: "test summary",
      body: "body content",
      source_memory_id: "00000000-0000-0000-0000-000000000002",
    });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.id).toMatch(/^prop_/);

    expect(calls).toHaveLength(1);
    expect(calls[0]?.fn).toBe("propose_change");
    expect(calls[0]?.args).toEqual({
      p_tenant_id: "00000000-0000-0000-0000-000000000001",
      p_target_file: "memory/decisions/test.md",
      p_change_kind: "flag",
      p_summary: "test summary",
      p_body: "body content",
      p_source_memory_id: "00000000-0000-0000-0000-000000000002",
      p_target_layer: "main",
    });
  });

  it("defaults source_memory_id to null and target_layer to main", async () => {
    const { client, calls } = makeStub();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const store = new SupabaseQueueStore(client as any);

    await store.fileProposal({
      tenant_id: "00000000-0000-0000-0000-000000000001",
      target_file: "memory/decisions/test.md",
      change_kind: "edit",
      summary: "test summary",
      body: "body",
    });

    expect(calls[0]?.args.p_source_memory_id).toBeNull();
    expect(calls[0]?.args.p_target_layer).toBe("main");
  });

  it("returns {ok: false} when the RPC returns an error", async () => {
    const errorClient = {
      rpc: vi.fn().mockResolvedValue({
        data: null,
        error: { message: "forbidden: not a member of tenant" },
      }),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const store = new SupabaseQueueStore(errorClient as any);

    const result = await store.fileProposal({
      tenant_id: "00000000-0000-0000-0000-000000000001",
      target_file: "memory/decisions/test.md",
      change_kind: "edit",
      summary: "test summary",
      body: "body",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.output).toContain("not a member");
  });
});
