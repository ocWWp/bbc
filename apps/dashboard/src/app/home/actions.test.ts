import { describe, expect, it, vi, beforeEach } from "vitest";

// Server-action coverage for deleteSessionAction. Auth + role gates, the
// "current session was deleted" redirect, and the cache revalidation path
// when deleting a non-current session. Foreign-tenant / already-archived
// errors bubble from softDeleteSession; the action just rethrows.

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((path: string) => {
    const err = new Error("NEXT_REDIRECT") as Error & { digest: string };
    err.digest = `NEXT_REDIRECT;replace;${path};307;`;
    throw err;
  }),
}));
vi.mock("@/lib/auth/require-user", () => ({
  requireActor: vi.fn(),
  requireRole: vi.fn(),
}));
vi.mock("@/lib/home/sessions", () => ({ softDeleteSession: vi.fn() }));

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireActor, requireRole } from "@/lib/auth/require-user";
import { softDeleteSession } from "@/lib/home/sessions";
import { deleteSessionAction } from "./actions";

const TARGET_ID = "11111111-1111-1111-1111-111111111111";
const OTHER_ID = "22222222-2222-2222-2222-222222222222";

const FAKE_ACTOR = {
  user_id: "user-abc",
  provider: "email" as const,
  identifier: "alice@example.com",
  actor: "human:email:alice@example.com",
  tenant_id: "tenant-xyz",
  tenant_slug: "acme",
  role: "admin" as const,
  templateSlug: null,
};

describe("deleteSessionAction", () => {
  beforeEach(() => {
    vi.mocked(revalidatePath).mockReset();
    vi.mocked(redirect).mockReset();
    vi.mocked(redirect).mockImplementation((path: string) => {
      const err = new Error("NEXT_REDIRECT") as Error & { digest: string };
      err.digest = `NEXT_REDIRECT;replace;${path};307;`;
      throw err;
    });
    vi.mocked(requireActor).mockReset();
    vi.mocked(requireRole).mockReset();
    vi.mocked(softDeleteSession).mockReset();
  });

  it("throws 'unauth' when requireActor returns ok:false", async () => {
    vi.mocked(requireActor).mockResolvedValueOnce({
      ok: false,
      output: "unauthorized: sign in required",
    });

    await expect(deleteSessionAction(TARGET_ID)).rejects.toThrow("unauth");
    expect(softDeleteSession).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
  });

  it("throws 'forbidden' when requireRole returns ok:false", async () => {
    vi.mocked(requireActor).mockResolvedValueOnce({ ok: true, actor: FAKE_ACTOR });
    vi.mocked(requireRole).mockReturnValueOnce({
      ok: false,
      output: "forbidden: this action requires admin; you are viewer",
    });

    await expect(deleteSessionAction(TARGET_ID)).rejects.toThrow("forbidden");
    expect(softDeleteSession).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
  });

  it("rethrows when softDeleteSession fails (foreign tenant / already archived)", async () => {
    vi.mocked(requireActor).mockResolvedValueOnce({ ok: true, actor: FAKE_ACTOR });
    vi.mocked(requireRole).mockReturnValueOnce({ ok: true });
    vi.mocked(softDeleteSession).mockRejectedValueOnce(
      new Error("softDeleteSession: no rows matched"),
    );

    await expect(deleteSessionAction(TARGET_ID)).rejects.toThrow("no rows matched");
    expect(revalidatePath).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
  });

  it("redirects to /home when the deleted session is the current one", async () => {
    vi.mocked(requireActor).mockResolvedValueOnce({ ok: true, actor: FAKE_ACTOR });
    vi.mocked(requireRole).mockReturnValueOnce({ ok: true });
    vi.mocked(softDeleteSession).mockResolvedValueOnce(undefined);

    await expect(deleteSessionAction(TARGET_ID, TARGET_ID)).rejects.toThrow(
      "NEXT_REDIRECT",
    );

    expect(softDeleteSession).toHaveBeenCalledWith(
      TARGET_ID,
      FAKE_ACTOR.tenant_id,
      FAKE_ACTOR.user_id,
    );
    expect(redirect).toHaveBeenCalledWith("/home");
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("revalidates /home (no redirect) when deleting a different session", async () => {
    vi.mocked(requireActor).mockResolvedValueOnce({ ok: true, actor: FAKE_ACTOR });
    vi.mocked(requireRole).mockReturnValueOnce({ ok: true });
    vi.mocked(softDeleteSession).mockResolvedValueOnce(undefined);

    await deleteSessionAction(TARGET_ID, OTHER_ID);

    expect(softDeleteSession).toHaveBeenCalledWith(
      TARGET_ID,
      FAKE_ACTOR.tenant_id,
      FAKE_ACTOR.user_id,
    );
    expect(revalidatePath).toHaveBeenCalledWith("/home");
    expect(redirect).not.toHaveBeenCalled();
  });

  it("revalidates /home (no redirect) when currentSessionId is omitted", async () => {
    vi.mocked(requireActor).mockResolvedValueOnce({ ok: true, actor: FAKE_ACTOR });
    vi.mocked(requireRole).mockReturnValueOnce({ ok: true });
    vi.mocked(softDeleteSession).mockResolvedValueOnce(undefined);

    await deleteSessionAction(TARGET_ID);

    expect(softDeleteSession).toHaveBeenCalledWith(
      TARGET_ID,
      FAKE_ACTOR.tenant_id,
      FAKE_ACTOR.user_id,
    );
    expect(revalidatePath).toHaveBeenCalledWith("/home");
    expect(redirect).not.toHaveBeenCalled();
  });
});
