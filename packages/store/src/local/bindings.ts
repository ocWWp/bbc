import fs from "node:fs/promises";
import path from "node:path";
import type { Binding, BindingsStore } from "../interfaces";

/** 5-cell row: | role | provider | provisional | bound_at | notes | */
const ROW_RE = /^\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([^|]*?)\s*\|/;

export class LocalBindingsStore implements BindingsStore {
  constructor(private readonly bbcRoot: string) {}

  async list(): Promise<Binding[]> {
    const filePath = path.join(this.bbcRoot, "memory", "ops", "bindings.yaml");
    let text: string;
    try {
      text = await fs.readFile(filePath, "utf8");
    } catch {
      return [];
    }

    const out: Binding[] = [];
    let inTable = false;

    for (const rawLine of text.split("\n")) {
      const line = rawLine.trim();
      if (line.startsWith("| role")) {
        inTable = true;
        continue;
      }
      if (inTable && line.startsWith("|---")) continue;
      if (!inTable) continue;
      if (!line.startsWith("|")) {
        inTable = false;
        continue;
      }

      const m = line.match(ROW_RE);
      if (!m) continue;
      const role = m[1].trim();
      const providerCell = m[2].trim();
      const provisionalCell = m[3].trim();
      const boundAt = m[4].trim();
      const notes = m[5].trim();

      let provider: string;
      let kind: Binding["kind"];
      let provisional = false;

      if (providerCell === "(unbound)") {
        provider = "(unbound)";
        kind = "unbound";
      } else {
        provider = providerCell;
        provisional = provisionalCell === "yes";
        kind = provisional ? "provisional" : "active";
      }

      out.push({ role, provider, bound_at: boundAt, notes, provisional, kind });
    }

    return out;
  }
}
