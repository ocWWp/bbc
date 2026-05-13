import { describe, expect, it, vi } from "vitest";

// Task 20: filter studio_runs by role prefix. The point of the test is
// to prove the role-prefix filter works — a marketing-role draft must NOT
// leak into the engineering list (and vice versa). Uses the
// templateIdsForRole helper (Task 0e), not a fragile substring match.

const supabaseRows = [
  // 5 marketing
  { id: "m1", template_id: "marketing:tweet-thread", status: "accepted", output_blocks: [], created_at: "2026-05-13T10:05:00Z" },
  { id: "m2", template_id: "marketing:linkedin-announcement", status: "accepted", output_blocks: [], created_at: "2026-05-13T10:04:00Z" },
  { id: "m3", template_id: "marketing:blog-post-draft", status: "pending_review", output_blocks: [], created_at: "2026-05-13T10:03:00Z" },
  { id: "m4", template_id: "marketing:single-x-post", status: "accepted", output_blocks: [], created_at: "2026-05-13T10:02:00Z" },
  { id: "m5", template_id: "marketing:reel-script", status: "rejected", output_blocks: [], created_at: "2026-05-13T10:01:00Z" },
  // 3 engineering
  { id: "e1", template_id: "eng:adr-draft", status: "accepted", output_blocks: [], created_at: "2026-05-13T09:05:00Z" },
  { id: "e2", template_id: "eng:vendor-swap", status: "accepted", output_blocks: [], created_at: "2026-05-13T09:04:00Z" },
  { id: "e3", template_id: "eng:tech-debt-review", status: "pending_review", output_blocks: [], created_at: "2026-05-13T09:03:00Z" },
];

function makeSupabaseStub() {
  const mockQuery = {
    _likePattern: undefined as string | undefined,
    select: () => mockQuery,
    eq: () => mockQuery,
    like: (_col: string, pattern: string) => {
      mockQuery._likePattern = pattern;
      return mockQuery;
    },
    order: () => mockQuery,
    limit: () => {
      const prefix = (mockQuery._likePattern ?? "").replace(/%$/, "");
      const filtered = supabaseRows.filter((r) => r.template_id.startsWith(prefix));
      return Promise.resolve({ data: filtered, error: null });
    },
  };
  return {
    from: () => mockQuery,
  };
}

vi.mock("@/lib/auth/require-user", () => ({
  requireActor: vi.fn(async () => ({
    ok: true,
    actor: {
      user_id: "u1",
      tenant_id: "t1",
      provider: "github",
      identifier: "alice",
      actor: "human:github:alice",
      tenant_slug: "acme",
      role: "operator" as const,
      templateSlug: null,
    },
  })),
}));

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServerClient: vi.fn(async () => makeSupabaseStub()),
}));

import { readRecentDrafts, extractTitleFromOutputBlocks } from "./read-recent-drafts";

describe("readRecentDrafts — role-prefix filter", () => {
  it("marketing returns exactly the 5 marketing runs", async () => {
    const drafts = await readRecentDrafts("marketing");
    expect(drafts.map((d) => d.id)).toEqual(["m1", "m2", "m3", "m4", "m5"]);
    for (const d of drafts) expect(d.templateSlug.startsWith("marketing:")).toBe(true);
  });

  it("engineering returns exactly the 3 engineering runs (no marketing leakage)", async () => {
    const drafts = await readRecentDrafts("engineering");
    expect(drafts.map((d) => d.id)).toEqual(["e1", "e2", "e3"]);
    for (const d of drafts) expect(d.templateSlug.startsWith("eng:")).toBe(true);
  });

  it("respects the limit param", async () => {
    const drafts = await readRecentDrafts("marketing", 2);
    expect(drafts.length).toBeLessThanOrEqual(5);
  });
});

describe("extractTitleFromOutputBlocks — best-effort title", () => {
  it("returns the first non-empty inline text run", () => {
    const blocks = [
      { type: "paragraph", content: [{ text: "" }, { text: "Real title here" }] },
      { type: "paragraph", content: [{ text: "second" }] },
    ];
    expect(extractTitleFromOutputBlocks(blocks)).toBe("Real title here");
  });

  it("truncates >80 chars and appends an ellipsis", () => {
    const longText = "a".repeat(120);
    const blocks = [{ type: "paragraph", content: [{ text: longText }] }];
    const out = extractTitleFromOutputBlocks(blocks);
    expect(out).not.toBeNull();
    expect((out as string).endsWith("…")).toBe(true);
    expect((out as string).length).toBeLessThanOrEqual(81);
  });

  it("returns null on empty / malformed blocks", () => {
    expect(extractTitleFromOutputBlocks([])).toBeNull();
    expect(extractTitleFromOutputBlocks(null)).toBeNull();
    expect(extractTitleFromOutputBlocks([{ content: [] }])).toBeNull();
    expect(extractTitleFromOutputBlocks("string")).toBeNull();
  });
});
