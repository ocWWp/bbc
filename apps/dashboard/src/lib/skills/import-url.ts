// Server-side URL import for SKILL.md-BBC files.
//
// Surface:
//   fetchSkillFromUrl(url): Promise<FetchResult>
//   normalizeImportUrl(url): NormalizedUrl | UrlError
//
// Security model (per docs/plans/2026-05-12-bbc-launch-design.md §4):
//   - Allowlist: github.com, raw.githubusercontent.com only.
//   - No redirects off the allowlist; we use redirect: "manual" and resolve
//     them ourselves so a redirect from github.com → evil.com is rejected.
//   - 256KB body cap (matches the parser's MAX_FILE_BYTES).
//   - GitHub 429 → surface the retry-after header to the caller.
//   - Caller (server action) is responsible for requireRole(actor, "admin").
//     This module is pure; it does NO Supabase writes and reads no secrets.
//
// Server action wiring (apps/dashboard/src/app/library/skills/import-action.ts)
// will use this + parseSkillMd + scanForInjectionPatterns to land the import
// in tenant_skills.

const ALLOWED_HOSTS = new Set(["github.com", "raw.githubusercontent.com"]);
const MAX_REDIRECTS = 3;
const MAX_BODY_BYTES = 256 * 1024;

export type UrlErrorCode =
  | "URL_NOT_ALLOWED"
  | "URL_INVALID"
  | "OFF_ALLOWLIST_REDIRECT"
  | "TOO_MANY_REDIRECTS"
  | "BODY_TOO_LARGE"
  | "FETCH_FAILED"
  | "RATE_LIMITED"
  | "NOT_FOUND";

export type UrlError = {
  code: UrlErrorCode;
  hint: string;
  retryAfterSeconds?: number;
  status?: number;
};

export type NormalizedUrl = {
  /** The URL we actually fetch (always raw.githubusercontent.com). */
  rawUrl: string;
  /** A stable identifier for the source repo + path, used as tenant_skills.source_url. */
  displayUrl: string;
  /** owner/repo (parsed from path). */
  repo: string;
  /** The branch / ref the URL points at. */
  ref: string;
  /** The file path inside the repo. */
  path: string;
};

export type FetchOk = {
  ok: true;
  body: string;
  source: NormalizedUrl;
  /** Git SHA at fetch time if we could resolve it (otherwise the ref). */
  commit: string;
};

export type FetchResult = FetchOk | UrlError;

export function normalizeImportUrl(url: string): NormalizedUrl | UrlError {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { code: "URL_INVALID", hint: "Could not parse as URL." };
  }

  if (parsed.protocol !== "https:") {
    return { code: "URL_NOT_ALLOWED", hint: "Only https:// URLs are allowed." };
  }

  if (!ALLOWED_HOSTS.has(parsed.hostname)) {
    return {
      code: "URL_NOT_ALLOWED",
      hint: `Only github.com or raw.githubusercontent.com are allowed; got ${parsed.hostname}.`,
    };
  }

  // github.com/<owner>/<repo>/blob/<ref>/<path...>
  // raw.githubusercontent.com/<owner>/<repo>/<ref>/<path...>
  const segments = parsed.pathname.split("/").filter(Boolean);

  if (parsed.hostname === "github.com") {
    if (segments.length < 5 || segments[2] !== "blob") {
      return {
        code: "URL_INVALID",
        hint: "Expected github.com/<owner>/<repo>/blob/<ref>/<path>.",
      };
    }
    const [owner, repo, , ref, ...pathParts] = segments;
    const path = pathParts.join("/");
    return {
      rawUrl: `https://raw.githubusercontent.com/${owner}/${repo}/${ref}/${path}`,
      displayUrl: url,
      repo: `${owner}/${repo}`,
      ref,
      path,
    };
  }

  // raw.githubusercontent.com
  if (segments.length < 4) {
    return {
      code: "URL_INVALID",
      hint: "Expected raw.githubusercontent.com/<owner>/<repo>/<ref>/<path>.",
    };
  }
  const [owner, repo, ref, ...pathParts] = segments;
  const path = pathParts.join("/");
  return {
    rawUrl: url,
    displayUrl: url,
    repo: `${owner}/${repo}`,
    ref,
    path,
  };
}

