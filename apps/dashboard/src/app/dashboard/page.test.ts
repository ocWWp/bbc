import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/navigation", () => ({ redirect: vi.fn((to: string) => { throw new Error(`REDIRECT:${to}`); }) }));
vi.mock("@/lib/auth/require-user", () => ({ requireActor: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ getSupabaseServerClient: vi.fn().mockResolvedValue({}) }));
vi.mock("@/lib/home/read-brain-health", () => ({ readBrainHealth: vi.fn().mockResolvedValue({}) }));
vi.mock("@/lib/home/read-queue-summary", () => ({ readQueueSummary: vi.fn().mockResolvedValue({}) }));
vi.mock("@/lib/loop3/read-recommendations", () => ({ readPendingRecommendations: vi.fn().mockResolvedValue([]) }));
vi.mock("@/lib/home/read-team-activity", () => ({ readTeamActivity: vi.fn().mockResolvedValue({}) }));

import DashboardPage from "./page";
import { requireActor } from "@/lib/auth/require-user";

describe("/dashboard", () => {
  beforeEach(() => vi.clearAllMocks());

  it("redirects unauth → /auth/signin", async () => {
    (requireActor as any).mockResolvedValue({ ok: false });
    await expect(DashboardPage()).rejects.toThrow(/REDIRECT:\/auth\/signin/);
  });

  it("redirects non-admin (operator) → /home", async () => {
    (requireActor as any).mockResolvedValue({ ok: true, actor: { tenant_id: "t1", role: "operator", tenant_slug: "acme" } });
    await expect(DashboardPage()).rejects.toThrow("REDIRECT:/home");
  });

  it("redirects non-admin (member) → /home", async () => {
    (requireActor as any).mockResolvedValue({ ok: true, actor: { tenant_id: "t1", role: "member", tenant_slug: "acme" } });
    await expect(DashboardPage()).rejects.toThrow("REDIRECT:/home");
  });

  it("redirects non-admin (viewer) → /brain", async () => {
    (requireActor as any).mockResolvedValue({ ok: true, actor: { tenant_id: "t1", role: "viewer", tenant_slug: "acme" } });
    await expect(DashboardPage()).rejects.toThrow("REDIRECT:/brain");
  });

  it("renders for admin", async () => {
    (requireActor as any).mockResolvedValue({ ok: true, actor: { tenant_id: "t1", role: "admin", tenant_slug: "acme" } });
    await expect(DashboardPage()).resolves.toBeDefined();
  });
});
