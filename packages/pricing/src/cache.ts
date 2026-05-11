import { promises as fs } from "node:fs";
import path from "node:path";

type CacheEntry<T> = {
  value: T;
  fetched_at: string;
};

const memCache = new Map<string, CacheEntry<unknown>>();

function cachePath(cacheDir: string): string {
  return path.join(cacheDir, "pricing-cache.json");
}

export async function loadDiskCache(cacheDir: string): Promise<void> {
  try {
    const content = await fs.readFile(cachePath(cacheDir), "utf8");
    const data = JSON.parse(content) as Record<string, CacheEntry<unknown>>;
    for (const [k, v] of Object.entries(data)) {
      if (!memCache.has(k)) memCache.set(k, v);
    }
  } catch {
    // First run; no cache file yet.
  }
}

export async function persistDiskCache(cacheDir: string): Promise<void> {
  await fs.mkdir(cacheDir, { recursive: true });
  const obj: Record<string, CacheEntry<unknown>> = {};
  for (const [k, v] of memCache.entries()) obj[k] = v;
  await fs.writeFile(cachePath(cacheDir), JSON.stringify(obj, null, 2) + "\n");
}

export function getCached<T>(key: string): CacheEntry<T> | undefined {
  return memCache.get(key) as CacheEntry<T> | undefined;
}

export function setCached<T>(key: string, value: T, fetchedAt: Date = new Date()): void {
  memCache.set(key, { value, fetched_at: fetchedAt.toISOString() });
}

export function ageHours(entry: { fetched_at: string }, now: Date = new Date()): number {
  return (now.getTime() - new Date(entry.fetched_at).getTime()) / 3_600_000;
}

/**
 * Test helper. Production callers should not need this.
 */
export function _resetCache(): void {
  memCache.clear();
}
