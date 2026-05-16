import { describe, expect, it, vi, beforeEach } from "vitest";

// Critical-path coverage for session helpers: existing-session reuse,
// cold-create, turn append, and finalize. Exhaustive coverage (RLS,
// concurrent sessions, archive cleanup) is deferred — the helpers are
// thin wrappers and RLS is enforced at the DB layer.

type Row = Record<string, unknown> & { id?: string };

function makeSupabaseStub(initial: {
  sessions?: Row[];
  turns?: Row[];
  // Per-call errors for negative-path tests.
  errorOn?: {
    sessionsInsert?: { message: string };
    sessionsSelect?: { message: string };
  };
} = {}) {
  const state = {
    sessions: [...(initial.sessions ?? [])],
    turns: [...(initial.turns ?? [])],
    lastInsertTable: "" as string,
    lastInsertRow: undefined as Row | undefined,
    lastUpdateTable: "" as string,
    lastUpdatePatch: undefined as Row | undefined,
    lastUpdateId: undefined as string | undefined,
    lastUpdateFilters: {} as Record<string, unknown>,
    lastUpdateIsNullCol: null as string | null,
    lastSelectFilters: {} as Record<string, unknown>,
    lastSelectIsNullCol: null as string | null,
    lastSelectOrder: null as { col: string; ascending: boolean } | null,
    lastSelectLimit: null as number | null,
    lastSelectColumns: "" as string,
    selectChain: [] as string[],
  };

  function rowMatches(
    row: Row,
    filters: Record<string, unknown>,
    isNullCol: string | null,
  ): boolean {
    for (const [k, v] of Object.entries(filters)) {
      if (row[k] !== v) return false;
    }
    if (isNullCol && row[isNullCol] !== null && row[isNullCol] !== undefined) {
      return false;
    }
    return true;
  }

  function builder(table: "home_sessions" | "home_turns") {
    let filters: Record<string, unknown> = {};
    let isNullCol: string | null = null;
    let orderSpec: { col: string; ascending: boolean } | null = null;
    let limitN: number | null = null;
    let selectColumns = "*";
    let mode: "select" | "insert" | "update" = "select";
    let updatePatch: Row | undefined;

    function applyMultiRow(): Row[] {
      const bag = table === "home_sessions" ? state.sessions : state.turns;
      let rows = bag.filter((r) => rowMatches(r, filters, isNullCol));
      if (orderSpec) {
        const { col, ascending } = orderSpec;
        rows = rows.slice().sort((a, b) => {
          const av = a[col];
          const bv = b[col];
          if (av === bv) return 0;
          if (av === undefined || av === null) return 1;
          if (bv === undefined || bv === null) return -1;
          return (av < bv ? -1 : 1) * (ascending ? 1 : -1);
        });
      }
      if (limitN != null) rows = rows.slice(0, limitN);
      return rows;
    }

    const query: Record<string, unknown> = {
      select: (cols?: string) => {
        selectColumns = cols ?? "*";
        state.lastSelectColumns = selectColumns;
        state.selectChain.push("select");
        return query;
      },
      eq: (col: string, val: unknown) => {
        filters[col] = val;
        if (mode === "update" && col === "id") state.lastUpdateId = String(val);
        return query;
      },
      is: (col: string, val: unknown) => {
        if (val === null) isNullCol = col;
        return query;
      },
      order: (col: string, opts?: { ascending?: boolean }) => {
        orderSpec = { col, ascending: opts?.ascending ?? true };
        return query;
      },
      limit: (n: number) => {
        limitN = n;
        return query;
      },
      maybeSingle: async () => {
        if (mode === "update") {
          // Update -> select -> maybeSingle chain (softDeleteSession path).
          // The .is/.eq calls before .update target the WHERE clause; mirror
          // them into update predicate state.
          state.lastUpdateFilters = { ...filters };
          state.lastUpdateIsNullCol = isNullCol;
          const bag = table === "home_sessions" ? state.sessions : state.turns;
          const idx = bag.findIndex((r) => rowMatches(r, filters, isNullCol));
          if (idx < 0) return { data: null, error: null };
          Object.assign(bag[idx], updatePatch ?? {});
          return { data: { id: bag[idx].id }, error: null };
        }
        // select -> maybeSingle: capture filter state for assertions
        state.lastSelectFilters = { ...filters };
        state.lastSelectIsNullCol = isNullCol;
        state.lastSelectOrder = orderSpec ? { ...orderSpec } : null;
        state.lastSelectLimit = limitN;
        if (initial.errorOn?.sessionsSelect && table === "home_sessions") {
          return { data: null, error: initial.errorOn.sessionsSelect };
        }
        const rows = applyMultiRow();
        return { data: rows[0] ?? null, error: null };
      },
      single: async () => {
        if (mode === "insert") {
          const row = state.lastInsertRow;
          if (!row) return { data: null, error: { message: "no row" } };
          if (initial.errorOn?.sessionsInsert && table === "home_sessions") {
            return { data: null, error: initial.errorOn.sessionsInsert };
          }
          // Commit the staged row into state only after the success branch.
          if (table === "home_sessions") state.sessions.push(row);
          else state.turns.push(row);
          return { data: row, error: null };
        }
        const rows = applyMultiRow();
        return rows[0]
          ? { data: rows[0], error: null }
          : { data: null, error: { message: "no row" } };
      },
      insert: (row: Row) => {
        mode = "insert";
        // Stage the prepared row on the stub but do NOT commit to state.* yet.
        // The insert is only "applied" once .single() resolves successfully;
        // an errored .single() must not leave a phantom row in state. The
        // commit happens in single() below.
        const next: Row = { id: `${table}-${Date.now()}-${Math.random()}`, ...row };
        state.lastInsertTable = table;
        state.lastInsertRow = next;
        return query;
      },
      update: (patch: Row) => {
        mode = "update";
        updatePatch = patch;
        state.lastUpdateTable = table;
        state.lastUpdatePatch = patch;
        return query;
      },
      // Awaitable terminator for select-without-single chains (listSessions).
      // The supabase-js query builder is thenable; we mimic just enough.
      then: (resolve: (v: { data: Row[] | null; error: { message: string } | null }) => void) => {
        if (mode === "update") {
          // update -> .eq() chain that doesn't end in select+maybeSingle
          // (legacy archiveSession path).
          state.lastUpdateFilters = { ...filters };
          state.lastUpdateIsNullCol = isNullCol;
          const bag = table === "home_sessions" ? state.sessions : state.turns;
          for (const r of bag) {
            if (rowMatches(r, filters, isNullCol)) Object.assign(r, updatePatch ?? {});
          }
          resolve({ data: null, error: null });
          return;
        }
        // select chain
        state.lastSelectFilters = { ...filters };
        state.lastSelectIsNullCol = isNullCol;
        state.lastSelectOrder = orderSpec ? { ...orderSpec } : null;
        state.lastSelectLimit = limitN;
        resolve({ data: applyMultiRow(), error: null });
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
  createSession,
  deriveTitle,
  finalizeTurn,
  getMostRecentSession,
  getOrCreateActiveSession,
  getSessionWithTurns,
  listSessions,
  softDeleteSession,
  updateSessionTitle,
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

describe("getMostRecentSession", () => {
  it("returns null when user has no sessions", async () => {
    expect(await getMostRecentSession("t1", "u1")).toBeNull();
  });
  it("returns latest non-archived session by last_activity_at DESC", async () => {
    stub = makeSupabaseStub({
      sessions: [
        {
          id: "old",
          tenant_id: "t1",
          user_id: "u1",
          archived_at: null,
          started_at: "2026-05-10T00:00:00Z",
          last_activity_at: "2026-05-10T00:00:00Z",
        },
        {
          id: "latest",
          tenant_id: "t1",
          user_id: "u1",
          archived_at: null,
          started_at: "2026-05-15T00:00:00Z",
          last_activity_at: "2026-05-15T00:00:00Z",
        },
      ],
    });
    const out = await getMostRecentSession("t1", "u1");
    expect(out?.id).toBe("latest");
    expect(stub._state.lastSelectOrder).toEqual({ col: "last_activity_at", ascending: false });
  });
  it("filters by tenant_id, user_id, and archived_at IS NULL", async () => {
    stub = makeSupabaseStub({
      sessions: [
        {
          id: "foreign",
          tenant_id: "other",
          user_id: "u1",
          archived_at: null,
          last_activity_at: "2026-05-15T00:00:00Z",
        },
        {
          id: "mine",
          tenant_id: "t1",
          user_id: "u1",
          archived_at: null,
          last_activity_at: "2026-05-14T00:00:00Z",
        },
        {
          id: "mine-archived",
          tenant_id: "t1",
          user_id: "u1",
          archived_at: "2026-05-13T00:00:00Z",
          last_activity_at: "2026-05-13T00:00:00Z",
        },
      ],
    });
    const out = await getMostRecentSession("t1", "u1");
    expect(out?.id).toBe("mine");
    expect(stub._state.lastSelectFilters).toEqual({ tenant_id: "t1", user_id: "u1" });
    expect(stub._state.lastSelectIsNullCol).toBe("archived_at");
  });
});

describe("createSession", () => {
  it("inserts with correct fields and returns the row", async () => {
    const out = await createSession("t1", "u1");
    expect(out.tenant_id).toBe("t1");
    expect(out.user_id).toBe("u1");
    expect(stub._state.lastInsertTable).toBe("home_sessions");
    expect((stub._state.lastInsertRow as Row).tenant_id).toBe("t1");
    expect((stub._state.lastInsertRow as Row).user_id).toBe("u1");
  });
  it("throws when insert errors", async () => {
    stub = makeSupabaseStub({
      errorOn: { sessionsInsert: { message: "insert blew up" } },
    });
    await expect(createSession("t1", "u1")).rejects.toThrow(/insert blew up/);
  });
});

describe("getSessionWithTurns", () => {
  function sessionRow(over: Partial<Row> = {}): Row {
    return {
      id: "s1",
      tenant_id: "t1",
      user_id: "u1",
      archived_at: null,
      started_at: "2026-05-15T00:00:00Z",
      last_activity_at: "2026-05-15T00:00:00Z",
      ...over,
    };
  }
  function turnRow(over: Partial<Row> = {}): Row {
    return {
      id: `turn-${Math.random()}`,
      session_id: "s1",
      role: "user",
      status: "completed",
      content_jsonb: { text: "hi" },
      created_at: "2026-05-15T00:00:00Z",
      finalized_at: "2026-05-15T00:00:00Z",
      ...over,
    };
  }

  it("returns null for not-found id", async () => {
    expect(await getSessionWithTurns("ghost", "t1", "u1")).toBeNull();
  });

  it("returns null for foreign tenant", async () => {
    stub = makeSupabaseStub({ sessions: [sessionRow()] });
    expect(await getSessionWithTurns("s1", "wrong-tenant", "u1")).toBeNull();
  });

  it("returns null for archived session", async () => {
    stub = makeSupabaseStub({
      sessions: [sessionRow({ archived_at: "2026-05-15T00:00:00Z" })],
    });
    expect(await getSessionWithTurns("s1", "t1", "u1")).toBeNull();
  });

  it("returns session + filtered turns for happy path", async () => {
    stub = makeSupabaseStub({
      sessions: [sessionRow()],
      turns: [
        turnRow({ id: "u1", role: "user", content_jsonb: { text: "ping" } }),
        turnRow({ id: "a1", role: "agent", content_jsonb: { text: "real reply that's long enough" } }),
      ],
    });
    const out = await getSessionWithTurns("s1", "t1", "u1");
    expect(out?.session.id).toBe("s1");
    expect(out?.turns).toHaveLength(2);
  });

  it("filters v1.6 stub agent turns out of returned turns", async () => {
    stub = makeSupabaseStub({
      sessions: [sessionRow()],
      turns: [
        turnRow({ id: "u1", role: "user", content_jsonb: { text: "ping" } }),
        turnRow({
          id: "stub",
          role: "agent",
          content_jsonb: { text: "what's up?" },
        }),
        turnRow({
          id: "real",
          role: "agent",
          content_jsonb: { text: "what platform are you targeting?" },
        }),
      ],
    });
    const out = await getSessionWithTurns("s1", "t1", "u1");
    const ids = (out?.turns ?? []).map((t) => t.id);
    expect(ids).toContain("u1");
    expect(ids).toContain("real");
    expect(ids).not.toContain("stub");
  });

  it("applies the turn limit", async () => {
    stub = makeSupabaseStub({ sessions: [sessionRow()] });
    await getSessionWithTurns("s1", "t1", "u1", 5);
    expect(stub._state.lastSelectLimit).toBe(5);
  });
});

describe("listSessions", () => {
  it("returns empty array when user has no sessions", async () => {
    expect(await listSessions("t1", "u1")).toEqual([]);
  });

  it("returns reverse-chron by last_activity_at", async () => {
    stub = makeSupabaseStub({
      sessions: [
        {
          id: "older",
          tenant_id: "t1",
          user_id: "u1",
          archived_at: null,
          title: "older",
          last_activity_at: "2026-05-10T00:00:00Z",
        },
        {
          id: "newer",
          tenant_id: "t1",
          user_id: "u1",
          archived_at: null,
          title: "newer",
          last_activity_at: "2026-05-15T00:00:00Z",
        },
      ],
    });
    const out = await listSessions("t1", "u1");
    expect(out.map((r) => r.id)).toEqual(["newer", "older"]);
    expect(stub._state.lastSelectOrder).toEqual({
      col: "last_activity_at",
      ascending: false,
    });
  });

  it("excludes archived sessions", async () => {
    stub = makeSupabaseStub({
      sessions: [
        {
          id: "active",
          tenant_id: "t1",
          user_id: "u1",
          archived_at: null,
          title: "alive",
          last_activity_at: "2026-05-15T00:00:00Z",
        },
        {
          id: "dead",
          tenant_id: "t1",
          user_id: "u1",
          archived_at: "2026-05-14T00:00:00Z",
          title: "gone",
          last_activity_at: "2026-05-14T00:00:00Z",
        },
      ],
    });
    const out = await listSessions("t1", "u1");
    expect(out.map((r) => r.id)).toEqual(["active"]);
    expect(stub._state.lastSelectIsNullCol).toBe("archived_at");
  });

  it("applies '(empty)' fallback when title is null", async () => {
    stub = makeSupabaseStub({
      sessions: [
        {
          id: "untitled",
          tenant_id: "t1",
          user_id: "u1",
          archived_at: null,
          title: null,
          last_activity_at: "2026-05-15T00:00:00Z",
        },
      ],
    });
    const out = await listSessions("t1", "u1");
    expect(out[0].title).toBe("(empty)");
  });

  it("returns only {id, title, last_activity_at} keys", async () => {
    stub = makeSupabaseStub({
      sessions: [
        {
          id: "s",
          tenant_id: "t1",
          user_id: "u1",
          archived_at: null,
          title: "hello",
          last_activity_at: "2026-05-15T00:00:00Z",
          started_at: "2026-05-15T00:00:00Z",
        },
      ],
    });
    const out = await listSessions("t1", "u1");
    expect(Object.keys(out[0]).sort()).toEqual(
      ["id", "last_activity_at", "title"].sort(),
    );
  });
});

describe("softDeleteSession", () => {
  function sessRow(over: Partial<Row> = {}): Row {
    return {
      id: "s1",
      tenant_id: "t1",
      user_id: "u1",
      archived_at: null,
      last_activity_at: "2026-05-15T00:00:00Z",
      ...over,
    };
  }

  it("sets archived_at on owned non-archived row", async () => {
    stub = makeSupabaseStub({ sessions: [sessRow()] });
    await softDeleteSession("s1", "t1", "u1");
    expect(stub._state.lastUpdateTable).toBe("home_sessions");
    expect((stub._state.lastUpdatePatch as Row).archived_at).toBeTypeOf("string");
    expect(stub._state.lastUpdateFilters).toEqual({
      id: "s1",
      tenant_id: "t1",
      user_id: "u1",
    });
    expect(stub._state.lastUpdateIsNullCol).toBe("archived_at");
    expect((stub._state.sessions[0] as Row).archived_at).toBeTypeOf("string");
  });

  it("throws when 0 rows match (foreign tenant)", async () => {
    stub = makeSupabaseStub({ sessions: [sessRow()] });
    await expect(softDeleteSession("s1", "wrong-tenant", "u1")).rejects.toThrow(
      /no rows matched/,
    );
  });

  it("throws when the row is already archived", async () => {
    stub = makeSupabaseStub({
      sessions: [sessRow({ archived_at: "2026-05-14T00:00:00Z" })],
    });
    await expect(softDeleteSession("s1", "t1", "u1")).rejects.toThrow(
      /no rows matched/,
    );
  });
});

describe("updateSessionTitle", () => {
  it("writes deriveTitle(rawText) to the matched row", async () => {
    stub = makeSupabaseStub({
      sessions: [
        {
          id: "s1",
          tenant_id: "t1",
          user_id: "u1",
          archived_at: null,
          title: null,
          last_activity_at: "2026-05-15T00:00:00Z",
        },
      ],
    });
    await updateSessionTitle("s1", "draft a thank-you note", "t1", "u1");
    expect(stub._state.lastUpdateTable).toBe("home_sessions");
    expect((stub._state.lastUpdatePatch as Row).title).toBe(
      "draft a thank-you note",
    );
    // ownership predicate applied
    expect(stub._state.lastUpdateFilters).toEqual({
      id: "s1",
      tenant_id: "t1",
      user_id: "u1",
    });
    // row actually mutated
    expect((stub._state.sessions[0] as Row).title).toBe(
      "draft a thank-you note",
    );
  });

  it("truncates long text via deriveTitle", async () => {
    stub = makeSupabaseStub({
      sessions: [
        {
          id: "s1",
          tenant_id: "t1",
          user_id: "u1",
          archived_at: null,
          title: null,
          last_activity_at: "2026-05-15T00:00:00Z",
        },
      ],
    });
    const long =
      "draft a thank you note to oscartry about the meeting we had yesterday";
    await updateSessionTitle("s1", long, "t1", "u1");
    const written = (stub._state.lastUpdatePatch as Row).title as string;
    expect(written.endsWith("...")).toBe(true);
    expect(written.length).toBeLessThanOrEqual(43);
  });

  it("does not mutate other tenant's rows", async () => {
    stub = makeSupabaseStub({
      sessions: [
        {
          id: "s1",
          tenant_id: "other-tenant",
          user_id: "u1",
          archived_at: null,
          title: "original",
          last_activity_at: "2026-05-15T00:00:00Z",
        },
      ],
    });
    await updateSessionTitle("s1", "should not write", "t1", "u1");
    // The ownership predicate filtered the row out; title stays.
    expect((stub._state.sessions[0] as Row).title).toBe("original");
  });
});

describe("deriveTitle", () => {
  it("returns '(empty)' for empty string", () => {
    expect(deriveTitle("")).toBe("(empty)");
  });
  it("returns '(empty)' for whitespace-only", () => {
    expect(deriveTitle("   \n\t  ")).toBe("(empty)");
  });
  it("collapses newlines to spaces", () => {
    expect(deriveTitle("hello\nworld")).toBe("hello world");
  });
  it("collapses tabs and repeated spaces to a single space", () => {
    expect(deriveTitle("hello\t \tworld   foo")).toBe("hello world foo");
  });
  it("returns short input as-is", () => {
    expect(deriveTitle("draft thank you")).toBe("draft thank you");
  });
  it("truncates at word boundary near 40 chars", () => {
    const long = "draft a thank you note to oscartry about the meeting we had yesterday";
    const out = deriveTitle(long);
    expect(out.length).toBeLessThanOrEqual(43); // 40 + "..." cap
    expect(out.endsWith("...")).toBe(true);
    expect(out.startsWith("draft a thank you note")).toBe(true);
  });
  it("force-truncates unbreakable strings at 40 chars + ellipsis", () => {
    const unbreakable = "a".repeat(60);
    const out = deriveTitle(unbreakable);
    expect(out).toBe("a".repeat(40) + "...");
  });
  it("returns exactly-40-char input as-is (no ellipsis)", () => {
    const exact = "a".repeat(40);
    expect(deriveTitle(exact)).toBe(exact);
  });
});
