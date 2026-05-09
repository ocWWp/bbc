import fs from "node:fs/promises";
import path from "node:path";
import type { LogEntry, LogStore } from "../interfaces";

export class LocalLogStore implements LogStore {
  constructor(private readonly bbcRoot: string) {}

  async list(): Promise<LogEntry[]> {
    const filePath = path.join(this.bbcRoot, "_log", "operations.jsonl");
    let text: string;
    try {
      text = await fs.readFile(filePath, "utf8");
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

  async lkg(): Promise<number> {
    try {
      const t = await fs.readFile(path.join(this.bbcRoot, "_log", "lkg.txt"), "utf8");
      const n = parseInt(t.trim(), 10);
      return Number.isFinite(n) ? n : 0;
    } catch {
      return 0;
    }
  }
}
