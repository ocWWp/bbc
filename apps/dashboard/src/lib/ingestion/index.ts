// Side-effect imports populate the shared adapter registry. Consumers should
// `import "@/lib/ingestion"` once (typically in the server action) before
// calling `getAdapter(kind)`.
import "./adapters/text";
import "./adapters/url";
import "./adapters/file";

export {
  getAdapter,
  adapters,
  type AdapterResult,
  type IngestionSourceKind,
  type SourceAdapter,
} from "./adapter";
