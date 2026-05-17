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
}));

// Stub the session helpers so the route doesn't try to hit Supabase
// when we only care about pre-stream branches.
vi.mock("@/lib/home/sessions", () => ({
  getOrCreateActiveSession: vi.fn(async () => ({
    id: "s1",
    tenant_id: "t1",
    user_id: "u1",
    started_at: "2026-05-15T00:00:00Z",
    last_activity_at: "2026-05-15T00:00:00Z",
    archived_at: null,
  })),
  getActiveSessionWithTurns: vi.fn(async () => ({
    session: {
      id: "s1",
      tenant_id: "t1",
      user_id: "u1",
      started_at: "2026-05-15T00:00:00Z",
      last_activity_at: "2026-05-15T00:00:00Z",
      archived_at: null,
    },
    turns: [],
  })),
  appendTurn: vi.fn(async () => ({
    id: "turn-x",
    session_id: "s1",
    role: "agent",
    status: "in_progress",
    content_jsonb: {},
    created_at: "2026-05-15T00:00:00Z",
    finalized_at: null,
  })),
  finalizeTurn: vi.fn(async () => {}),
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

beforeEach(() => {
  requireActorMock.mockReset();
});

describe("POST /api/home/turn — pre-stream branches", () => {
  it("returns 401 when not authenticated", async () => {
    requireActorMock.mockResolvedValue({ ok: false, output: "unauthorized" });
    const res = await POST(makeReq({ userText: "hi" }) as never);
    expect(res.status).toBe(401);
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
        role: "operator",
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
        role: "operator",
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
        role: "operator",
        templateSlug: null,
      },
    });
    const res = await POST(makeReq({ userText: "where is memory?" }) as never);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/text\/event-stream/);

    // Drain the stream and assert turn-end is the last event.
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let combined = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      combined += decoder.decode(value, { stream: true });
    }
    expect(combined).toContain("event: turn-end");
    expect(combined).toMatch(/"status":"completed"/);
  });
});
