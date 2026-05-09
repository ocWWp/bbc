import type { Layout, TreeKind } from "@/lib/graph-data";

const NODE_W = 220;
const NODE_H = 56;

const KIND_COLOR: Record<TreeKind, { fill: string; stroke: string; text: string }> = {
  "layer-main":     { fill: "rgba(127,207,177,0.10)", stroke: "var(--ok)",     text: "var(--ok)" },
  "layer-manager":  { fill: "rgba(217,154,74,0.10)",  stroke: "var(--warn)",   text: "var(--warn)" },
  "layer-leaf":     { fill: "rgba(127,207,177,0.05)", stroke: "var(--accent)", text: "var(--accent)" },
  "agent":          { fill: "var(--card)",            stroke: "var(--line)",   text: "var(--fg)" },
  "external-skill": { fill: "var(--card)",            stroke: "var(--muted)",  text: "var(--muted)" },
  "bbc-skill":      { fill: "var(--card)",            stroke: "var(--accent)", text: "var(--accent)" },
  "folder":         { fill: "var(--card)",            stroke: "var(--line)",   text: "var(--fg)" },
  "action":         { fill: "rgba(127,207,177,0.10)", stroke: "var(--accent)", text: "var(--accent)" },
  "artifact":       { fill: "var(--card)",            stroke: "var(--line)",   text: "var(--fg)" },
};

export type SvgGraphProps = {
  layout: Layout;
  /** When true, draw cubic-bezier edges (better for downward trees). When false, use polylines. */
  curved?: boolean;
};

export default function SvgTree({ layout, curved = true }: SvgGraphProps) {
  const padding = 24;
  const width = layout.width + padding * 2;
  const height = layout.height + padding * 2;

  const byId = new Map(layout.nodes.map((n) => [n.id, n]));

  return (
    <div className="svg-graph-wrap">
      <svg viewBox={`0 0 ${width} ${height}`} width="100%" preserveAspectRatio="xMinYMin meet">
        <defs>
          <marker id="arrow" viewBox="0 -5 10 10" refX="10" refY="0" markerWidth="6" markerHeight="6" orient="auto">
            <path d="M0,-4L10,0L0,4" fill="var(--muted)" />
          </marker>
        </defs>

        <g transform={`translate(${padding} ${padding})`}>
          {/* Edges first (under nodes) */}
          {layout.edges.map((e, i) => {
            const a = byId.get(e.from);
            const b = byId.get(e.to);
            if (!a || !b) return null;
            const ax = a.x;
            const ay = a.y + NODE_H / 2;
            const bx = b.x;
            const by = b.y - NODE_H / 2;
            const path = curved
              ? `M ${ax} ${ay} C ${ax} ${(ay + by) / 2}, ${bx} ${(ay + by) / 2}, ${bx} ${by}`
              : `M ${ax} ${ay} L ${bx} ${by}`;
            return (
              <path
                key={i}
                d={path}
                fill="none"
                stroke="var(--line)"
                strokeWidth={1.4}
              />
            );
          })}

          {/* Nodes */}
          {layout.nodes.map((n) => {
            const c = KIND_COLOR[n.kind];
            return (
              <g key={n.id} transform={`translate(${n.x - NODE_W / 2} ${n.y - NODE_H / 2})`}>
                <rect
                  width={NODE_W}
                  height={NODE_H}
                  rx={4}
                  ry={4}
                  fill={c.fill}
                  stroke={c.stroke}
                  strokeWidth={1.4}
                />
                <text x={NODE_W / 2} y={n.meta ? 22 : 32} textAnchor="middle" fill={c.text} fontSize={13} fontWeight={600}>
                  {truncate(n.label, 28)}
                </text>
                {n.meta && (
                  <text x={NODE_W / 2} y={40} textAnchor="middle" fill="var(--muted)" fontSize={10}>
                    {truncate(n.meta, 36)}
                  </text>
                )}
                <title>{`${n.label}${n.meta ? "\n" + n.meta : ""}`}</title>
              </g>
            );
          })}
        </g>
      </svg>
    </div>
  );
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}
