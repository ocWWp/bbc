"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";

/**
 * 3D rotating brain view for /memory?view=brain.
 *
 * Ports the GraphView from the Claude Design bundle (page-memory.jsx). One
 * point per memory sits on the surface of a warped ellipsoid colored by its
 * supertag; a denser cortex point-cloud fills out the silhouette. Rotates on
 * its own, drag to take over, scroll to zoom.
 *
 * Pure SVG (no three.js / canvas) — the projection math fits in <40 lines and
 * stays under 1MB on the wire including the React runtime.
 */

type BrainNode = {
  id: string;
  title: string;
  tag: string;
};

type ProjPoint = {
  x: number;
  y: number;
  z: number;
  persp: number;
};

const SUPERTAGS_ORDER = [
  "voice",
  "decision",
  "vendor",
  "team",
  "product",
  "glossary",
  "skill",
  "source_artifact",
  "note",
] as const;

const EDGES: ReadonlyArray<readonly [number, number]> = [
  [0, 1], [1, 2], [1, 11], [3, 4], [5, 7], [6, 10], [10, 1], [2, 6], [11, 1],
];

function brainSurface(u: number, v: number, jitter = 0) {
  const cu = Math.cos(u);
  const su = Math.sin(u);
  const cv = Math.cos(v);
  const sv = Math.sin(v);
  let x = 1.35 * cv * cu;
  let y = 0.92 * sv;
  let z = 1.08 * cv * su;
  const bump =
    0.055 * Math.sin(u * 6.0) * Math.cos(v * 4.0) +
    0.035 * Math.sin(u * 3.0 + v * 5.0) +
    0.025 * Math.cos(u * 9.0 + v * 2.0);
  const f = 1 + bump + jitter;
  x *= f;
  y *= f;
  z *= f;
  const sulcus = Math.exp(-(x * x) / 0.02) * Math.max(0, sv) * 0.18;
  y -= sulcus;
  return { x, y, z };
}

