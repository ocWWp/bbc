import { describe, expect, it, vi, beforeEach } from "vitest";

// Task 30 of v1.5 launch polish. readInbox returns the actor's items split
// by channel, sorted unread-first then newest-first. The from_bbc_unread
// count drives the bell badge; mentions_visible drives whether the
// Mentions tab even shows (Task 31's empty-state policy).

let supabaseRows: Array<{
  id: string;
  channel: "from_bbc" | "mentions";
  kind: string;
  title: string;
  body: string | null;
  source_kind: string | null;
  source_queue_item_id: string | null;
  source_recommendation_id: string | null;
  source_memory_id: string | null;
  flagger_user_id: string | null;
  read_at: string | null;
  created_at: string;
}> = [];

vi.mock("@/lib/auth/require-user", () => ({
  requireActor: vi.fn(async () => ({
    ok: true as const,
    actor: {
      user_id: "u1",
      provider: "github",
      identifier: "alice",
      actor: "human:github:alice",
      tenant_id: "t1",
      tenant_slug: "acme",
      role: "member" as const,
      templateSlug: null,
    },
  })),
}));

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServerClient: vi.fn(async () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            order: () => ({
              limit: () => Promise.resolve({ data: supabaseRows, error: null }),
            }),
          }),
        }),
      }),
    }),
  })),
}));

import { readInbox } from "./read-inbox";

beforeEach(() => {
  supabaseRows = [];
});

describe("readInbox", () => {
  it("returns empty channels when there are no rows", async () => {
    const v = await readInbox();
    expect(v.from_bbc).toEqual([]);
    expect(v.mentions).toEqual([]);
    expect(v.from_bbc_unread).toBe(0);
    expect(v.mentions_visible).toBe(false);
  });

  it("splits rows into from_bbc and mentions channels", async () => {
    supabaseRows = [
      mk("a", "from_bbc", null, "2026-05-13T10:00:00Z"),
      mk("b", "mentions", null, "2026-05-13T09:00:00Z"),
      mk("c", "from_bbc", null, "2026-05-13T08:00:00Z"),
    ];
    const v = await readInbox();
    expect(v.from_bbc.map((r) => r.id)).toEqual(["a", "c"]);
    expect(v.mentions.map((r) => r.id)).toEqual(["b"]);
  });

  it("sorts unread before read within each channel", async () => {
    supabaseRows = [
      mk("read-newest", "from_bbc", "2026-05-13T11:00:00Z", "2026-05-13T11:00:00Z"),
      mk("unread-oldest", "from_bbc", null, "2026-05-12T11:00:00Z"),
      mk("unread-middle", "from_bbc", null, "2026-05-13T09:00:00Z"),
    ];
    const v = await readInbox();
    expect(v.from_bbc.map((r) => r.id)).toEqual(["unread-middle", "unread-oldest", "read-newest"]);
  });

  it("from_bbc_unread counts only unread from_bbc rows", async () => {
    supabaseRows = [
      mk("u1", "from_bbc", null, "2026-05-13T10:00:00Z"),
      mk("u2", "from_bbc", null, "2026-05-13T09:00:00Z"),
      mk("u3", "from_bbc", "2026-05-13T10:01:00Z", "2026-05-13T10:01:00Z"),
      mk("u4", "mentions", null, "2026-05-13T08:00:00Z"),
    ];
    const v = await readInbox();
    expect(v.from_bbc_unread).toBe(2);
  });

  it("mentions_visible is true when there's at least one mention row", async () => {
    supabaseRows = [mk("a", "mentions", "2026-05-13T10:00:00Z", "2026-05-13T10:00:00Z")];
    const v = await readInbox();
    expect(v.mentions_visible).toBe(true);
  });

  it("mentions_visible is false when there are no mention rows", async () => {
    supabaseRows = [mk("a", "from_bbc", null, "2026-05-13T10:00:00Z")];
    const v = await readInbox();
    expect(v.mentions_visible).toBe(false);
  });
});

function mk(
  id: string,
  channel: "from_bbc" | "mentions",
  read_at: string | null,
  created_at: string,
) {
  return {
    id,
    channel,
    kind: "flag_resolved",
    title: `Item ${id}`,
    body: null,
    source_kind: null,
    source_queue_item_id: null,
    source_recommendation_id: null,
    source_memory_id: null,
    flagger_user_id: null,
    read_at,
    created_at,
  };
}
