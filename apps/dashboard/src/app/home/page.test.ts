import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/navigation", () => ({ redirect: vi.fn((to: string) => { throw new Error(`REDIRECT:${to}`); }) }));
vi.mock("@/lib/auth/require-user", () => ({ requireActor: vi.fn() }));

import HomePage from "./page";
import { requireActor } from "@/lib/auth/require-user";

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
    (requireActor as any).mockResolvedValue({ ok: true, actor: { tenant_id: "t1", role: "member", tenant_slug: "acme", templateSlug: "marketing" } });
    await expect(HomePage()).resolves.toBeDefined();
  });

  it("renders for operator (does not bounce)", async () => {
    (requireActor as any).mockResolvedValue({ ok: true, actor: { tenant_id: "t1", role: "operator", tenant_slug: "acme" } });
    await expect(HomePage()).resolves.toBeDefined();
  });

  it("redirects viewer → /brain (defense in depth — root '/' should catch first)", async () => {
    (requireActor as any).mockResolvedValue({ ok: true, actor: { tenant_id: "t1", role: "viewer", tenant_slug: "acme" } });
    await expect(HomePage()).rejects.toThrow("REDIRECT:/brain");
  });
});
