// URL-import security tests. Covers the security model from
// docs/plans/2026-05-12-bbc-launch-design.md §4.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchSkillFromUrl, normalizeImportUrl } from "./import-url";

const ORIGINAL_FETCH = globalThis.fetch;

function mockFetchSequence(responses: Array<Response | Error>) {
  const queue = [...responses];
  globalThis.fetch = vi.fn(async () => {
    const r = queue.shift();
    if (!r) throw new Error("mockFetchSequence: out of responses");
    if (r instanceof Error) throw r;
    return r;
  }) as unknown as typeof fetch;
}

afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH;
});

describe("normalizeImportUrl", () => {
  it("accepts github.com/blob URL and rewrites to raw", () => {
    const r = normalizeImportUrl("https://github.com/anthropics/skills/blob/main/marketing/launch.md");
    if ("code" in r) throw new Error(r.hint);
    expect(r.rawUrl).toBe("https://raw.githubusercontent.com/anthropics/skills/main/marketing/launch.md");
    expect(r.repo).toBe("anthropics/skills");
    expect(r.ref).toBe("main");
    expect(r.path).toBe("marketing/launch.md");
  });

  it("accepts raw.githubusercontent.com URL", () => {
    const r = normalizeImportUrl("https://raw.githubusercontent.com/anthropics/skills/main/x.md");
    if ("code" in r) throw new Error(r.hint);
    expect(r.rawUrl).toBe("https://raw.githubusercontent.com/anthropics/skills/main/x.md");
  });

  it("URL_NOT_ALLOWED for non-github host", () => {
    const r = normalizeImportUrl("https://gist.github.io/x/y.md");
    expect("code" in r && r.code).toBe("URL_NOT_ALLOWED");
  });

  it("URL_NOT_ALLOWED for http scheme", () => {
    const r = normalizeImportUrl("http://github.com/a/b/blob/main/x.md");
    expect("code" in r && r.code).toBe("URL_NOT_ALLOWED");
  });

  it("URL_INVALID for github URL missing /blob/<ref>/<path>", () => {
    const r = normalizeImportUrl("https://github.com/a/b");
    expect("code" in r && r.code).toBe("URL_INVALID");
  });
});

describe("fetchSkillFromUrl — security guards", () => {
  it("rejects off-allowlist host upfront", async () => {
    const r = await fetchSkillFromUrl("https://evil.com/skill.md");
    expect("code" in r && r.code).toBe("URL_NOT_ALLOWED");
  });

  it("rejects a redirect that hops off the allowlist", async () => {
    mockFetchSequence([
      new Response(null, {
        status: 302,
        headers: { location: "https://evil.com/skill.md" },
      }),
    ]);
    const r = await fetchSkillFromUrl(
      "https://raw.githubusercontent.com/a/b/main/x.md",
    );
    expect("code" in r && r.code).toBe("OFF_ALLOWLIST_REDIRECT");
  });

  it("follows redirects within the allowlist (github.com → raw.githubusercontent.com)", async () => {
    mockFetchSequence([
      new Response(null, {
        status: 302,
        headers: { location: "https://raw.githubusercontent.com/a/b/main/x.md" },
      }),
      new Response("hello body", { status: 200 }),
    ]);
    const r = await fetchSkillFromUrl(
      "https://raw.githubusercontent.com/a/b/main/x.md",
    );
    expect("ok" in r && r.ok).toBe(true);
    if ("ok" in r && r.ok) expect(r.body).toBe("hello body");
  });

  it("BODY_TOO_LARGE when body exceeds 256 KB", async () => {
    const big = "x".repeat(300_000);
    mockFetchSequence([new Response(big, { status: 200 })]);
    const r = await fetchSkillFromUrl(
      "https://raw.githubusercontent.com/a/b/main/x.md",
    );
    expect("code" in r && r.code).toBe("BODY_TOO_LARGE");
  });

  it("RATE_LIMITED on 429 with parsed retry-after seconds", async () => {
    mockFetchSequence([
      new Response(null, { status: 429, headers: { "retry-after": "42" } }),
    ]);
    const r = await fetchSkillFromUrl(
      "https://raw.githubusercontent.com/a/b/main/x.md",
    );
    expect("code" in r && r.code).toBe("RATE_LIMITED");
    if ("code" in r && r.code === "RATE_LIMITED") {
      expect(r.retryAfterSeconds).toBe(42);
    }
  });

  it("RATE_LIMITED on 429 with HTTP-date retry-after", async () => {
    const fiveSecondsFromNow = new Date(Date.now() + 5_000).toUTCString();
    mockFetchSequence([
      new Response(null, { status: 429, headers: { "retry-after": fiveSecondsFromNow } }),
    ]);
    const r = await fetchSkillFromUrl(
      "https://raw.githubusercontent.com/a/b/main/x.md",
    );
    expect("code" in r && r.code).toBe("RATE_LIMITED");
    if ("code" in r && r.code === "RATE_LIMITED") {
      expect(r.retryAfterSeconds).toBeGreaterThanOrEqual(0);
      expect(r.retryAfterSeconds).toBeLessThanOrEqual(6);
    }
  });

  it("NOT_FOUND on 404", async () => {
    mockFetchSequence([new Response(null, { status: 404 })]);
    const r = await fetchSkillFromUrl(
      "https://raw.githubusercontent.com/a/b/main/x.md",
    );
    expect("code" in r && r.code).toBe("NOT_FOUND");
  });

  it("returns the fetched body on 200", async () => {
    mockFetchSequence([new Response("# skill body", { status: 200 })]);
    const r = await fetchSkillFromUrl(
      "https://raw.githubusercontent.com/a/b/main/x.md",
    );
    expect("ok" in r && r.ok).toBe(true);
    if ("ok" in r && r.ok) {
      expect(r.body).toBe("# skill body");
      expect(r.source.repo).toBe("a/b");
    }
  });
});
