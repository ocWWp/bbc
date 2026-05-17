import { describe, it, expect } from "vitest";
import { validatePatLive } from "./github-validate";

const mockFetch = (status: number, body: any = {}) => async () => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
  text: async () => JSON.stringify(body),
  headers: { get: () => null },
});

describe("validatePatLive", () => {
  it("returns ok with login on 200", async () => {
    const r = await validatePatLive("ghp_xxx", mockFetch(200, { login: "octocat" }));
    expect(r).toEqual({ ok: true, login: "octocat" });
  });
  it("returns invalid_token on 401", async () => {
    const r = await validatePatLive("bad", mockFetch(401));
    expect(r).toEqual({ ok: false, reason: "invalid_token" });
  });
  it("returns insufficient_scope on 403", async () => {
    const r = await validatePatLive("partial", mockFetch(403));
    expect(r).toEqual({ ok: false, reason: "insufficient_scope" });
  });
  it("returns network on transport error", async () => {
    const r = await validatePatLive("any", async () => { throw new Error("net"); });
    expect(r.ok).toBe(false);
  });
});
