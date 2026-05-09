import path from "node:path";

/**
 * Resolves the BBC repo root.
 *
 * Priority:
 *   1. process.env.BBC_REPO (absolute or relative to dashboard cwd)
 *   2. Monorepo default: ../../ relative to this package (apps/dashboard/ → bbc/)
 *
 * Reads at request-time. No caching.
 */
export function bbcRepoRoot(): string {
  const env = process.env.BBC_REPO;
  if (env) {
    return path.isAbsolute(env) ? env : path.resolve(process.cwd(), env);
  }
  return path.resolve(process.cwd(), "..", "..");
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
