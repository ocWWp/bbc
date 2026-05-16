// @vitest-environment node
import { describe, expect, it, vi, beforeEach } from "vitest";

// Server-component coverage for /home/page.tsx. We mock all data-layer
// dependencies and the components leaf; the test asserts on which mocks
// were called and what props HomeClient received.

vi.mock("next/navigation", () => ({
  redirect: vi.fn((path: string) => {
    const err = new Error("NEXT_REDIRECT") as Error & { digest: string };
    err.digest = `NEXT_REDIRECT;replace;${path};307;`;
    throw err;
  }),
}));

vi.mock("@/lib/auth/require-user", () => ({
  requireActor: vi.fn(),
}));

vi.mock("@/lib/home/sessions", () => ({
  getSessionWithTurns: vi.fn(),
  listSessions: vi.fn(),
}));

vi.mock("@/lib/home/read-queue-summary", () => ({
  readQueueSummary: vi.fn(),
}));

vi.mock("@/lib/home/greeting", () => ({
  homeGreeting: vi.fn(() => "hello"),
}));

vi.mock("@/lib/home/turn-to-vm", () => ({
  turnToVm: vi.fn((t: { id: string; role: string }) => ({
    id: t.id,
    role: t.role,
    status: "completed",
    text: "",
    toolCalls: [],
    citations: [],
  })),
}));

// observer_signals supabase query. We return an object with a chainable
// builder ending in a thenable result.
const observerData: Array<{
  id: string;
  signal_type: string;
  config_jsonb: Record<string, unknown> | null;
}> = [];
const observerBuilder = {
  select: () => observerBuilder,
  eq: () => observerBuilder,
  is: () => observerBuilder,
  order: () => observerBuilder,
  limit: () => Promise.resolve({ data: observerData, error: null }),
};
vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServerClient: vi.fn(async () => ({
    from: () => observerBuilder,
  })),
}));

// HomeClient is a client component; mock it as a stub that captures props.
vi.mock("@/components/chat-home/HomeClient", () => ({
  HomeClient: vi.fn(() => null),
}));

import { redirect } from "next/navigation";
import { requireActor } from "@/lib/auth/require-user";
import { getSessionWithTurns, listSessions } from "@/lib/home/sessions";
import { readQueueSummary } from "@/lib/home/read-queue-summary";
import { HomeClient } from "@/components/chat-home/HomeClient";
import HomePage from "./page";

const VALID_UUID = "11111111-1111-1111-1111-111111111111";
const FOREIGN_UUID = "22222222-2222-2222-2222-222222222222";

const ADMIN_ACTOR = {
  user_id: "user-abc",
  provider: "email" as const,
  identifier: "alice@example.com",
  actor: "human:email:alice@example.com",
  tenant_id: "tenant-xyz",
  tenant_slug: "acme",
  role: "admin" as const,
  templateSlug: null,
};

const NON_ADMIN_ACTOR = {
  ...ADMIN_ACTOR,
  role: "operator" as const,
  templateSlug: "marketing",
};

