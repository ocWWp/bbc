import { describe, expect, it, vi, beforeEach } from "vitest";

// Task 16 of v1.5 launch polish. flagMemory enqueues a proposal via the
// store's fileProposal interface — file-mode shells out to propose.sh,
// db-mode invokes the propose_change RPC. Both paths share the same shape
// (Task 0d).

vi.mock("@/lib/auth/require-user", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/require-user")>();
  return { ...actual, requireActor: vi.fn() };
});

const getMemoryItemMock = vi.fn();
vi.mock("../../memory/queries", () => ({
  getMemoryItem: (id: string) => getMemoryItemMock(id),
}));

const fileProposalMock = vi.fn();
vi.mock("@/lib/store", () => ({
  getStore: vi.fn(async () => ({
    queue: { fileProposal: (input: unknown) => fileProposalMock(input) },
  })),
}));

import { requireActor } from "@/lib/auth/require-user";
import { flagMemory } from "./flag-action";

const requireActorMock = requireActor as ReturnType<typeof vi.fn>;

function actorOf(role: "admin" | "operator" | "member" | "viewer", tenantId = "t1") {
  return {
    ok: true as const,
    actor: {
      user_id: "u1",
      provider: "github",
      identifier: "alice",
      actor: "human:github:alice",
      tenant_id: tenantId,
      tenant_slug: "acme",
      role,
      templateSlug: null,
    },
  };
}

function fdOf(memory_id: string, reason: string): FormData {
  const fd = new FormData();
  if (memory_id) fd.append("memory_id", memory_id);
  if (reason) fd.append("reason", reason);
  return fd;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("flagMemory — files a flag proposal", () => {
  it("member with valid input → store.queue.fileProposal called and ok:true", async () => {
    requireActorMock.mockResolvedValueOnce(actorOf("member"));
    getMemoryItemMock.mockResolvedValueOnce({
      id: "m1",
      tenant_id: "t1",
      type: "decision",
      title: "Use RLS",
      path: "memory/decision/use-rls.md",
    });
    fileProposalMock.mockResolvedValueOnce({ ok: true, output: "queued", id: "prop_abc" });

    const r = await flagMemory(fdOf("m1", "voice rule feels off"));

    expect(r).toEqual({ ok: true, id: "prop_abc" });
    expect(fileProposalMock).toHaveBeenCalledOnce();
    const call = fileProposalMock.mock.calls[0][0] as Record<string, unknown>;
    expect(call.tenant_id).toBe("t1");
    expect(call.target_file).toBe("memory/decision/use-rls.md");
    expect(call.change_kind).toBe("flag");
    expect((call.summary as string).startsWith("Flag:")).toBe(true);
    expect(call.source_memory_id).toBe("m1");
    expect((call.body as string)).toContain("voice rule feels off");
    expect((call.body as string)).toContain("/brain/m1");
  });

  it("unauthenticated → { ok: false, code: 'unauthorized' }", async () => {
    requireActorMock.mockResolvedValueOnce({ ok: false, output: "no session" });
    const r = await flagMemory(fdOf("m1", "anything"));
    expect(r).toEqual({ ok: false, code: "unauthorized" });
    expect(fileProposalMock).not.toHaveBeenCalled();
  });

  it("missing memory_id → invalid_input", async () => {
    requireActorMock.mockResolvedValueOnce(actorOf("member"));
    const r = await flagMemory(fdOf("", "reason"));
    expect(r).toEqual({ ok: false, code: "invalid_input" });
  });

  it("missing reason → invalid_input", async () => {
    requireActorMock.mockResolvedValueOnce(actorOf("member"));
    const r = await flagMemory(fdOf("m1", ""));
    expect(r).toEqual({ ok: false, code: "invalid_input" });
  });

  it("memory not found → not_found", async () => {
    requireActorMock.mockResolvedValueOnce(actorOf("member"));
    getMemoryItemMock.mockResolvedValueOnce(null);
    const r = await flagMemory(fdOf("m1", "reason"));
    expect(r).toEqual({ ok: false, code: "not_found" });
  });

  it("memory from another tenant → not_found", async () => {
    requireActorMock.mockResolvedValueOnce(actorOf("member", "t1"));
    getMemoryItemMock.mockResolvedValueOnce({
      id: "m1",
      tenant_id: "t2",
      type: "decision",
      title: "Use RLS",
      path: "memory/decision/use-rls.md",
    });
    const r = await flagMemory(fdOf("m1", "reason"));
    expect(r).toEqual({ ok: false, code: "not_found" });
    expect(fileProposalMock).not.toHaveBeenCalled();
  });

  it("legacy memory with null path falls back to memory/files/<id>.md", async () => {
    requireActorMock.mockResolvedValueOnce(actorOf("member"));
    getMemoryItemMock.mockResolvedValueOnce({
      id: "m_legacy",
      tenant_id: "t1",
      type: "decision",
      title: "x",
      path: null,
    });
    fileProposalMock.mockResolvedValueOnce({ ok: true, output: "queued", id: "prop_xyz" });
    await flagMemory(fdOf("m_legacy", "reason"));
    const call = fileProposalMock.mock.calls[0][0] as Record<string, unknown>;
    expect(call.target_file).toBe("memory/files/m_legacy.md");
  });

  it("long reason is truncated in summary but kept in body", async () => {
    requireActorMock.mockResolvedValueOnce(actorOf("member"));
    getMemoryItemMock.mockResolvedValueOnce({
      id: "m1",
      tenant_id: "t1",
      type: "decision",
      title: "x",
      path: "memory/x.md",
    });
    fileProposalMock.mockResolvedValueOnce({ ok: true, output: "queued", id: "prop_abc" });
    const longReason = "a".repeat(120);
    await flagMemory(fdOf("m1", longReason));
    const call = fileProposalMock.mock.calls[0][0] as Record<string, unknown>;
    expect((call.summary as string).length).toBeLessThanOrEqual(90);
    expect((call.body as string)).toContain(longReason);
  });

  it("fileProposal returns ok:false → store_error", async () => {
    requireActorMock.mockResolvedValueOnce(actorOf("member"));
    getMemoryItemMock.mockResolvedValueOnce({
      id: "m1",
      tenant_id: "t1",
      type: "decision",
      title: "x",
      path: "memory/x.md",
    });
    fileProposalMock.mockResolvedValueOnce({ ok: false, output: "rpc failed" });
    const r = await flagMemory(fdOf("m1", "reason"));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe("store_error");
      expect(r.error).toBe("rpc failed");
    }
  });
});