export async function fetchSkillFromUrl(url: string): Promise<FetchResult> {
  const normalized = normalizeImportUrl(url);
  if ("code" in normalized) return normalized;
  return fetchWithGuards(normalized.rawUrl, normalized, 0);
}

async function fetchWithGuards(
  url: string,
  source: NormalizedUrl,
  redirectsSeen: number,
): Promise<FetchResult> {
  if (redirectsSeen > MAX_REDIRECTS) {
    return { code: "TOO_MANY_REDIRECTS", hint: `Exceeded ${MAX_REDIRECTS} redirects.` };
  }

  let resp: Response;
  try {
    resp = await fetch(url, { redirect: "manual", headers: { Accept: "text/plain" } });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown";
    return { code: "FETCH_FAILED", hint: `fetch error: ${msg}` };
  }

  // Manual-redirect handling: resolve only if target host is on the allowlist.
  if (resp.status >= 300 && resp.status < 400) {
    const location = resp.headers.get("location");
    if (!location) {
      return { code: "FETCH_FAILED", hint: `${resp.status} redirect with no Location header.` };
    }
    let nextUrl: URL;
    try {
      nextUrl = new URL(location, url);
    } catch {
      return { code: "FETCH_FAILED", hint: `invalid redirect Location: ${location}` };
    }
    if (!ALLOWED_HOSTS.has(nextUrl.hostname)) {
      return {
        code: "OFF_ALLOWLIST_REDIRECT",
        hint: `Refused to follow redirect to ${nextUrl.hostname}.`,
      };
    }
    return fetchWithGuards(nextUrl.toString(), source, redirectsSeen + 1);
  }

  if (resp.status === 429) {
    const retryAfter = parseRetryAfter(resp.headers.get("retry-after"));
    return {
      code: "RATE_LIMITED",
      hint: "github rate-limited the fetch.",
      retryAfterSeconds: retryAfter,
      status: 429,
    };
  }

  if (resp.status === 404) {
    return { code: "NOT_FOUND", hint: "Repository or file not found.", status: 404 };
  }

  if (!resp.ok) {
    return {
      code: "FETCH_FAILED",
      hint: `github responded ${resp.status}.`,
      status: resp.status,
    };
  }

  // Stream so we can enforce the size cap without buffering an attacker-sized payload.
  const reader = resp.body?.getReader();
  if (!reader) {
    const text = await resp.text();
    if (Buffer.byteLength(text, "utf8") > MAX_BODY_BYTES) {
      return { code: "BODY_TOO_LARGE", hint: "Body exceeds 256 KB." };
    }
    return finalize(text, source, resp);
  }

  const decoder = new TextDecoder();
  let received = 0;
  let buf = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > MAX_BODY_BYTES) {
        try {
          await reader.cancel();
        } catch {
          /* best effort */
        }
        return { code: "BODY_TOO_LARGE", hint: "Body exceeds 256 KB." };
      }
      buf += decoder.decode(value, { stream: true });
    }
    buf += decoder.decode();
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown";
    return { code: "FETCH_FAILED", hint: `stream error: ${msg}` };
  }

  return finalize(buf, source, resp);
}

function finalize(body: string, source: NormalizedUrl, resp: Response): FetchOk {
  // GitHub sets x-source-commit on raw fetches (for non-default refs we can't
  // resolve a SHA cheaply without a second API call -- fall back to the ref).
  const commit = resp.headers.get("x-source-commit") ?? source.ref;
  return { ok: true, body, source, commit };
}

function parseRetryAfter(value: string | null): number | undefined {
  if (!value) return undefined;
  const asNumber = Number(value);
  if (Number.isFinite(asNumber) && asNumber >= 0) return Math.ceil(asNumber);
  const asDate = Date.parse(value);
  if (!Number.isNaN(asDate)) {
    const secs = Math.ceil((asDate - Date.now()) / 1000);
    return Math.max(0, secs);
  }
  return undefined;
}
