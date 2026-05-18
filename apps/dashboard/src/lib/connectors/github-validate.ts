// Phase K install-flow: live PAT validation against GitHub.
//
// We ping the *target repo* directly, not /user, because GitHub fine-grained
// PATs can authenticate cleanly (200 on /user) but still lack access to the
// repo the user wants to install. Pinging /repos/{owner}/{repo} reads through
// to the actual permission boundary so install can't succeed for a PAT that
// will 403 on every subsequent sync (codex P2 on PR #24).
//
// Status mapping:
//   200 → ok (repo readable)
//   401 → invalid_token (PAT itself rejected)
//   403 → insufficient_scope (PAT lacks repo permission)
//   404 → insufficient_scope (GitHub returns 404 for repos a fine-grained PAT
//         can't see, mixed in with truly-missing repos. From the user's POV
//         it's the same failure mode: install can't proceed.)
//   anything else → unknown
//   throw → network

type Fetcher = (url: string, init?: any) => Promise<{
  ok: boolean;
  status: number;
  json: () => Promise<any>;
  text: () => Promise<string>;
  headers: { get: (k: string) => string | null };
}>;

export async function validatePatLive(
  pat: string,
  target: { owner: string; repo: string },
  fetchImpl: Fetcher = globalThis.fetch as any,
): Promise<
  { ok: true; login: string } | { ok: false; reason: "invalid_token" | "insufficient_scope" | "network" | "unknown" }
> {
  try {
    const url = `https://api.github.com/repos/${encodeURIComponent(target.owner)}/${encodeURIComponent(target.repo)}`;
    const res = await fetchImpl(url, {
      headers: {
        Authorization: `Bearer ${pat}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "bbc-connector/0.1",
      },
    });
    if (res.status === 401) return { ok: false, reason: "invalid_token" };
    if (res.status === 403) return { ok: false, reason: "insufficient_scope" };
    if (res.status === 404) return { ok: false, reason: "insufficient_scope" };
    if (!res.ok) return { ok: false, reason: "unknown" };
    const body = (await res.json()) as { owner?: { login?: string }; full_name?: string };
    return { ok: true, login: body.owner?.login ?? body.full_name?.split("/")[0] ?? "unknown" };
  } catch {
    return { ok: false, reason: "network" };
  }
}
