type Fetcher = (url: string, init?: any) => Promise<{ ok: boolean; status: number; json: () => Promise<any>; text: () => Promise<string>; headers: { get: (k: string) => string | null } }>;

export async function validatePatLive(
  pat: string,
  fetchImpl: Fetcher = globalThis.fetch as any,
): Promise<{ ok: true; login: string } | { ok: false; reason: "invalid_token" | "insufficient_scope" | "network" | "unknown" }> {
  try {
    const res = await fetchImpl("https://api.github.com/user", {
      headers: {
        Authorization: `Bearer ${pat}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "bbc-connector/0.1",
      },
    });
    if (res.status === 401) return { ok: false, reason: "invalid_token" };
    if (res.status === 403) return { ok: false, reason: "insufficient_scope" };
    if (!res.ok) return { ok: false, reason: "unknown" };
    const body = (await res.json()) as { login?: string };
    return { ok: true, login: body.login ?? "unknown" };
  } catch {
    return { ok: false, reason: "network" };
  }
}
