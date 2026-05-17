import { describe, it, expect, beforeEach, vi } from "vitest";

const SECRET = Buffer.from("0".repeat(32)).toString("base64"); // 32 bytes b64

beforeEach(() => {
  vi.stubEnv("BBC_OAUTH_STATE_SECRET", SECRET);
});

describe("signOAuthState / verifyOAuthState", () => {
  it("round-trips a valid state", async () => {
    const { signOAuthState, verifyOAuthState } = await import("./oauth-state");
    const payload = {
      tenant_id: "t-1",
      actor_user_id: "u-1",
      provider: "google",
      scopes: ["gmail", "drive"],
      nonce: "11111111-1111-1111-1111-111111111111",
      expires_at_ms: Date.now() + 60_000,
    };
    const signed = signOAuthState(payload);
    const out = verifyOAuthState(signed, Date.now());
    expect(out).toEqual(payload);
  });

  it("rejects a tampered payload", async () => {
    const { signOAuthState, verifyOAuthState } = await import("./oauth-state");
    const signed = signOAuthState({
      tenant_id: "t-1", actor_user_id: "u-1", provider: "google",
      scopes: ["gmail"], nonce: "x", expires_at_ms: Date.now() + 60_000,
    });
    // flip a byte in the payload (left of the `.`)
    const [payload, sig] = signed.split(".");
    const tampered = payload.slice(0, -1) + (payload.at(-1) === "A" ? "B" : "A") + "." + sig;
    expect(verifyOAuthState(tampered, Date.now())).toBeNull();
  });

  it("rejects an expired state", async () => {
    const { signOAuthState, verifyOAuthState } = await import("./oauth-state");
    const signed = signOAuthState({
      tenant_id: "t-1", actor_user_id: "u-1", provider: "google",
      scopes: ["gmail"], nonce: "x", expires_at_ms: Date.now() - 1,
    });
    expect(verifyOAuthState(signed, Date.now())).toBeNull();
  });

  it("throws if BBC_OAUTH_STATE_SECRET is empty", async () => {
    vi.stubEnv("BBC_OAUTH_STATE_SECRET", "");
    vi.resetModules();
    const { signOAuthState } = await import("./oauth-state");
    expect(() => signOAuthState({
      tenant_id: "t-1", actor_user_id: "u-1", provider: "google",
      scopes: [], nonce: "x", expires_at_ms: Date.now() + 60_000,
    })).toThrow(/BBC_OAUTH_STATE_SECRET/);
  });
});
