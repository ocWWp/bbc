import { describe, it, expect, vi, beforeEach } from "vitest";
import { assertOAuthEnv } from "./oauth-env-guard";

describe("assertOAuthEnv", () => {
  beforeEach(() => { vi.unstubAllEnvs?.(); });

  it("throws when BBC_OAUTH_STATE_SECRET is unset", () => {
    vi.stubEnv("BBC_OAUTH_STATE_SECRET", undefined as unknown as string);
    expect(() => assertOAuthEnv()).toThrow(/BBC_OAUTH_STATE_SECRET/);
  });

  it("throws when BBC_OAUTH_STATE_SECRET is empty string (Cloudflare gotcha)", () => {
    vi.stubEnv("BBC_OAUTH_STATE_SECRET", "");
    expect(() => assertOAuthEnv()).toThrow(/BBC_OAUTH_STATE_SECRET/);
  });

  it("does not throw when BBC_OAUTH_STATE_SECRET is a non-empty string", () => {
    vi.stubEnv("BBC_OAUTH_STATE_SECRET", "anything-non-empty");
    expect(() => assertOAuthEnv()).not.toThrow();
  });
});
