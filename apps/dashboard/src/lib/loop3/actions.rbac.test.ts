import { describe, expect, it, vi } from "vitest";

// Task 0g of v1.5 launch polish. Loop-3 actions are operator+. RLS at the
// SQL layer (0042) enforces the same — these tests cover the application
// layer's defense-in-depth.
//
// We mock require-user to flip the role under test; the underlying lifecycle
// is also mocked so the test stays focused on the gate (no fixture rows
// needed).

vi.mock("@/lib/auth/require-user", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/require-user")>();
  return {
    ...actual,
    requireActor: vi.fn(),
  };
});

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServerClient: vi.fn(async () => ({})),
}));

vi.mock("./lifecycle-supabase", () => ({
  makeSupabaseLifecycleDb: vi.fn(() => ({})),
}));

vi.mock("./lifecycle", () => ({
  dismissRecommendation: vi.fn(async () => ({ ok: true })),
  installRecommendation: vi.fn(async () => ({ ok: true })),
  snoozeRecommendation: vi.fn(async () => ({ ok: true })),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

import { requireActor } from "@/lib/auth/require-user";
import {
  dismissRecommendationAction,
  markRecommendationInstalledAction,
  snoozeRecommendationAction,
} from "./actions";

const requireActorMock = requireActor as ReturnType<typeof vi.fn>;

const VALID_UUID = "11111111-1111-1111-1111-111111111111";

function actorOf(role: "admin" | "operator" | "member" | "viewer") {
  return {
    ok: true,
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

function fdWithId(): FormData {
  const fd = new FormData();
  fd.append("id", VALID_UUID);
  return fd;
}

describe("Loop-3 actions require operator+", () => {
  it("dismiss: member is forbidden", async () => {
    requireActorMock.mockResolvedValueOnce(actorOf("member"));
    const r = await dismissRecommendationAction(fdWithId());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("operator");
  });

  it("dismiss: viewer is forbidden", async () => {
    requireActorMock.mockResolvedValueOnce(actorOf("viewer"));
    const r = await dismissRecommendationAction(fdWithId());
    expect(r.ok).toBe(false);
  });

  it("dismiss: operator succeeds", async () => {
    requireActorMock.mockResolvedValueOnce(actorOf("operator"));
    const r = await dismissRecommendationAction(fdWithId());
    expect(r.ok).toBe(true);
  });

  it("dismiss: admin succeeds", async () => {
    requireActorMock.mockResolvedValueOnce(actorOf("admin"));
    const r = await dismissRecommendationAction(fdWithId());
    expect(r.ok).toBe(true);
  });

  it("snooze: member is forbidden", async () => {
    requireActorMock.mockResolvedValueOnce(actorOf("member"));
    const fd = fdWithId();
    fd.append("hours", "24");
    const r = await snoozeRecommendationAction(fd);
    expect(r.ok).toBe(false);
  });

  it("snooze: operator succeeds", async () => {
    requireActorMock.mockResolvedValueOnce(actorOf("operator"));
    const fd = fdWithId();
    fd.append("hours", "24");
    const r = await snoozeRecommendationAction(fd);
    expect(r.ok).toBe(true);
  });

  it("markInstalled: member is forbidden", async () => {
    requireActorMock.mockResolvedValueOnce(actorOf("member"));
    const r = await markRecommendationInstalledAction(fdWithId());
    expect(r.ok).toBe(false);
  });

  it("markInstalled: operator succeeds", async () => {
    requireActorMock.mockResolvedValueOnce(actorOf("operator"));
    const r = await markRecommendationInstalledAction(fdWithId());
    expect(r.ok).toBe(true);
  });
});
