import path from "node:path";

/**
 * Resolves the tenant repo root that the dashboard reads from in file-mode.
 *
 * Priority:
 *   1. process.env.BBC_REPO (absolute or relative to dashboard cwd)
 *   2. Default: examples/example-tenant/ — the demo Acme Co tenant inside
 *      the BBC monorepo. Newcomers get a populated dashboard out of the box.
 *
 * For your own tenant, set BBC_REPO=path-to-your-tenant-repo. See
 * docs/tenant-repo-architecture.md.
 *
 * Reads at request-time. No caching.
 */
export function bbcRepoRoot(): string {
  const env = process.env.BBC_REPO;
  if (env) {
    return path.isAbsolute(env) ? env : path.resolve(process.cwd(), env);
  }
  return path.resolve(process.cwd(), "..", "..", "examples", "example-tenant");
}

export const BBC = {
  root: bbcRepoRoot(),
  queue: () => path.join(bbcRepoRoot(), "queue"),
  accepted: () => path.join(bbcRepoRoot(), "queue", "_accepted"),
  rejected: () => path.join(bbcRepoRoot(), "queue", "_rejected"),
  log: () => path.join(bbcRepoRoot(), "_log", "operations.jsonl"),
  lkg: () => path.join(bbcRepoRoot(), "_log", "lkg.txt"),
  bindings: () => path.join(bbcRepoRoot(), "memory", "ops", "bindings.yaml"),
  state: () => path.join(bbcRepoRoot(), ".planning", "STATE.md"),
};
