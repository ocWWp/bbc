import { describe, expect, it, vi, beforeEach } from "vitest";

// Task 32: when an operator accepts/rejects a flag proposal, write a
// from_bbc row into the flagger's inbox.

let supabaseRow: { id: string; frontmatter: Record<string, unknown> | null } | null = null;

const insertSpy = vi.fn();

vi.mock("@/lib/inbox/insert-inbox-item", () => ({
  insertInboxItem: (input: unknown) => insertSpy(input),
}));

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServerClient: vi.fn(async () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            maybeSingle: () => Promise.resolve({ data: supabaseRow, error: null }),
          }),
        }),
      }),
    }),
  })),
}));

import { notifyFlagResolved } from "./notify-flag-resolved";

beforeEach(() => {
  supabaseRow = null;
  insertSpy.mockReset();
  insertSpy.mockResolvedValue("inbox-row-1");
});

describe("notifyFlagResolved", () => {
  it("writes a from_bbc/flag_resolved row when accepting a flag proposal", async () => {
    supabaseRow = {
      id: "qi-uuid",
      frontmatter: {
        change_kind: "flag",
        proposed_by: "flagger-user-id",
        source_memory_id: "mem-1",
      },
    };
    await notifyFlagResolved({
      tenant_id: "t1",
      proposal_id: "prop_flag_voice",
      resolution: "accepted",
    });
    expect(insertSpy).toHaveBeenCalledOnce();
    const call = insertSpy.mock.calls[0][0];
    expect(call.tenant_id).toBe("t1");
    expect(call.user_id).toBe("flagger-user-id");
    expect(call.channel).toBe("from_bbc");
    expect(call.kind).toBe("flag_resolved");
    expect(call.source_kind).toBe("queue_item");
    expect(call.source_queue_item_id).toBe("qi-uuid");
    expect(call.source_memory_id).toBe("mem-1");
    expect(call.flagger_user_id).toBe("flagger-user-id");
    expect(call.title).toMatch(/accepted/i);
  });

  it("forwards the reject reason into the inbox body", async () => {
    supabaseRow = {
      id: "qi-uuid",
      frontmatter: {
        change_kind: "flag",
        proposed_by: "flagger-user-id",
        source_memory_id: "mem-1",
      },
    };
    await notifyFlagResolved({
      tenant_id: "t1",
      proposal_id: "prop_flag_voice",
      resolution: "rejected",
      resolution_note: "voice rule is intentional",
    });
    const call = insertSpy.mock.calls[0][0];
    expect(call.body).toBe("voice rule is intentional");
    expect(call.title).toMatch(/reviewed/i);
  });

  it("no-ops when the proposal is not a flag (admin edit / vendor swap / etc.)", async () => {
    supabaseRow = {
      id: "qi-uuid",
      frontmatter: { change_kind: "edit", proposed_by: "u1" },
    };
    await notifyFlagResolved({
      tenant_id: "t1",
      proposal_id: "prop_edit_voice",
      resolution: "accepted",
    });
    expect(insertSpy).not.toHaveBeenCalled();
  });

  it("no-ops when proposed_by is missing (legacy proposals)", async () => {
    supabaseRow = {
      id: "qi-uuid",
      frontmatter: { change_kind: "flag" },
    };
    await notifyFlagResolved({
      tenant_id: "t1",
      proposal_id: "prop_legacy",
      resolution: "accepted",
    });
    expect(insertSpy).not.toHaveBeenCalled();
  });

  it("no-ops when the queue_item row cannot be found", async () => {
    supabaseRow = null;
    await notifyFlagResolved({
      tenant_id: "t1",
      proposal_id: "prop_missing",
      resolution: "accepted",
    });
    expect(insertSpy).not.toHaveBeenCalled();
  });

  it("omits source_memory_id when the frontmatter doesn't carry one", async () => {
    supabaseRow = {
      id: "qi-uuid",
      frontmatter: { change_kind: "flag", proposed_by: "flagger" },
    };
    await notifyFlagResolved({
      tenant_id: "t1",
      proposal_id: "prop_flag_no_memory",
      resolution: "accepted",
    });
    const call = insertSpy.mock.calls[0][0];
    expect(call.source_memory_id).toBeUndefined();
  });
});
