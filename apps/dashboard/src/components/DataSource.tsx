type Layer = "Main" | "Manager" | "Shared" | "Leaf" | "Infra";

const LAYER_TITLE: Record<Layer, string> = {
  Main: "Main — canonical truth: principles, memory, library, audit log",
  Manager: "Manager — workflow rules + queue annotations (per ADR-0002)",
  Shared: "Shared infrastructure — Main's inbox; Manager appends review blocks",
  Leaf: "Distribution leaf — per-workstream view",
  Infra: "BBC infrastructure (slash commands, scripts) — not in any layer",
};

/**
 * Tiny footer showing where a card's data came from. Dashboard reads from
 * Main-owned files almost exclusively; this label makes that visible.
 */
export default function DataSource({
  path,
  layer,
}: {
  path: string;
  layer: Layer;
}) {
  return (
    <div className="data-source" title={LAYER_TITLE[layer]}>
      <span className="data-source-from">from</span>{" "}
      <code>{path}</code>
      <span className="data-source-sep"> · </span>
      <span className={`data-source-layer ds-${layer.toLowerCase()}`}>{layer}</span>
    </div>
  );
}
