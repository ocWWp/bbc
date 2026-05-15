import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/navigation", () => ({ redirect: vi.fn((to: string) => { throw new Error(`REDIRECT:${to}`); }) }));
vi.mock("@/lib/auth/require-user", () => ({ requireActor: vi.fn() }));
vi.mock("@/lib/studio/read-recent-runs", () => ({ readRecentRuns: vi.fn().mockResolvedValue([]) }));
vi.mock("@/lib/bindings/read-has-provider-key", () => ({ readHasProviderKey: vi.fn().mockResolvedValue(true) }));

import HomePage from "./page";
import { requireActor } from "@/lib/auth/require-user";
import { readRecentRuns } from "@/lib/studio/read-recent-runs";
import { readHasProviderKey } from "@/lib/bindings/read-has-provider-key";

describe("/home", () => {
  beforeEach(() => vi.clearAllMocks());

  it("redirects unauth → /auth/signin?callbackUrl=/home", async () => {
    (requireActor as any).mockResolvedValue({ ok: false });
    await expect(HomePage()).rejects.toThrow("REDIRECT:/auth/signin?callbackUrl=/home");
  });

  it("renders for admin (does not bounce)", async () => {
    (requireActor as any).mockResolvedValue({ ok: true, actor: { tenant_id: "t1", role: "admin", tenant_slug: "acme" } });
    await expect(HomePage()).resolves.toBeDefined();
  });

  it("renders for member (does NOT bounce to studio)", async () => {
    (requireActor as any).mockResolvedValue({ ok: true, actor: { tenant_id: "t1", role: "member", tenant_slug: "acme" } });
    await expect(HomePage()).resolves.toBeDefined();
  });

  it("renders for operator (does not bounce)", async () => {
    (requireActor as any).mockResolvedValue({ ok: true, actor: { tenant_id: "t1", role: "operator", tenant_slug: "acme" } });
    await expect(HomePage()).resolves.toBeDefined();
  });

  it("redirects viewer → /brain (defense in depth)", async () => {
    (requireActor as any).mockResolvedValue({ ok: true, actor: { tenant_id: "t1", role: "viewer", tenant_slug: "acme" } });
    await expect(HomePage()).rejects.toThrow("REDIRECT:/brain");
  });

  it("loads recent runs (limit 5) and provider-key status in parallel", async () => {
    (requireActor as any).mockResolvedValue({ ok: true, actor: { tenant_id: "t1", role: "admin", tenant_slug: "acme" } });
    (readRecentRuns as any).mockResolvedValueOnce([]);
    (readHasProviderKey as any).mockResolvedValueOnce(true);
    await HomePage();
    expect(readRecentRuns).toHaveBeenCalledWith("t1", { limit: 5 });
    expect(readHasProviderKey).toHaveBeenCalledWith("t1");
  });
});
