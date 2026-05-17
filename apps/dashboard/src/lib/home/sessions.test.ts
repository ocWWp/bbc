import { describe, expect, it, vi, beforeEach } from "vitest";

// Critical-path coverage for session helpers: existing-session reuse,
// cold-create, turn append, and finalize. Exhaustive coverage (RLS,
// concurrent sessions, archive cleanup) is deferred — the helpers are
// thin wrappers and RLS is enforced at the DB layer.

type Row = Record<string, unknown> & { id?: string };

function makeSupabaseStub(initial: {
  sessions?: Row[];
  turns?: Row[];
} = {}) {
  const state = {
    sessions: [...(initial.sessions ?? [])],
    turns: [...(initial.turns ?? [])],
    lastInsertTable: "" as string,
    lastInsertRow: undefined as Row | undefined,
    lastUpdateTable: "" as string,
    lastUpdatePatch: undefined as Row | undefined,
    lastUpdateId: undefined as string | undefined,
  };

  function builder(table: "home_sessions" | "home_turns") {
    let filters: Record<string, unknown> = {};
    let isNullCol: string | null = null;
    const query: Record<string, unknown> = {
      select: () => query,
      eq: (col: string, val: unknown) => {
        filters[col] = val;
        return query;
      },
      is: (col: string, val: unknown) => {
        if (val === null) isNullCol = col;
        return query;
      },
      order: () => query,
      limit: () => query,
      maybeSingle: async () => {
        const bag = table === "home_sessions" ? state.sessions : state.turns;
        const match = bag.find((r) => {
          for (const [k, v] of Object.entries(filters)) {
            if (r[k] !== v) return false;
          }
          if (isNullCol && r[isNullCol] !== null && r[isNullCol] !== undefined) return false;
          return true;
        });
        return { data: match ?? null, error: null };
      },
      single: async () => {
        // single() is used after insert+select chain; pick the last inserted row
        const row = state.lastInsertRow;
        return row
          ? { data: row, error: null }
          : { data: null, error: { message: "no row" } };
      },
      insert: (row: Row) => {
        const next: Row = { id: `${table}-${Date.now()}-${Math.random()}`, ...row };
        if (table === "home_sessions") state.sessions.push(next);
        else state.turns.push(next);
        state.lastInsertTable = table;
        state.lastInsertRow = next;
        // chained .select().single() reads lastInsertRow
        return query;
      },
      update: (patch: Row) => {
        state.lastUpdateTable = table;
        state.lastUpdatePatch = patch;
        return {
          eq: async (col: string, val: unknown) => {
            const bag = table === "home_sessions" ? state.sessions : state.turns;
            const idx = bag.findIndex((r) => r[col] === val);
            if (idx >= 0) Object.assign(bag[idx], patch);
            state.lastUpdateId = String(val);
            return { error: null };
          },
        };
      },
    };
    return query;
  }

  return {
    from: (table: "home_sessions" | "home_turns") => builder(table),
    _state: state,
  };
}

let stub: ReturnType<typeof makeSupabaseStub>;

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServerClient: vi.fn(async () => stub),
}));

import {
  appendTurn,
  archiveSession,
  finalizeTurn,
  getOrCreateActiveSession,
} from "./sessions";

beforeEach(() => {
  stub = makeSupabaseStub();
});

describe("getOrCreateActiveSession", () => {
  it("returns the existing active session when one exists", async () => {
    stub = makeSupabaseStub({
      sessions: [
        {
          id: "s1",
          tenant_id: "t1",
          user_id: "u1",
          archived_at: null,
          started_at: "2026-05-15T00:00:00Z",
          last_activity_at: "2026-05-15T00:00:00Z",
        },
      ],
    });
    const out = await getOrCreateActiveSession("t1", "u1");
    expect(out.id).toBe("s1");
    expect(stub._state.lastInsertTable).toBe(""); // no insert
  });

  it("inserts a new session when none active", async () => {
    const out = await getOrCreateActiveSession("t1", "u1");
    expect(out.tenant_id).toBe("t1");
    expect(out.user_id).toBe("u1");
    expect(stub._state.lastInsertTable).toBe("home_sessions");
  });

  it("does not reuse archived sessions", async () => {
    stub = makeSupabaseStub({
      sessions: [
        {
          id: "old",
          tenant_id: "t1",
          user_id: "u1",
          archived_at: "2026-05-14T00:00:00Z",
          started_at: "2026-05-14T00:00:00Z",
          last_activity_at: "2026-05-14T00:00:00Z",
        },
      ],
    });
    const out = await getOrCreateActiveSession("t1", "u1");
    expect(out.id).not.toBe("old");
    expect(stub._state.lastInsertTable).toBe("home_sessions");
  });
});