export function BrainView({ nodes }: { nodes: BrainNode[] }) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ w: 900, h: 520 });
  const [rotY, setRotY] = useState(0.6);
  const [rotX, setRotX] = useState(-0.15);
  const [zoom, setZoom] = useState(1);
  const [hover, setHover] = useState<string | null>(null);
  const dragRef = useRef<{ x: number; y: number; rx: number; ry: number } | null>(null);
  const autoRef = useRef(true);

  // Anchored memory nodes — one per row, deterministic position by tag wedge.
  const anchors = useMemo(() => {
    const N = nodes.length || 1;
    return nodes.map((m, i) => {
      const tagIdx = Math.max(0, SUPERTAGS_ORDER.indexOf(m.tag as (typeof SUPERTAGS_ORDER)[number]));
      const u = (tagIdx / SUPERTAGS_ORDER.length) * Math.PI * 2 + ((i * 0.31) % 0.6) - 0.3;
      const v = ((i / N) - 0.5) * Math.PI * 0.85;
      const p = brainSurface(u, v, 0.03);
      return { ...m, ...p };
    });
  }, [nodes]);

  const cloud = useMemo(() => {
    const pts: Array<{ x: number; y: number; z: number; r: number }> = [];
    const N = 320;
    for (let i = 0; i < N; i++) {
      const t = (i + 0.5) / N;
      const v = Math.acos(1 - 2 * t) - Math.PI / 2;
      const u = (Math.PI * (1 + Math.sqrt(5)) * i) % (Math.PI * 2);
      const jitter = (Math.sin(i * 12.9898) * 43758.5453) % 1;
      const p = brainSurface(u, v, -0.04 + jitter * 0.02);
      pts.push({ ...p, r: 0.55 + Math.abs(jitter) * 0.6 });
    }
    return pts;
  }, []);

  useEffect(() => {
    if (!wrapRef.current) return;
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) {
        const cr = e.contentRect;
        setSize({ w: cr.width, h: Math.max(420, Math.min(640, cr.width * 0.55)) });
      }
    });
    ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    let raf: number;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      if (autoRef.current) setRotY((r) => r + dt * 0.18);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const project = useCallback(
    (p: { x: number; y: number; z: number }): ProjPoint => {
      const cY = Math.cos(rotY);
      const sY = Math.sin(rotY);
      const cX = Math.cos(rotX);
      const sX = Math.sin(rotX);
      const x = p.x * cY + p.z * sY;
      const z1 = -p.x * sY + p.z * cY;
      const y = p.y * cX - z1 * sX;
      const z = p.y * sX + z1 * cX;
      const base = Math.min(size.w, size.h) * 0.32 * zoom;
      const persp = 4 / (4 + z);
      return {
        x: size.w / 2 + x * base * persp,
        y: size.h / 2 + y * base * persp,
        z,
        persp,
      };
    },
    [rotX, rotY, zoom, size.w, size.h],
  );

  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    autoRef.current = false;
    dragRef.current = { x: e.clientX, y: e.clientY, rx: rotX, ry: rotY };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.x;
    const dy = e.clientY - dragRef.current.y;
    setRotY(dragRef.current.ry + dx * 0.008);
    setRotX(Math.max(-1.2, Math.min(1.2, dragRef.current.rx + dy * 0.008)));
  };
  const onPointerUp = () => {
    dragRef.current = null;
    setTimeout(() => {
      autoRef.current = true;
    }, 1800);
  };
  const onWheel = (e: React.WheelEvent<SVGSVGElement>) => {
    e.preventDefault();
    setZoom((z) => Math.max(0.6, Math.min(2.4, z - e.deltaY * 0.0012)));
  };

  const projCloud = cloud
    .map((p) => ({ ...p, proj: project(p) }))
    .sort((a, b) => a.proj.z - b.proj.z);
  const projAnchors = anchors.map((a) => ({ ...a, proj: project(a) }));
  const projAnchorsSorted = [...projAnchors].sort((a, b) => a.proj.z - b.proj.z);

  return (
    <div
      ref={wrapRef}
      style={{
        border: "1px solid var(--paper-rule)",
        borderRadius: 12,
        background: "var(--paper)",
        overflow: "hidden",
        position: "relative",
        minHeight: 520,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          padding: "12px 16px",
          borderBottom: "1px solid var(--paper-rule)",
          background: "var(--paper-bg-2)",
          fontFamily: "var(--font-geist-mono), monospace",
          fontSize: 11.5,
          color: "var(--paper-muted)",
        }}
      >
        <span>
          <strong style={{ color: "var(--paper-ink)", fontWeight: 500 }}>{anchors.length}</strong>{" "}
          nodes ·{" "}
          <strong style={{ color: "var(--paper-ink)", fontWeight: 500 }}>{EDGES.length}</strong>{" "}
          edges ·{" "}
          <strong style={{ color: "var(--paper-ink)", fontWeight: 500 }}>{cloud.length}</strong>{" "}
          cortex points
        </span>
        <span>drag to rotate · scroll to zoom · click node to open</span>
      </div>

      <svg
        width={size.w}
        height={size.h}
        viewBox={`0 0 ${size.w} ${size.h}`}
        style={{
          display: "block",
          cursor: dragRef.current ? "grabbing" : "grab",
          touchAction: "none",
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onWheel={onWheel}
      >
        <defs>
          <radialGradient id="brainHalo" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="var(--paper-accent)" stopOpacity="0.05" />
            <stop offset="70%" stopColor="var(--paper-accent)" stopOpacity="0" />
          </radialGradient>
        </defs>

        <circle
          cx={size.w / 2}
          cy={size.h / 2}
          r={Math.min(size.w, size.h) * 0.42 * zoom}
          fill="url(#brainHalo)"
        />

        {projCloud.map((p, i) => {
          const depth = (p.proj.z + 1.5) / 3;
          const op = 0.1 + 0.45 * Math.max(0, Math.min(1, depth));
          return (
            <circle
              key={i}
              cx={p.proj.x}
              cy={p.proj.y}
              r={p.r * p.proj.persp}
              fill="var(--paper-ink)"
              opacity={op}
            />
          );
        })}

        {EDGES.map(([a, b], i) => {
          const A = projAnchors[a];
          const B = projAnchors[b];
          if (!A || !B) return null;
          const zMid = (A.proj.z + B.proj.z) / 2;
          const depth = (zMid + 1.5) / 3;
          const op = 0.15 + 0.55 * Math.max(0, Math.min(1, depth));
          return (
            <line
              key={i}
              x1={A.proj.x}
              y1={A.proj.y}
              x2={B.proj.x}
              y2={B.proj.y}
              stroke="var(--paper-rule-2)"
              strokeWidth={0.8 + 0.6 * depth}
              opacity={op}
            />
          );
        })}

        {projAnchorsSorted.map((n) => {
          const depth = (n.proj.z + 1.5) / 3;
          const front = n.proj.z > -0.2;
          const op = 0.35 + 0.65 * Math.max(0, Math.min(1, depth));
          const r = (3.6 + 1.4 * depth) * n.proj.persp;
          const isHover = hover === n.id;
          return (
            <g
              key={n.id}
              transform={`translate(${n.proj.x} ${n.proj.y})`}
              style={{ cursor: "pointer" }}
              onPointerEnter={() => setHover(n.id)}
              onPointerLeave={() => setHover(null)}
              onClick={() => {
                window.location.href = `/memory/${n.id}`;
              }}
            >
              <circle r={r * 2.2} fill={`var(--t-${n.tag})`} opacity={0.1 * op} />
              <circle r={r} fill={`var(--t-${n.tag})`} opacity={op} />
              {front && (isHover || depth > 0.55) && (
                <text
                  x={r + 5}
                  y={3}
                  fontFamily="var(--font-geist-mono), monospace"
                  fontSize={10}
                  fill={isHover ? "var(--paper-ink)" : "var(--paper-muted)"}
                  opacity={op}
                >
                  {n.title.length > 26 ? n.title.slice(0, 26) + "…" : n.title}
                </text>
              )}
            </g>
          );
        })}
      </svg>

      <div
        style={{
          position: "absolute",
          left: 14,
          bottom: 14,
          display: "flex",
          flexWrap: "wrap",
          gap: 5,
          maxWidth: "calc(100% - 28px)",
        }}
      >
        {SUPERTAGS_ORDER.map((t) => (
          <Link
            key={t}
            href={`/memory?type=${t}`}
            className="px-chip"
            style={{
              ["--tag-color" as string]: `var(--t-${t})`,
              background: "color-mix(in oklab, var(--paper), transparent 12%)",
              backdropFilter: "blur(8px)",
              textDecoration: "none",
            }}
          >
            <span className="px-chip-dot" />
            {t}
          </Link>
        ))}
      </div>

      <div
        style={{
          position: "absolute",
          right: 14,
          bottom: 14,
          fontFamily: "var(--font-geist-mono), monospace",
          fontSize: 10.5,
          color: "var(--paper-muted)",
          background: "color-mix(in oklab, var(--paper), transparent 12%)",
          backdropFilter: "blur(8px)",
          padding: "4px 8px",
          borderRadius: 999,
          border: "1px solid var(--paper-rule)",
        }}
      >
        rotY {(rotY % (Math.PI * 2)).toFixed(2)} · rotX {rotX.toFixed(2)} · zoom{" "}
        {zoom.toFixed(2)}×
      </div>
    </div>
  );
}
