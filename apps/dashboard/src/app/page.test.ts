import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/navigation", () => ({ redirect: vi.fn((to: string) => { throw new Error(`REDIRECT:${to}`); }) }));
vi.mock("@/lib/auth/require-user", () => ({ requireActor: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ getSupabaseServerClient: vi.fn() }));

import Root from "./page";
import { requireActor } from "@/lib/auth/require-user";
import { getSupabaseServerClient } from "@/lib/supabase/server";

function mockSupabaseCount(count: number) {
  const eq = vi.fn().mockResolvedValue({ count });
  const select = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ select }));
  (getSupabaseServerClient as any).mockResolvedValue({ from });
}

describe("root /", () => {
  beforeEach(() => vi.clearAllMocks());

  it("redirects unauth → /queue", async () => {
    (requireActor as any).mockResolvedValue({ ok: false });
    await expect(Root()).rejects.toThrow("REDIRECT:/queue");
  });

  it("redirects empty-brain → /welcome", async () => {
    (requireActor as any).mockResolvedValue({ ok: true, actor: { tenant_id: "t1", role: "member" } });
    mockSupabaseCount(0);
    await expect(Root()).rejects.toThrow("REDIRECT:/welcome");
  });

  it("redirects viewer → /brain", async () => {
    (requireActor as any).mockResolvedValue({ ok: true, actor: { tenant_id: "t1", role: "viewer" } });
    mockSupabaseCount(5);
    await expect(Root()).rejects.toThrow("REDIRECT:/brain");
  });

  it("redirects member → /home", async () => {
    (requireActor as any).mockResolvedValue({ ok: true, actor: { tenant_id: "t1", role: "member" } });
    mockSupabaseCount(5);
    await expect(Root()).rejects.toThrow("REDIRECT:/home");
  });

  it("redirects admin → /home", async () => {
    (requireActor as any).mockResolvedValue({ ok: true, actor: { tenant_id: "t1", role: "admin" } });
    mockSupabaseCount(5);
    await expect(Root()).rejects.toThrow("REDIRECT:/home");
  });

  it("redirects operator → /home", async () => {
    (requireActor as any).mockResolvedValue({ ok: true, actor: { tenant_id: "t1", role: "operator" } });
    mockSupabaseCount(5);
    await expect(Root()).rejects.toThrow("REDIRECT:/home");
  });
});