describe("appendTurn", () => {
  it("inserts a turn with status=in_progress (no finalized_at)", async () => {
    await appendTurn("s1", "agent", { text: "thinking..." }, "in_progress");
    const row = stub._state.lastInsertRow!;
    expect(row.session_id).toBe("s1");
    expect(row.role).toBe("agent");
    expect(row.status).toBe("in_progress");
    expect(row.finalized_at).toBeNull();
  });

  it("inserts a completed user turn with finalized_at set", async () => {
    await appendTurn("s1", "user", { text: "hi" });
    const row = stub._state.lastInsertRow!;
    expect(row.role).toBe("user");
    expect(row.status).toBe("completed");
    expect(row.finalized_at).toBeTypeOf("string");
  });

  it("bumps last_activity_at on the session", async () => {
    await appendTurn("s1", "user", { text: "hi" });
    expect(stub._state.lastUpdateTable).toBe("home_sessions");
    expect(stub._state.lastUpdateId).toBe("s1");
    expect((stub._state.lastUpdatePatch as Row).last_activity_at).toBeTypeOf("string");
  });
});

describe("finalizeTurn", () => {
  it("updates status + finalized_at + content on the target turn", async () => {
    await finalizeTurn("t1", { text: "answer" }, "completed");
    expect(stub._state.lastUpdateTable).toBe("home_turns");
    expect(stub._state.lastUpdateId).toBe("t1");
    const patch = stub._state.lastUpdatePatch as Row;
    expect(patch.status).toBe("completed");
    expect(patch.finalized_at).toBeTypeOf("string");
  });

  it("supports aborted status (user cancel)", async () => {
    await finalizeTurn("t1", { text: "partial" }, "aborted");
    expect((stub._state.lastUpdatePatch as Row).status).toBe("aborted");
  });
});

describe("archiveSession", () => {
  it("sets archived_at on the session", async () => {
    await archiveSession("s1");
    expect(stub._state.lastUpdateTable).toBe("home_sessions");
    expect((stub._state.lastUpdatePatch as Row).archived_at).toBeTypeOf("string");
  });
});

describe("isNotStubTurn (v1.6 cleanup filter)", () => {
  function agentTurn(text: string) {
    return {
      id: "x",
      session_id: "s",
      role: "agent" as const,
      status: "completed" as const,
      content_jsonb: { text } as unknown as Row[keyof Row],
      created_at: "",
      finalized_at: null,
    };
  }
  function userTurn(text: string) {
    return { ...agentTurn(text), role: "user" as const };
  }

  it("drops the v1.6 stub 'Got it: ... (Stub response — real LLM lands in M3.)'", async () => {
    const { isNotStubTurn } = await import("./sessions");
    expect(isNotStubTurn(agentTurn('Got it: "hi". (Stub response — real LLM lands in M3.)') as never)).toBe(false);
  });

  it("drops canned greeting stubs", async () => {
    const { isNotStubTurn } = await import("./sessions");
    expect(isNotStubTurn(agentTurn("hey! what are you working on?") as never)).toBe(false);
    expect(isNotStubTurn(agentTurn("hey! what's up — what are you working on?") as never)).toBe(false);
    expect(isNotStubTurn(agentTurn("what's up?") as never)).toBe(false);
  });

  it("keeps real assistant turns", async () => {
    const { isNotStubTurn } = await import("./sessions");
    expect(isNotStubTurn(agentTurn("what platform are you targeting — X, LinkedIn, or something else?") as never)).toBe(true);
  });

  it("always keeps user turns regardless of text", async () => {
    const { isNotStubTurn } = await import("./sessions");
    // A user could legitimately type the stub text; never filter user turns.
    expect(isNotStubTurn(userTurn("what's up?") as never)).toBe(true);
  });

  it("keeps turns with empty/missing content", async () => {
    const { isNotStubTurn } = await import("./sessions");
    expect(
      isNotStubTurn({
        id: "x",
        session_id: "s",
        role: "agent",
        status: "in_progress",
        content_jsonb: null,
        created_at: "",
        finalized_at: null,
      } as never),
    ).toBe(true);
  });
});
