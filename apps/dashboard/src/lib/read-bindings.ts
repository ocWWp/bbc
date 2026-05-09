/**
 * Thin shim — preserves the historical export shape (`Binding`, `readBindings`)
 * so existing pages keep importing from this path. Implementation now lives in @bbc/store.
 */
export type { Binding } from "@bbc/store";
import type { Binding } from "@bbc/store";
import { getStore } from "./store";

export async function readBindings(): Promise<Binding[]> {
  const store = await getStore();
  return store.bindings.list();
}
