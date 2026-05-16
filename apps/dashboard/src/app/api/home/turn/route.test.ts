import { describe, expect, it, vi, beforeEach } from "vitest";

// Smoke tests for POST /api/home/turn. Full SSE-ordering + abort-lifecycle
// coverage lives in the ChatHome integration test (M2.5) where the
// React fetcher exercises the route end-to-end. Here we cover the
// pre-stream branches: auth gate and body validation.

const { requireActorMock } = vi.hoisted(() => ({
  requireActorMock: vi.fn(),
}));
vi.mock("@/lib/auth/require-user", () => ({
  requireActor: requireActorMock,
  requireRole: (actor: { role: string }, min: string) => {
    const rank: Record<string, number> = {
      viewer: 0,
      member: 1,
      operator: 2,
      admin: 3,
    };
    if (rank[actor.role] < rank[min]) {
      return { ok: false, output: `forbidden: requires ${min}` };
    }
    return { ok: true };
  },
}));

// Stub the session helpers so the route doesn't try to hit Supabase
// when we only care about pre-stream branches.
const { sessionMocks } = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const anyFn = (impl?: (...args: any[]) => any) => vi.fn(impl as any) as any;
  return {
    sessionMocks: {
      createSession: anyFn(),
      getSessionWithTurns: anyFn(),
      appendTurn: anyFn(),
      finalizeTurn: anyFn(),
      softDeleteSession: anyFn(),
      updateSessionTitle: anyFn(),
    },
  };
});

vi.mock("@/lib/home/sessions", () => ({
  createSession: sessionMocks.createSession,
  getSessionWithTurns: sessionMocks.getSessionWithTurns,
  appendTurn: sessionMocks.appendTurn,
  finalizeTurn: sessionMocks.finalizeTurn,
  softDeleteSession: sessionMocks.softDeleteSession,
  updateSessionTitle: sessionMocks.updateSessionTitle,
  // deriveTitle is a pure helper — use the real impl so the route emits
  // the same title string that was just written to the DB.
  deriveTitle: (text: string) => {
    const collapsed = text.replace(/\s+/g, " ").trim();
    if (collapsed.length === 0) return "(empty)";
    if (collapsed.length <= 40) return collapsed;
    const slice = collapsed.slice(0, 40);
    const lastSpace = slice.lastIndexOf(" ");
    if (lastSpace >= 20) return slice.slice(0, lastSpace) + "...";
    return slice + "...";
  },
}));

// Quota RPC happy-path stub. Real wiring is exercised in the RLS test;
// route tests only need a non-throwing client.
vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServerClient: vi.fn(async () => ({
    rpc: vi.fn(async (fn: string) => {
      if (fn === "reserve_quota") {
        return { data: { ok: true, reservation_id: "test-res-1" }, error: null };
      }
      if (fn === "reconcile_quota") {
        return { data: { ok: true }, error: null };
      }
      return { data: null, error: { message: `unmocked rpc: ${fn}` } };
    }),
    // The route reads home_sessions.last_activity_at after homeTurn so it
    // can enrich the final turn-end. Return a fixed timestamp so tests
    // can assert it lands in the event.
    from: vi.fn((table: string) => {
      const builder = {
        select: vi.fn(() => builder),
        eq: vi.fn(() => builder),
        maybeSingle: vi.fn(async () => {
          if (table === "home_sessions") {
            return {
              data: { last_activity_at: "2026-05-15T01:23:45Z" },
              error: null,
            };
          }
          return { data: null, error: null };
        }),
      };
      return builder;
    }),
  })),
}));

// Real-dep factories: each has its own unit test file. Here we mock them
// so the route test focuses on pre-stream branches and stream lifecycle.
vi.mock("@/lib/secrets/anthropic-client", () => ({
  getAnthropicClient: vi.fn(async () => ({
    ok: true,
    client: {},
    costAttribution: "tenant_byok",
  })),
}));
vi.mock("@/lib/home/real-context", () => ({
  retrieveHomeContext: vi.fn(async () => ({ workspaceName: "test", rows: [] })),
  makeBuildContextFromRetrieval: vi.fn(
    () =>
      async (input: {
        tenantId: string;
        actorId: string | null;
        role: string;
        userInput: string;
        recent: Array<{ role: "user" | "agent"; text: string }>;
      }) => ({
        tenantId: input.tenantId,
        actorId: input.actorId,
        role: input.role,
        rolePack: { voice: "", vendors: [], decisions: [], glossary: {} },
        buffer: {
          kind: "conversation" as const,
          turns: input.recent,
          userInput: input.userInput,
        },
        alwaysOn: { memoryIndexExcerpt: "", workspaceName: "test" },
      }),
  ),
  retrievedMemoryIdsOf: vi.fn(() => []),
  memoryTitlesOf: vi.fn(() => ({}) as Record<string, string>),
}));
vi.mock("@/lib/home/real-classify", () => ({
  makeRealClassify: vi.fn(() => async () => ({ intent: "unclear" })),
}));
vi.mock("@/lib/home/real-invoke", () => ({
  makeRealInvokeLlm: vi.fn(
    () => async () => ({ text: "stub reply", toolCalls: [], tokens: 100 }),
  ),
}));
vi.mock("@/lib/home/tool-impls", () => ({
  makeHomeToolExecutor: vi.fn(() => async () => ({ ok: true, result: {} })),
}));

