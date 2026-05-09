/**
 * Thin shim — preserves the historical export shape (`LogEntry`, `readLog`,
 * `readLkg`, `recentLog`, `countSince`) so existing pages keep importing
 * from this path. Implementation now lives in @bbc/store.
 */
export type { LogEntry } from "@bbc/store";
import type { LogEntry } from "@bbc/store";
import { getStore } from "./store";

export async function readLog(): Promise<LogEntry[]> {
  const store = await getStore();
  return store.log.list();
}

export async function readLkg(): Promise<number> {
  const store = await getStore();
  return store.log.lkg();
}

export function recentLog(entries: LogEntry[], n: number): LogEntry[] {
  return entries.slice(-n).reverse();
}

export function countSince(entries: LogEntry[], action: string, days: number): number {
  const cutoff = Date.now() - days * 24 * 3600 * 1000;
  return entries.filter((e) => e.action === action && new Date(e.ts).getTime() >= cutoff).length;
}
