import { describe, it, expect, vi, beforeEach } from "vitest";

const requireActorMock = vi.fn();
vi.mock("@/lib/auth/require-user", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth/require-user")>()),
  requireActor: () => requireActorMock(),
}));

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServerClient: async () => ({}),
}));

const searchMemoriesMock = vi.fn();
vi.mock("@/lib/brain-api", () => ({
  searchMemories: (...a: unknown[]) => searchMemoriesMock(...a),
}));

function memberActor() {
  return {
    ok: true as const,
    actor: { user_id: "u1", tenant_id: "t1", role: "member" as const, identifier: "u@x.com" },
  };
}

beforeEach(() => {
  requireActorMock.mockReset();
  requireActorMock.mockResolvedValue(memberActor());
  searchMemoriesMock.mockReset();
});

describe("searchBrain", () => {
  it("returns hits from searchMemories scoped to the actor's tenant", async () => {
    const hits = [
      { id: "m1", type: "decision", title: "Q3 metrics", updated_at: "2026-04-12T00:00:00Z" },
      { id: "m2", type: "glossary", title: "runway", updated_at: "2026-05-10T00:00:00Z" },
    ];
    searchMemoriesMock.mockResolvedValueOnce(hits);
    const { searchBrain } = await import("./search-brain-action");

    const res = await searchBrain("company doing");
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.hits).toEqual(hits);

    expect(searchMemoriesMock).toHaveBeenCalledWith(
      expect.anything(),
      "t1",
      expect.objectContaining({ query: "company doing", limit: 8 }),
    );
  });

  it("rejects an unauthorized actor without calling the brain", async () => {
    requireActorMock.mockResolvedValueOnce({ ok: false, output: "nope" });
    const { searchBrain } = await import("./search-brain-action");

    const res = await searchBrain("a query");
    expect(res.ok).toBe(false);
    expect(searchMemoriesMock).not.toHaveBeenCalled();
  });

  it("rejects a too-short query (no DB call)", async () => {
    const { searchBrain } = await import("./search-brain-action");
    const res = await searchBrain("a");
    expect(res.ok).toBe(false);
    expect(searchMemoriesMock).not.toHaveBeenCalled();
  });

  it("rejects an over-long query (no DB call)", async () => {
    const { searchBrain } = await import("./search-brain-action");
    const res = await searchBrain("x".repeat(501));
    expect(res.ok).toBe(false);
    expect(searchMemoriesMock).not.toHaveBeenCalled();
  });

  it("returns ok with an empty hits array when the brain has no matches", async () => {
    searchMemoriesMock.mockResolvedValueOnce([]);
    const { searchBrain } = await import("./search-brain-action");
    const res = await searchBrain("nonexistent topic");
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.hits).toEqual([]);
  });

  it("returns a stable generic error on brain-api failure (does NOT leak internal error text)", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    searchMemoriesMock.mockRejectedValueOnce(
      new Error("searchMemories: relation \"memory_files_secret\" does not exist"),
    );
    const { searchBrain } = await import("./search-brain-action");
    const res = await searchBrain("anything");
    expect(res.ok).toBe(false);
    if (!res.ok) {
      // Generic message — no internal helper name, no DB shape.
      expect(res.error).not.toContain("searchMemories");
      expect(res.error).not.toContain("relation");
      expect(res.error).toMatch(/try again/i);
    }
    // But the detail IS logged server-side for ops to see.
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("searchBrain"),
    );
    errorSpy.mockRestore();
  });
});