import { POST } from "./route";

function makeReq(body: unknown): Request {
  return new Request("http://localhost/api/home/turn", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function drainStream(res: Response): Promise<string> {
  if (!res.body) return "";
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let out = "";
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    out += decoder.decode(value, { stream: true });
  }
  return out;
}

const VALID_UUID = "11111111-2222-3333-4444-555555555555";

function adminActor() {
  return {
    user_id: "u1",
    tenant_id: "t1",
    provider: "github" as const,
    identifier: "alice",
    actor: "human:github:alice",
    tenant_slug: "acme",
    role: "admin" as const,
    templateSlug: null,
  };
}

beforeEach(() => {
  requireActorMock.mockReset();
  // Re-establish default happy-path implementations after clearing.
  sessionMocks.createSession.mockClear();
  sessionMocks.createSession.mockResolvedValue({
    id: "new-session-1",
    tenant_id: "t1",
    user_id: "u1",
    started_at: "2026-05-15T00:00:00Z",
    last_activity_at: "2026-05-15T00:00:00Z",
    archived_at: null,
  });
  sessionMocks.getSessionWithTurns.mockClear();
  sessionMocks.getSessionWithTurns.mockResolvedValue({
    session: {
      id: "s1",
      tenant_id: "t1",
      user_id: "u1",
      started_at: "2026-05-15T00:00:00Z",
      last_activity_at: "2026-05-15T00:00:00Z",
      archived_at: null,
    },
    turns: [],
  });
  sessionMocks.appendTurn.mockClear();
  sessionMocks.appendTurn.mockResolvedValue({
    id: "turn-x",
    session_id: "s1",
    role: "agent",
    status: "in_progress",
    content_jsonb: {},
    created_at: "2026-05-15T00:00:00Z",
    finalized_at: null,
  });
  sessionMocks.finalizeTurn.mockClear();
  sessionMocks.softDeleteSession.mockClear();
  sessionMocks.updateSessionTitle.mockClear();
});

describe("POST /api/home/turn — pre-stream branches", () => {
  it("returns 401 when not authenticated", async () => {
    requireActorMock.mockResolvedValue({ ok: false, output: "unauthorized" });
    const res = await POST(makeReq({ userText: "hi" }) as never);
    expect(res.status).toBe(401);
  });

  it("returns 403 when actor is not admin", async () => {
    requireActorMock.mockResolvedValue({
      ok: true,
      actor: {
        user_id: "u1",
        tenant_id: "t1",
        provider: "github",
        identifier: "alice",
        actor: "human:github:alice",
        tenant_slug: "acme",
        role: "operator",
        templateSlug: null,
      },
    });
    const res = await POST(makeReq({ userText: "hi" }) as never);
    expect(res.status).toBe(403);
  });

  it("returns 400 when userText is missing or blank", async () => {
    requireActorMock.mockResolvedValue({
      ok: true,
      actor: {
        user_id: "u1",
        tenant_id: "t1",
        provider: "github",
        identifier: "alice",
        actor: "human:github:alice",
        tenant_slug: "acme",
        role: "admin",
        templateSlug: null,
      },
    });
    const res = await POST(makeReq({ userText: "   " }) as never);
    expect(res.status).toBe(400);
  });

  it("returns 400 on invalid JSON body", async () => {
    requireActorMock.mockResolvedValue({
      ok: true,
      actor: {
        user_id: "u1",
        tenant_id: "t1",
        provider: "github",
        identifier: "alice",
        actor: "human:github:alice",
        tenant_slug: "acme",
        role: "admin",
        templateSlug: null,
      },
    });
    const bad = new Request("http://localhost/api/home/turn", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{not json",
    });
    const res = await POST(bad as never);
    expect(res.status).toBe(400);
  });

  it("returns 400 for malformed sessionId", async () => {
    requireActorMock.mockResolvedValue({
      ok: true,
      actor: {
        user_id: "u1",
        tenant_id: "t1",
        provider: "github",
        identifier: "alice",
        actor: "human:github:alice",
        tenant_slug: "acme",
        role: "admin",
        templateSlug: null,
      },
    });
    const res = await POST(
      makeReq({ userText: "hi", sessionId: "not-a-uuid" }) as never,
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("invalid_session_id");
  });

  it("accepts empty-string sessionId as absent", async () => {
    requireActorMock.mockResolvedValue({
      ok: true,
      actor: {
        user_id: "u1",
        tenant_id: "t1",
        provider: "github",
        identifier: "alice",
        actor: "human:github:alice",
        tenant_slug: "acme",
        role: "admin",
        templateSlug: null,
      },
    });
    const res = await POST(
      makeReq({ userText: "hi", sessionId: "" }) as never,
    );
    expect(res.status).toBe(200);
  });

  it("returns 410 when sessionId is not found", async () => {
    requireActorMock.mockResolvedValue({ ok: true, actor: adminActor() });
    sessionMocks.getSessionWithTurns.mockResolvedValueOnce(null);
    const res = await POST(
      makeReq({ userText: "hi", sessionId: VALID_UUID }) as never,
    );
    expect(res.status).toBe(410);
    const json = await res.json();
    expect(json.error).toBe("session_not_found");
  });

  it("returns 410 when getSessionWithTurns excludes by ownership", async () => {
    requireActorMock.mockResolvedValue({ ok: true, actor: adminActor() });
    // The helper returns null for foreign tenant / archived / not-found —
    // route doesn't distinguish; all of them collapse to 410.
    sessionMocks.getSessionWithTurns.mockResolvedValueOnce(null);
    const res = await POST(
      makeReq({ userText: "hi", sessionId: VALID_UUID }) as never,
    );
    expect(res.status).toBe(410);
  });

  it("creates a new session when sessionId is absent", async () => {
    requireActorMock.mockResolvedValue({ ok: true, actor: adminActor() });
    const res = await POST(makeReq({ userText: "hi" }) as never);
    expect(res.status).toBe(200);
    expect(sessionMocks.createSession).toHaveBeenCalledWith("t1", "u1");
    expect(sessionMocks.getSessionWithTurns).not.toHaveBeenCalled();
  });

  it("uses existing session + ownership-filtered turns when sessionId provided", async () => {
    requireActorMock.mockResolvedValue({ ok: true, actor: adminActor() });
    sessionMocks.getSessionWithTurns.mockResolvedValueOnce({
      session: {
        id: VALID_UUID,
        tenant_id: "t1",
        user_id: "u1",
        started_at: "2026-05-15T00:00:00Z",
        last_activity_at: "2026-05-15T00:00:00Z",
        archived_at: null,
      },
      turns: [
        {
          id: "u1",
          session_id: VALID_UUID,
          role: "user",
          status: "completed",
          content_jsonb: { text: "previous" },
          created_at: "2026-05-15T00:00:00Z",
          finalized_at: "2026-05-15T00:00:00Z",
        },
      ],
    });
    const res = await POST(
      makeReq({ userText: "follow up", sessionId: VALID_UUID }) as never,
    );
    expect(res.status).toBe(200);
    expect(sessionMocks.createSession).not.toHaveBeenCalled();
    expect(sessionMocks.getSessionWithTurns).toHaveBeenCalledWith(
      VALID_UUID,
      "t1",
      "u1",
      20,
    );
    // appendTurn was called against the existing session id.
    expect(sessionMocks.appendTurn).toHaveBeenCalledWith(
      VALID_UUID,
      "user",
      expect.objectContaining({ text: "follow up" }),
    );
  });

  it("writes a derived title when creating a new session", async () => {
    requireActorMock.mockResolvedValue({ ok: true, actor: adminActor() });
    const res = await POST(
      makeReq({ userText: "Draft a thank-you to oscartry" }) as never,
    );
    expect(res.status).toBe(200);
    expect(sessionMocks.updateSessionTitle).toHaveBeenCalledWith(
      "new-session-1",
      "Draft a thank-you to oscartry",
      "t1",
      "u1",
    );
  });

  it("does NOT write title for an existing session", async () => {
    requireActorMock.mockResolvedValue({ ok: true, actor: adminActor() });
    sessionMocks.getSessionWithTurns.mockResolvedValueOnce({
      session: {
        id: VALID_UUID,
        tenant_id: "t1",
        user_id: "u1",
        started_at: "2026-05-15T00:00:00Z",
        last_activity_at: "2026-05-15T00:00:00Z",
        archived_at: null,
      },
      turns: [],
    });
    const res = await POST(
      makeReq({ userText: "follow up", sessionId: VALID_UUID }) as never,
    );
    expect(res.status).toBe(200);
    expect(sessionMocks.updateSessionTitle).not.toHaveBeenCalled();
  });

  it("soft-deletes the new session when user-turn insert fails", async () => {
    requireActorMock.mockResolvedValue({ ok: true, actor: adminActor() });
    sessionMocks.appendTurn.mockRejectedValueOnce(new Error("db down"));
    const res = await POST(makeReq({ userText: "hi" }) as never);
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe("turn_insert_failed");
    expect(sessionMocks.softDeleteSession).toHaveBeenCalledWith(
      "new-session-1",
      "t1",
      "u1",
    );
    // No SSE was opened — title write never happened.
    expect(sessionMocks.updateSessionTitle).not.toHaveBeenCalled();
  });

  it("does NOT soft-delete on user-turn insert failure for existing session", async () => {
    requireActorMock.mockResolvedValue({ ok: true, actor: adminActor() });
    sessionMocks.getSessionWithTurns.mockResolvedValueOnce({
      session: {
        id: VALID_UUID,
        tenant_id: "t1",
        user_id: "u1",
        started_at: "2026-05-15T00:00:00Z",
        last_activity_at: "2026-05-15T00:00:00Z",
        archived_at: null,
      },
      turns: [],
    });
    sessionMocks.appendTurn.mockRejectedValueOnce(new Error("db down"));
    const res = await POST(
      makeReq({ userText: "hi", sessionId: VALID_UUID }) as never,
    );
    expect(res.status).toBe(500);
    expect(sessionMocks.softDeleteSession).not.toHaveBeenCalled();
  });

  it("emits session-created as the FIRST SSE event on a new session", async () => {
    requireActorMock.mockResolvedValue({ ok: true, actor: adminActor() });
    const res = await POST(makeReq({ userText: "draft thank you" }) as never);
    expect(res.status).toBe(200);
    const body = await drainStream(res);
    // First event must be session-created.
    const firstEventLine = body
      .split("\n")
      .find((l) => l.startsWith("event: "));
    expect(firstEventLine).toBe("event: session-created");
    // Payload carries the new sessionId + the derived title.
    expect(body).toMatch(/event: session-created\ndata: \{[^}]*"sessionId":"new-session-1"/);
    expect(body).toMatch(/event: session-created\ndata: \{[^}]*"title":"draft thank you"/);
  });

  it("does NOT emit session-created for existing sessions", async () => {
    requireActorMock.mockResolvedValue({ ok: true, actor: adminActor() });
    sessionMocks.getSessionWithTurns.mockResolvedValueOnce({
      session: {
        id: VALID_UUID,
        tenant_id: "t1",
        user_id: "u1",
        started_at: "2026-05-15T00:00:00Z",
        last_activity_at: "2026-05-15T00:00:00Z",
        archived_at: null,
      },
      turns: [],
    });
    const res = await POST(
      makeReq({ userText: "follow up", sessionId: VALID_UUID }) as never,
    );
    expect(res.status).toBe(200);
    const body = await drainStream(res);
    expect(body).not.toContain("event: session-created");
  });

  it("does NOT emit session-created when user-turn insert fails", async () => {
    requireActorMock.mockResolvedValue({ ok: true, actor: adminActor() });
    sessionMocks.appendTurn.mockRejectedValueOnce(new Error("db down"));
    const res = await POST(makeReq({ userText: "hi" }) as never);
    expect(res.status).toBe(500);
    // No SSE body to read — but assert the response is JSON, not text/event-stream.
    expect(res.headers.get("content-type")).not.toMatch(/text\/event-stream/);
  });

  it("emits turn-end with lastActivityAt at end of stream", async () => {
    requireActorMock.mockResolvedValue({ ok: true, actor: adminActor() });
    const res = await POST(makeReq({ userText: "hi" }) as never);
    expect(res.status).toBe(200);
    const body = await drainStream(res);
    expect(body).toContain("event: turn-end");
    expect(body).toMatch(/"lastActivityAt":"2026-05-15T01:23:45Z"/);
  });

  it("opens an SSE response on the happy path", async () => {
    requireActorMock.mockResolvedValue({
      ok: true,
      actor: {
        user_id: "u1",
        tenant_id: "t1",
        provider: "github",
        identifier: "alice",
        actor: "human:github:alice",
        tenant_slug: "acme",
        role: "admin",
        templateSlug: null,
      },
    });
    const res = await POST(makeReq({ userText: "where is memory?" }) as never);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/text\/event-stream/);

    // Drain the stream and assert turn-end is the last event.
    const combined = await drainStream(res);
    expect(combined).toContain("event: turn-end");
    expect(combined).toMatch(/"status":"completed"/);
  });
});
