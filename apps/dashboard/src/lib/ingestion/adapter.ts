export type IngestionSourceKind = "text" | "url" | "file";

export type AdapterResult =
  | {
      ok: true;
      rawText: string;
      locator: Record<string, unknown>;
      contentHash: string;
      byteSize: number;
    }
  | { ok: false; error: string };

export interface SourceAdapter<TConfig = unknown> {
  kind: IngestionSourceKind;
  ingest(input: TConfig): Promise<AdapterResult>;
}

const registry: Partial<Record<IngestionSourceKind, SourceAdapter>> = {};

export function registerAdapter<T>(a: SourceAdapter<T>): void {
  registry[a.kind] = a as SourceAdapter;
}

export function getAdapter(kind: IngestionSourceKind): SourceAdapter | undefined {
  return registry[kind];
}

export const adapters = registry as Record<IngestionSourceKind, SourceAdapter | undefined>;
