import { describe, expect, it, vi } from "vitest";

// Task 14 of v1.5 launch polish. /brain is read-only for members. The
// *security* of that gate is the operator-only requireRole on each mutating
// memory action — RLS at the SQL layer (ADR-0012, migration 0042) is the
// real backstop; this test is the application-layer defense-in-depth.

vi.mock("@/lib/auth/require-user", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/require-user")>();
  return {
    ...actual,
    requireActor: vi.fn(),
  };
});

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServerClient: vi.fn(async () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({ single: () => Promise.resolve({ data: { type: "note" }, error: null }) }),
          single: () => Promise.resolve({ data: { type: "note" }, error: null }),
        }),
      }),
      insert: () => ({ select: () => ({ single: () => Promise.resolve({ data: { id: "x" }, error: null }) }) }),
      update: () => ({
        eq: () => ({ eq: () => Promise.resolve({ error: null }) }),
      }),
      delete: () => ({
        eq: () => ({ eq: () => Promise.resolve({ error: null }) }),
      }),
    }),
  })),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

import { requireActor } from "@/lib/auth/require-user";
import {
  updateMemoryItem,
  archiveMemoryItem,
  publishMemoryItem,
  createBlankItem,
  createRelation,
  deleteRelation,
} from "./actions";

const requireActorMock = requireActor as ReturnType<typeof vi.fn>;

type Role = "admin" | "operator" | "member" | "viewer";
function actorOf(role: Role) {
  return {
    ok: true as const,
    actor: {
      user_id: "u1",
      provider: "github",
      identifier: "alice",
      actor: "human:github:alice",
      tenant_id: "t1",
      tenant_slug: "acme",
      role,
      templateSlug: null,
    },
  };
}

describe("memory actions require operator+", () => {
  it("updateMemoryItem: member is forbidden", async () => {
    requireActorMock.mockResolvedValueOnce(actorOf("member"));
    const r = await updateMemoryItem("m1", { title: "x" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("forbidden");
  });

  it("updateMemoryItem: viewer is forbidden", async () => {
    requireActorMock.mockResolvedValueOnce(actorOf("viewer"));
    const r = await updateMemoryItem("m1", { title: "x" });
    expect(r.ok).toBe(false);
  });

  it("updateMemoryItem: operator succeeds", async () => {
    requireActorMock.mockResolvedValueOnce(actorOf("operator"));
    const r = await updateMemoryItem("m1", { title: "x" });
    expect(r.ok).toBe(true);
  });

  it("archiveMemoryItem: member is forbidden (throws)", async () => {
    requireActorMock.mockResolvedValueOnce(actorOf("member"));
    await expect(archiveMemoryItem("m1")).rejects.toThrow(/forbidden/);
  });

  it("publishMemoryItem: member is forbidden (throws)", async () => {
    requireActorMock.mockResolvedValueOnce(actorOf("member"));
    await expect(publishMemoryItem("m1")).rejects.toThrow(/forbidden/);
  });

  it("createBlankItem: member is forbidden (throws)", async () => {
    requireActorMock.mockResolvedValueOnce(actorOf("member"));
    await expect(createBlankItem("note")).rejects.toThrow(/forbidden/);
  });

  it("createRelation: member is forbidden", async () => {
    requireActorMock.mockResolvedValueOnce(actorOf("member"));
    const r = await createRelation("a", "b", "supersedes");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("forbidden");
  });

  it("deleteRelation: member is forbidden", async () => {
    requireActorMock.mockResolvedValueOnce(actorOf("member"));
    const r = await deleteRelation("r1");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("forbidden");
  });

  it("createRelation: admin succeeds", async () => {
    requireActorMock.mockResolvedValueOnce(actorOf("admin"));
    const r = await createRelation("a", "b", "supersedes");
    expect(r.ok).toBe(true);
  });
});
