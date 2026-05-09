import type { WorkflowGraph } from "@/lib/graph-data";

const NODE_W = 200;
const NODE_H = 56;

const KIND_COLOR: Record<string, { fill: string; stroke: string; text: string }> = {
  "layer-main":     { fill: "rgba(127,207,177,0.10)", stroke: "var(--ok)",     text: "var(--ok)" },
  "layer-manager":  { fill: "rgba(217,154,74,0.10)",  stroke: "var(--warn)",   text: "var(--warn)" },
  "layer-leaf":     { fill: "rgba(127,207,177,0.05)", stroke: "var(--accent)", text: "var(--accent)" },
  "action":         { fill: "rgba(127,207,177,0.10)", stroke: "var(--accent)", text: "var(--accent)" },
  "artifact":       { fill: "var(--card)",            stroke: "var(--line)",   text: "var(--fg)" },
};

export default function SvgWorkflow({ graph }: { graph: WorkflowGraph }) {
  const padding = 24;
  const width = graph.width + padding * 2;
  const height = graph.height + padding * 2;
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));

  return (
    <div className="svg-graph-wrap">
      <svg viewBox={`0 0 ${width} ${height}`} width="100%" preserveAspectRatio="xMinYMin meet">
        <defs>
          <marker id="arr" viewBox="0 -5 10 10" refX="10" refY="0" markerWidth="6" markerHeight="6" orient="auto">
            <path d="M0,-4L10,0L0,4" fill="var(--accent)" />
          </marker>
        </defs>
        <g transform={`translate(${padding} ${padding})`}>
          {graph.edges.map((e, i) => {
            const a = byId.get(e.from);
            const b = byId.get(e.to);
            if (!a || !b) return null;
            // Edge starts at the appropriate node edge based on direction.
            const dx = b.x - a.x;
            const dy = b.y - a.y;
            let ax = a.x, ay = a.y, bx = b.x, by = b.y;
            if (Math.abs(dx) > Math.abs(dy)) {
              ax += Math.sign(dx) * NODE_W / 2;
              bx -= Math.sign(dx) * NODE_W / 2;
            } else {
              ay += Math.sign(dy) * NODE_H / 2;
              by -= Math.sign(dy) * NODE_H / 2;
            }
            const midX = (ax + bx) / 2;
            const midY = (ay + by) / 2;
            return (
              <g key={i}>
                <path
                  d={`M ${ax} ${ay} L ${bx} ${by}`}
                  fill="none"
                  stroke="var(--accent)"
                  strokeOpacity={0.4}
                  strokeWidth={1.4}
                  markerEnd="url(#arr)"
                />
                {e.label && (
                  <text
                    x={midX}
                    y={midY - 6}
                    textAnchor="middle"
                    fill="var(--muted)"
                    fontSize={10}
                    style={{ paintOrder: "stroke", stroke: "var(--bg)", strokeWidth: 3 }}
                  >
                    {e.label}
                  </text>
                )}
              </g>
            );
          })}
          {graph.nodes.map((n) => {
            const c = KIND_COLOR[n.kind] ?? KIND_COLOR.artifact;
            return (
              <g key={n.id} transform={`translate(${n.x - NODE_W / 2} ${n.y - NODE_H / 2})`}>
                <rect width={NODE_W} height={NODE_H} rx={4} ry={4} fill={c.fill} stroke={c.stroke} strokeWidth={1.4} />
                <text x={NODE_W / 2} y={n.meta ? 22 : 32} textAnchor="middle" fill={c.text} fontSize={13} fontWeight={600}>
                  {n.label}
                </text>
                {n.meta && (
                  <text x={NODE_W / 2} y={40} textAnchor="middle" fill="var(--muted)" fontSize={10}>
                    {n.meta}
                  </text>
                )}
                <title>{`${n.label}\n${n.meta ?? ""}`}</title>
              </g>
            );
          })}
        </g>
      </svg>
    </div>
  );
}
