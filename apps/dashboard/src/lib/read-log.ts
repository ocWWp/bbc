import fs from "node:fs/promises";
import { BBC } from "./bbc-paths";

export type LogEntry = {
  v: number;
  ts: string;
  host: string;
  actor: string;
  action: string;
  target: string;
  state_hash?: string;
  lkg_at_emit?: number;
  previous_primary?: string;
};

export async function readLog(): Promise<LogEntry[]> {
  let text: string;
  try {
    text = await fs.readFile(BBC.log(), "utf8");
  } catch {
    return [];
  }
  const out: LogEntry[] = [];
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    try {
      out.push(JSON.parse(line));
    } catch {
      // skip malformed lines
    }
  }
  return out;
}

export async function readLkg(): Promise<number> {
  try {
    const t = await fs.readFile(BBC.lkg(), "utf8");
    const n = parseInt(t.trim(), 10);
    return Number.isFinite(n) ? n : 0;
  } catch {
    return 0;
  }
}

export function recentLog(entries: LogEntry[], n: number): LogEntry[] {
  return entries.slice(-n).reverse(); // newest first
}

export function countSince(entries: LogEntry[], action: string, days: number): number {
  const cutoff = Date.now() - days * 24 * 3600 * 1000;
  return entries.filter((e) => {
    if (e.action !== action) return false;
    const t = Date.parse(e.ts);
    return Number.isFinite(t) && t >= cutoff;
  }).length;
}
