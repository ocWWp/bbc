import { describe, it, expect } from "vitest";
import { validatePatLive } from "./github-validate";

type FetchCallArgs = { url: string };

function recordingFetch(status: number, body: unknown = {}) {
  const calls: FetchCallArgs[] = [];
  const fn = async (url: string) => {
    calls.push({ url });
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
      text: async () => JSON.stringify(body),
      headers: { get: () => null },
    };
  };
  return { fn, calls };
}

describe("validatePatLive", () => {
  it("pings /repos/{owner}/{repo}, not /user (codex P2 PR#24)", async () => {
    const rec = recordingFetch(200, { full_name: "octocat/hello" });
    await validatePatLive("ghp_xxx", { owner: "octocat", repo: "hello" }, rec.fn);
    expect(rec.calls).toHaveLength(1);
    expect(rec.calls[0].url).toBe("https://api.github.com/repos/octocat/hello");
  });

  it("returns ok with login on 200 (repo accessible)", async () => {
    const rec = recordingFetch(200, { full_name: "octocat/hello", owner: { login: "octocat" } });
    const r = await validatePatLive("ghp_xxx", { owner: "octocat", repo: "hello" }, rec.fn);
    expect(r).toEqual({ ok: true, login: "octocat" });
  });

  it("returns invalid_token on 401", async () => {
    const rec = recordingFetch(401);
    const r = await validatePatLive("bad", { owner: "o", repo: "r" }, rec.fn);
    expect(r).toEqual({ ok: false, reason: "invalid_token" });
  });

  it("returns insufficient_scope on 403", async () => {
    const rec = recordingFetch(403);
    const r = await validatePatLive("partial", { owner: "o", repo: "r" }, rec.fn);
    expect(r).toEqual({ ok: false, reason: "insufficient_scope" });
  });

  it("returns insufficient_scope on 404 (repo invisible to fine-grained PAT)", async () => {
    // Fine-grained PATs that authenticate but lack repo access often see 404
    // (GitHub treats "no permission" and "doesn't exist" the same for privacy).
    // Either way the user can't install — call it insufficient_scope so the
    // UI message ("Token lacks the repo scope") is honest.
    const rec = recordingFetch(404);
    const r = await validatePatLive("limited", { owner: "o", repo: "r" }, rec.fn);
    expect(r).toEqual({ ok: false, reason: "insufficient_scope" });
  });

  it("returns network on transport error", async () => {
    const r = await validatePatLive(
      "any",
      { owner: "o", repo: "r" },
      async () => {
        throw new Error("net");
      },
    );
    expect(r.ok).toBe(false);
  });
});
