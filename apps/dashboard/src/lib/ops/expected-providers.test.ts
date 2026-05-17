// Tests for /ops expected-providers. The reader maps bound adapters
// (memory/ops/bindings.yaml provider IDs like "anthropic-claude-sonnet") to
// the canonical BYOK provider names /settings/keys can create
// (anthropic, openai, resend). Without the mapping /ops would flag an
// unfixable "missing anthropic-claude-sonnet key" warning.

import { describe, expect, it, vi } from "vitest";

import type { ProviderItem } from "@/app/library/_data";

vi.mock("@/app/library/_providers.server", () => ({
  loadRealProviders: vi.fn(),
}));

import { loadRealProviders } from "@/app/library/_providers.server";
import { getExpectedProviders } from "./expected-providers";

function makeProvider(name: string, connected: boolean): ProviderItem {
  return {
    id: `pr_${name}`,
    kind: "provider",
    role: "llm",
    name,
    author: "BBC",
    desc: "",
    connected,
    recommended: false,
    badge: null,
    license: "-",
    env: "",
    lastTest: "-",
    glyph: name.charAt(0).toUpperCase(),
  };
}

describe("getExpectedProviders", () => {
  it("returns empty array when no providers are bound", async () => {
    vi.mocked(loadRealProviders).mockResolvedValueOnce([
      makeProvider("anthropic-claude-sonnet", false),
      makeProvider("resend", false),
    ]);
    expect(await getExpectedProviders()).toEqual([]);
  });

  it("maps bound 'anthropic-claude-sonnet' adapter to the BYOK 'anthropic' provider", async () => {
    vi.mocked(loadRealProviders).mockResolvedValueOnce([
      makeProvider("anthropic-claude-sonnet", true),
    ]);
    expect(await getExpectedProviders()).toEqual(["anthropic"]);
  });

  it("maps bound exact-match 'resend' adapter to the BYOK 'resend' provider", async () => {
    vi.mocked(loadRealProviders).mockResolvedValueOnce([
      makeProvider("resend", true),
    ]);
    expect(await getExpectedProviders()).toEqual(["resend"]);
  });

  it("does NOT include bound adapters that have no BYOK form (e.g. supabase)", async () => {
    vi.mocked(loadRealProviders).mockResolvedValueOnce([
      makeProvider("supabase", true),
      makeProvider("cloudflare-workers", true),
      makeProvider("railway", true),
    ]);
    // None of these match the BYOK_PROVIDER_IDS list. /settings/keys can't
    // create supabase/cloudflare/railway secrets, so /ops must not flag them.
    expect(await getExpectedProviders()).toEqual([]);
  });

  it("returns the full BYOK set when multiple matching bindings are active", async () => {
    vi.mocked(loadRealProviders).mockResolvedValueOnce([
      makeProvider("anthropic-claude-sonnet", true),
      makeProvider("openai-gpt-5", true),
      makeProvider("resend", true),
      makeProvider("supabase", true), // ignored — no BYOK form
    ]);
    expect(await getExpectedProviders().then((arr) => [...arr].sort())).toEqual([
      "anthropic",
      "openai",
      "resend",
    ]);
  });

  it("ignores unbound adapters even if they would otherwise match", async () => {
    vi.mocked(loadRealProviders).mockResolvedValueOnce([
      makeProvider("anthropic-claude-sonnet", false), // unbound
      makeProvider("resend", true), // bound
    ]);
    expect(await getExpectedProviders()).toEqual(["resend"]);
  });
});