describe("/home page.tsx", () => {
  beforeEach(() => {
    vi.mocked(redirect).mockClear();
    vi.mocked(requireActor).mockReset();
    vi.mocked(getSessionWithTurns).mockReset();
    vi.mocked(listSessions).mockReset();
    vi.mocked(readQueueSummary).mockReset();
    vi.mocked(HomeClient).mockClear();
    // default rail / queue stubs — overridden per-test as needed.
    vi.mocked(listSessions).mockResolvedValue([]);
    vi.mocked(readQueueSummary).mockResolvedValue({
      pendingCount: 0,
      topPending: [],
    });
  });

  it("redirects unauth visitors to /auth/signin?callbackUrl=/home", async () => {
    vi.mocked(requireActor).mockResolvedValueOnce({
      ok: false,
      output: "unauthorized",
    });

    await expect(
      HomePage({ searchParams: Promise.resolve({}) }),
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(redirect).toHaveBeenCalledWith("/auth/signin?callbackUrl=/home");
    expect(listSessions).not.toHaveBeenCalled();
  });

  it("redirects non-admin actors to /studio/<templateSlug>", async () => {
    vi.mocked(requireActor).mockResolvedValueOnce({
      ok: true,
      actor: NON_ADMIN_ACTOR,
    });

    await expect(
      HomePage({ searchParams: Promise.resolve({}) }),
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(redirect).toHaveBeenCalledWith("/studio/marketing");
    expect(listSessions).not.toHaveBeenCalled();
  });

  it("falls back to /studio/marketing when templateSlug is null", async () => {
    vi.mocked(requireActor).mockResolvedValueOnce({
      ok: true,
      actor: { ...NON_ADMIN_ACTOR, templateSlug: null },
    });

    await expect(
      HomePage({ searchParams: Promise.resolve({}) }),
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(redirect).toHaveBeenCalledWith("/studio/marketing");
  });

  it("renders HomeClient with sessionId=null and empty turns on bare /home", async () => {
    vi.mocked(requireActor).mockResolvedValueOnce({
      ok: true,
      actor: ADMIN_ACTOR,
    });

    const element = await HomePage({ searchParams: Promise.resolve({}) });

    expect(redirect).not.toHaveBeenCalled();
    expect(getSessionWithTurns).not.toHaveBeenCalled();
    // page.tsx returns `<HomeClient ...props />`; assert the rendered
    // React element points at the mocked HomeClient and exposes the
    // expected props.
    expect(element).toBeDefined();
    expect((element as { type: unknown }).type).toBe(HomeClient);
    const props = (element as { props: Record<string, unknown> }).props;
    expect(props.sessionId).toBeNull();
    expect(props.initialTurns).toEqual([]);
    expect(props.sessions).toEqual([]);
  });

  it("hydrates the named session when ?session=<valid uuid> resolves to a row", async () => {
    vi.mocked(requireActor).mockResolvedValueOnce({
      ok: true,
      actor: ADMIN_ACTOR,
    });
    vi.mocked(getSessionWithTurns).mockResolvedValueOnce({
      session: {
        id: VALID_UUID,
        tenant_id: ADMIN_ACTOR.tenant_id,
        user_id: ADMIN_ACTOR.user_id,
        started_at: "2026-05-16T00:00:00Z",
        last_activity_at: "2026-05-16T00:01:00Z",
        archived_at: null,
      },
      turns: [
        {
          id: "turn-1",
          session_id: VALID_UUID,
          role: "user",
          status: "completed",
          content_jsonb: { text: "hi" },
          created_at: "2026-05-16T00:00:01Z",
          finalized_at: "2026-05-16T00:00:01Z",
        },
      ],
    });
    vi.mocked(listSessions).mockResolvedValueOnce([
      { id: VALID_UUID, title: "hi", last_activity_at: "2026-05-16T00:01:00Z" },
    ]);

    const element = await HomePage({
      searchParams: Promise.resolve({ session: VALID_UUID }),
    });

    expect(getSessionWithTurns).toHaveBeenCalledWith(
      VALID_UUID,
      ADMIN_ACTOR.tenant_id,
      ADMIN_ACTOR.user_id,
      50,
    );
    expect(redirect).not.toHaveBeenCalled();
    expect((element as { type: unknown }).type).toBe(HomeClient);
    const props = (element as {
      props: {
        sessionId: string | null;
        initialTurns: Array<{ id: string }>;
        sessions: Array<{ id: string }>;
      };
    }).props;
    expect(props.sessionId).toBe(VALID_UUID);
    expect(props.initialTurns).toHaveLength(1);
    expect(props.initialTurns[0]!.id).toBe("turn-1");
    expect(props.sessions).toHaveLength(1);
  });

  it("redirects to /home when ?session= is malformed (not a uuid)", async () => {
    vi.mocked(requireActor).mockResolvedValueOnce({
      ok: true,
      actor: ADMIN_ACTOR,
    });

    await expect(
      HomePage({ searchParams: Promise.resolve({ session: "not-a-uuid" }) }),
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(redirect).toHaveBeenCalledWith("/home");
    // Validation runs before any session lookup, so the data-layer was untouched.
    expect(getSessionWithTurns).not.toHaveBeenCalled();
    expect(listSessions).not.toHaveBeenCalled();
  });

  it("redirects to /home when ?session=<valid uuid> belongs to another tenant", async () => {
    vi.mocked(requireActor).mockResolvedValueOnce({
      ok: true,
      actor: ADMIN_ACTOR,
    });
    // Foreign-tenant lookup returns null (RLS / explicit filter).
    vi.mocked(getSessionWithTurns).mockResolvedValueOnce(null);

    await expect(
      HomePage({
        searchParams: Promise.resolve({ session: FOREIGN_UUID }),
      }),
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(getSessionWithTurns).toHaveBeenCalledWith(
      FOREIGN_UUID,
      ADMIN_ACTOR.tenant_id,
      ADMIN_ACTOR.user_id,
      50,
    );
    expect(redirect).toHaveBeenCalledWith("/home");
  });

  it("redirects to /home when ?session=<valid uuid> is archived (null result)", async () => {
    vi.mocked(requireActor).mockResolvedValueOnce({
      ok: true,
      actor: ADMIN_ACTOR,
    });
    // Archived sessions also surface as null from getSessionWithTurns
    // (it filters `archived_at IS NULL`).
    vi.mocked(getSessionWithTurns).mockResolvedValueOnce(null);

    await expect(
      HomePage({ searchParams: Promise.resolve({ session: VALID_UUID }) }),
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(redirect).toHaveBeenCalledWith("/home");
  });
});
