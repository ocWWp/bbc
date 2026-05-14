"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { SUPERTAGS, MEMORIES, type SupertagKey } from "./data";
import { TagIcon } from "./icons";
import { Tag } from "./Tag";
import { SafeInline } from "./safe-render";

/** Cortex-like warp applied to a unit-sphere point so the cloud reads as a brain, not a globe. */
function brainWarp(x: number, y: number, z: number) {
  const phi = Math.atan2(Math.hypot(x, z), y);
  const theta = Math.atan2(z, x);
  const gyri = 1 + 0.07 * Math.sin(7 * phi + 2 * Math.cos(3 * theta)) * Math.cos(5 * theta);
  let nx = x * 1.28 * gyri;
  let ny = y * 0.92 * gyri;
  let nz = z * 1.10 * gyri;
  const fissure = Math.exp(-Math.pow(nx * 5, 2)) * Math.max(0, ny + 0.25);
  ny -= fissure * 0.10;
  const cb = Math.exp(
    -(Math.pow((nz + 0.65) * 2.2, 2) + Math.pow((ny + 0.70) * 2.2, 2) + Math.pow(nx * 1.6, 2)),
  );
  nz -= cb * 0.22;
  ny -= cb * 0.10;
  const bs = Math.exp(-(Math.pow(nx * 6, 2) + Math.pow((nz + 0.5) * 5, 2))) * Math.max(0, -ny);
  ny -= bs * 0.08;
  return { x: nx, y: ny, z: nz };
}

type Pt = { x: number; y: number; z: number; tag: SupertagKey };

function buildBrainPoints(): { pts: Pt[]; neighbors: number[][] } {
  const hash = (i: number, j: number) => {
    const s = Math.sin(i * 12.9898 + j * 78.233) * 43758.5453;
    return s - Math.floor(s);
  };
  const golden = (1 + Math.sqrt(5)) / 2;
  const centers = SUPERTAGS.map((t, i) => {
    const u = (i + 0.5) / SUPERTAGS.length;
    const phi = Math.acos(1 - 2 * u);
    const theta = (2 * Math.PI * i) / golden;
    return {
      key: t.key,
      x: Math.sin(phi) * Math.cos(theta),
      y: Math.cos(phi),
      z: Math.sin(phi) * Math.sin(theta),
    };
  });
  const pts: Pt[] = [];
  const PER_TAG = 140;
  centers.forEach((c, ci) => {
    for (let k = 0; k < PER_TAG; k++) {
      const r = hash(ci * 500 + k, 1);
      const t = hash(ci * 500 + k, 2);
      const ang = Math.sqrt(r) * 0.68;
      const az = t * Math.PI * 2;
      const up = Math.abs(c.y) < 0.9 ? { x: 0, y: 1, z: 0 } : { x: 1, y: 0, z: 0 };
      let t1x = c.y * up.z - c.z * up.y;
      let t1y = c.z * up.x - c.x * up.z;
      let t1z = c.x * up.y - c.y * up.x;
      const m1 = Math.hypot(t1x, t1y, t1z) || 1;
      t1x /= m1; t1y /= m1; t1z /= m1;
      const t2x = c.y * t1z - c.z * t1y;
      const t2y = c.z * t1x - c.x * t1z;
      const t2z = c.x * t1y - c.y * t1x;
      const dx = Math.cos(az) * t1x + Math.sin(az) * t2x;
      const dy = Math.cos(az) * t1y + Math.sin(az) * t2y;
      const dz = Math.cos(az) * t1z + Math.sin(az) * t2z;
      const sA = Math.sin(ang), cA = Math.cos(ang);
      const sx = c.x * cA + dx * sA;
      const sy = c.y * cA + dy * sA;
      const sz = c.z * cA + dz * sA;
      const j = (hash(ci * 500 + k, 3) - 0.5) * 0.05;
      const w = brainWarp(sx * (1 + j), sy * (1 + j), sz * (1 + j));
      pts.push({ x: w.x, y: w.y, z: w.z, tag: c.key });
    }
  });
  return { pts, neighbors: pts.map(() => []) };
}

function hex2rgb(h: string): [number, number, number] {
  const s = h.replace("#", "").trim();
  const expanded = s.length === 3 ? s.split("").map((c) => c + c).join("") : s;
  const n = parseInt(expanded, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

type Projected = { i: number; sx: number; sy: number; rz: number; tag: SupertagKey; persp: number };

export function Brain3D({ embedded = false }: { embedded?: boolean }) {
  const graph = useMemo(buildBrainPoints, []);
  const { pts: points, neighbors } = graph;

  const [hovered, setHovered] = useState<SupertagKey | null>(null);
  const [hoverMem, setHoverMem] = useState<{ tag: SupertagKey; x: number; y: number; mem: typeof MEMORIES[number] | null } | null>(null);
  const [selected, setSelected] = useState<SupertagKey | null>(null);
  const active = selected || hovered;
  const activeRef = useRef<SupertagKey | null>(active);
  useEffect(() => { activeRef.current = active; }, [active]);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const projRef = useRef<Projected[]>([]);
  const dragRef = useRef({ active: false, lx: 0, ly: 0, moved: false });
  const angleRef = useRef({ y: -0.5, x: -0.18 });
  const zoomRef = useRef(1);
  const idleRef = useRef(0);
  const hoveredNodeRef = useRef<number | null>(null);

  const tagCount = useMemo(() => {
    const m: Partial<Record<SupertagKey, number>> = {};
    points.forEach((p) => { m[p.tag] = (m[p.tag] || 0) + 1; });
    return m;
  }, [points]);

  useEffect(() => {
    const cvs = canvasRef.current;
    if (!cvs) return;
    const ctx = cvs.getContext("2d");
    if (!ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let w = 0, h = 0;
    const resize = () => {
      w = wrapRef.current?.clientWidth || 600;
      h = wrapRef.current?.clientHeight || 520;
      cvs.width = w * dpr; cvs.height = h * dpr;
      cvs.style.width = w + "px"; cvs.style.height = h + "px";
    };
    resize();
    window.addEventListener("resize", resize);

    const cs = getComputedStyle(document.documentElement);
    const colors: Record<string, [number, number, number]> = {};
    SUPERTAGS.forEach((t) => {
      const v = cs.getPropertyValue("--t-" + t.key).trim();
      colors[t.key] = hex2rgb(v || "#888888");
    });
    const themeKey = document.documentElement.getAttribute("data-theme") || "light";
    const isDark = themeKey === "dark";
    const lineRGB = isDark ? "232,228,216" : "44,40,28";

    let raf = 0;
    let last = performance.now();
    const render = (now: number) => {
      const wrap = wrapRef.current;
      if (!wrap) { raf = requestAnimationFrame(render); return; }
      if (wrap.clientWidth !== w || wrap.clientHeight !== h) resize();
      const dt = Math.min(48, now - last); last = now;

      idleRef.current += dt;
      if (!dragRef.current.active && idleRef.current > 1500 && hoveredNodeRef.current == null) {
        angleRef.current.y += dt * 0.00012;
      }

      const aY = angleRef.current.y;
      const aX = angleRef.current.x;
      const ca = Math.cos(aY), sa = Math.sin(aY);
      const cT = Math.cos(aX), sT = Math.sin(aX);

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      const cx = w / 2, cy = h / 2;
      const scale = Math.min(w, h) * 0.30 * zoomRef.current;
      const focal = 4.2;
      const proj: Projected[] = new Array(points.length);
      for (let i = 0; i < points.length; i++) {
        const p = points[i];
        let rx = p.x * ca - p.z * sa;
        let rz = p.x * sa + p.z * ca;
        let ry = p.y;
        const ry2 = ry * cT - rz * sT;
        const rz2 = ry * sT + rz * cT;
        ry = ry2; rz = rz2;
        const persp = focal / (focal + rz);
        const sx = cx + rx * scale * persp;
        const sy = cy + ry * scale * persp;
        proj[i] = { i, sx, sy, rz, tag: p.tag, persp };
      }
      projRef.current = proj;

      const hov = hoveredNodeRef.current;
      const hi = new Set<number>();
      if (hov != null) {
        hi.add(hov);
        for (const n of neighbors[hov]) hi.add(n);
      }

      const projectVec = (vx: number, vy: number, vz: number) => {
        const rx = vx * ca - vz * sa;
        const rz = vx * sa + vz * ca;
        const ry = vy;
        const ry2 = ry * cT - rz * sT;
        const rz2 = ry * sT + rz * cT;
        const persp = focal / (focal + rz2);
        return { sx: cx + rx * scale * persp, sy: cy + ry2 * scale * persp, rz: rz2 };
      };

      const haloR = scale * 1.6;
      const hg = ctx.createRadialGradient(cx, cy, scale * 0.4, cx, cy, haloR);
      hg.addColorStop(0, isDark ? "rgba(255,240,210,0.05)" : "rgba(193,74,27,0.06)");
      hg.addColorStop(0.55, isDark ? "rgba(255,240,210,0.015)" : "rgba(193,74,27,0.018)");
      hg.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = hg;
      ctx.beginPath();
      ctx.arc(cx, cy, haloR, 0, Math.PI * 2);
      ctx.fill();

      const PIX = Math.max(2, Math.round(Math.min(w, h) / 180));
      const snap = (v: number) => Math.round(v / PIX) * PIX;
      const LAT_RINGS = 5;
      const LAT_SEGS = 90;
      const LON_MERIDIANS = 7;
      const LON_SEGS = 72;

      const projBrain = (vx: number, vy: number, vz: number) => {
        const wv = brainWarp(vx, vy, vz);
        return projectVec(wv.x, wv.y, wv.z);
      };
      const drawPixArc = (
        sample: { steps: number; at: (i: number) => { sx: number; sy: number; rz: number } },
        baseAlpha: number,
      ) => {
        const seen = new Set<string>();
        for (let si = 0; si <= sample.steps; si++) {
          const p = sample.at(si);
          const px = snap(p.sx), py = snap(p.sy);
          const key = px + "," + py;
          if (seen.has(key)) continue;
          seen.add(key);
          const front = Math.max(0, Math.min(1, (-p.rz + 1) / 2));
          const a = baseAlpha * (0.12 + Math.pow(front, 1.5) * 0.88);
          ctx.fillStyle = `rgba(${lineRGB},${a.toFixed(3)})`;
          ctx.fillRect(px, py, PIX, PIX);
        }
      };

      for (let li = 1; li < LAT_RINGS; li++) {
        const phi = (li / LAT_RINGS) * Math.PI;
        const ry = Math.cos(phi);
        const rr = Math.sin(phi);
        const eq = 1 - Math.abs(li / LAT_RINGS - 0.5) * 1.4;
        drawPixArc({
          steps: LAT_SEGS,
          at: (si: number) => {
            const a = (si / LAT_SEGS) * Math.PI * 2;
            return projBrain(rr * Math.cos(a), ry, rr * Math.sin(a));
          },
        }, 0.26 + eq * 0.08);
      }
      for (let mi = 0; mi < LON_MERIDIANS; mi++) {
        const theta = (mi / LON_MERIDIANS) * Math.PI * 2;
        const sT2 = Math.sin(theta), cT2 = Math.cos(theta);
        drawPixArc({
          steps: LON_SEGS,
          at: (si: number) => {
            const phi = (si / LON_SEGS) * Math.PI;
            const rr = Math.sin(phi);
            return projBrain(rr * cT2, Math.cos(phi), rr * sT2);
          },
        }, 0.22);
      }

      const act = activeRef.current;
      const nodeBuf = proj.slice().sort((p, q) => q.rz - p.rz);
      for (let i = 0; i < nodeBuf.length; i++) {
        const p = nodeBuf[i];
        const c = colors[p.tag] || [128, 128, 128];
        const r = c[0], g = c[1], b = c[2];
        const isAct = !act || p.tag === act;
        const isHov = hi.has(p.i);
        const depth = Math.max(0, Math.min(1, (-p.rz + 1) / 2));
        let sz: number, alpha: number;
        if (isHov) {
          sz = PIX * 3;
          alpha = 1;
        } else if (isAct) {
          sz = PIX * Math.round(1.4 + depth * 1.2);
          alpha = 0.55 + depth * 0.45;
        } else {
          sz = PIX * 1;
          alpha = 0.18 + depth * 0.32;
        }
        const px = snap(p.sx) - Math.floor(sz / 2);
        const py = snap(p.sy) - Math.floor(sz / 2);
        if ((isAct || isHov) && depth > 0.55) {
          const halo = sz + PIX * (isHov ? 4 : 2);
          ctx.fillStyle = `rgba(${r},${g},${b},${((isHov ? 0.18 : 0.10) * (depth - 0.4)).toFixed(3)})`;
          ctx.fillRect(px - PIX * (isHov ? 2 : 1), py - PIX * (isHov ? 2 : 1), halo, halo);
        }
        if (isHov) {
          ctx.fillStyle = `rgba(${r},${g},${b},0.55)`;
          const ringSz = sz + PIX * 4;
          const rx = snap(p.sx) - Math.floor(ringSz / 2);
          const ry2 = snap(p.sy) - Math.floor(ringSz / 2);
          ctx.fillRect(rx + PIX, ry2, ringSz - PIX * 2, PIX);
          ctx.fillRect(rx + PIX, ry2 + ringSz - PIX, ringSz - PIX * 2, PIX);
          ctx.fillRect(rx, ry2 + PIX, PIX, ringSz - PIX * 2);
          ctx.fillRect(rx + ringSz - PIX, ry2 + PIX, PIX, ringSz - PIX * 2);
        }
        ctx.fillStyle = `rgba(${r},${g},${b},${alpha.toFixed(3)})`;
        ctx.fillRect(px, py, sz, sz);
      }
      raf = requestAnimationFrame(render);
    };
    raf = requestAnimationFrame(render);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", resize); };
  }, [points, neighbors]);

  const onCanvasWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const factor = Math.exp(-e.deltaY * 0.0015);
    zoomRef.current = Math.max(0.6, Math.min(3.0, zoomRef.current * factor));
  };
  const onCanvasDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    dragRef.current = { active: true, lx: e.clientX, ly: e.clientY, moved: false };
    idleRef.current = 0;
  };
  const onCanvasMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const x = e.clientX - rect.left, y = e.clientY - rect.top;
    const d = dragRef.current;
    if (d.active) {
      const dx = e.clientX - d.lx;
      const dy = e.clientY - d.ly;
      if (Math.abs(dx) + Math.abs(dy) > 3) d.moved = true;
      angleRef.current.y += dx * 0.008;
      angleRef.current.x = Math.max(-1.1, Math.min(1.1, angleRef.current.x + dy * 0.006));
      d.lx = e.clientX; d.ly = e.clientY;
      idleRef.current = 0;
      return;
    }
    const proj = projRef.current;
    if (!proj || !proj.length) return;
    const RADIUS = 56;
    const cand: { p: Projected; dd: number }[] = [];
    for (let i = 0; i < proj.length; i++) {
      const p = proj[i];
      const dxp = p.sx - x, dyp = p.sy - y;
      const dd = Math.sqrt(dxp * dxp + dyp * dyp);
      if (dd < RADIUS) cand.push({ p, dd });
    }
    let best: Projected | null = null;
    if (cand.length) {
      const tagScore: Record<string, number> = {};
      for (const c of cand) {
        const wt = (1 / (c.dd + 6)) * (0.55 + c.p.persp * 0.45);
        tagScore[c.p.tag] = (tagScore[c.p.tag] || 0) + wt;
      }
      let winTag: SupertagKey | null = null;
      let winScore = -1;
      for (const k in tagScore) {
        if (tagScore[k] > winScore) { winScore = tagScore[k]; winTag = k as SupertagKey; }
      }
      let bestScore = Infinity;
      for (const c of cand) {
        if (c.p.tag !== winTag) continue;
        const score = c.dd - (c.p.persp - 0.5) * 18;
        if (score < bestScore) { bestScore = score; best = c.p; }
      }
    }
    if (best) {
      hoveredNodeRef.current = best.i;
      if (hovered !== best.tag) setHovered(best.tag);
      const pool = MEMORIES.filter((m) => m.tag === best!.tag);
      const mem = pool.length ? pool[best.i % pool.length] : null;
      setHoverMem({ tag: best.tag, x: best.sx, y: best.sy, mem });
    } else {
      hoveredNodeRef.current = null;
      if (hovered) setHovered(null);
      if (hoverMem) setHoverMem(null);
    }
  };
  const onCanvasUp = () => {
    if (dragRef.current.active) {
      dragRef.current.active = false;
      idleRef.current = 0;
    }
  };
  const onCanvasLeave = () => {
    dragRef.current.active = false;
    hoveredNodeRef.current = null;
    setHovered(null);
    setHoverMem(null);
  };
  const onCanvasClick = () => {
    if (dragRef.current.moved) { dragRef.current.moved = false; return; }
    if (hovered) setSelected(selected === hovered ? null : hovered);
  };

  const tagSamples = useMemo(() => {
    const out: Partial<Record<SupertagKey, typeof MEMORIES[number][]>> = {};
    SUPERTAGS.forEach((t) => { out[t.key] = MEMORIES.filter((m) => m.tag === t.key).slice(0, 3); });
    return out;
  }, []);
  const activeTagMeta = SUPERTAGS.find((t) => t.key === active);
  const activeSamples = active ? tagSamples[active] || [] : [];

  const stageJSX = (
    <div className={embedded ? "pxbrain-stage is-bare" : "pxbrain-stage"} ref={wrapRef}>
      <canvas
        ref={canvasRef}
        className="pxbrain-canvas"
        onMouseDown={onCanvasDown}
        onWheel={onCanvasWheel}
        onMouseMove={onCanvasMove}
        onMouseUp={onCanvasUp}
        onMouseLeave={onCanvasLeave}
        onClick={onCanvasClick}
        style={{ cursor: dragRef.current.active ? "grabbing" : hovered ? "pointer" : "grab" }}
      />
      {hoverMem && hoverMem.mem && (
        <div
          className="pxbrain-tip"
          style={{
            left: hoverMem.x,
            top: hoverMem.y,
            ["--tip-color" as string]: (SUPERTAGS.find((t) => t.key === hoverMem.tag) || { color: "" }).color,
          } as CSSProperties}
        >
          <div className="pxbrain-tip-head">
            <span className="pxbrain-tip-dot" />
            <span className="pxbrain-tip-tag">{hoverMem.tag}</span>
            <span className="pxbrain-tip-id">{hoverMem.mem.id}</span>
          </div>
          <div className="pxbrain-tip-body">
            <SafeInline html={hoverMem.mem.body} />
          </div>
        </div>
      )}
      <div className={embedded ? "pxbrain-legend is-inline" : "pxbrain-legend"}>
        {SUPERTAGS.map((t) => (
          <button
            key={t.key}
            className={"px-chip " + (active === t.key ? "is-on" : "")}
            style={{ ["--tag-color" as string]: t.color } as CSSProperties}
            onMouseEnter={() => setHovered(t.key)}
            onMouseLeave={() => setHovered((prev) => (prev === t.key ? null : prev))}
            onClick={() => setSelected(selected === t.key ? null : t.key)}
          >
            <span className="px-chip-icon"><TagIcon name={t.key} /></span>
            <span className="px-chip-name">{t.key}</span>
            <span className="px-chip-count">{tagCount[t.key] || 0}</span>
          </button>
        ))}
      </div>
    </div>
  );

  if (embedded) {
    return (
      <div className="brain-embed" id="brain-hero">
        {stageJSX}
      </div>
    );
  }

  return (
    <section className="section" id="brain">
      <div className="container">
        <div className="section-head">
          <div>
            <div className="section-eyebrow"><span>the brain</span></div>
            <h2 className="section-title">
              your context, <span className="serif">all lit up.</span>
            </h2>
          </div>
          <p className="section-blurb">
            each dot is a memory. each color a supertag. drag to rotate, hover any region to spotlight it; tap to lock the view.
          </p>
        </div>

        <div className="pxbrain">
          {stageJSX}

          <aside className={"pxbrain-card " + (active ? "is-open" : "")}>
            {!active && (
              <div className="pxbrain-empty">
                <div className="pxbrain-empty-eyebrow">9 supertags · 224 memories</div>
                <div className="pxbrain-empty-title">hover a region.</div>
                <p>
                  the brain is one Postgres row per memory, typed by supertag. queries are by-type — never by similarity. tap any color to peek inside.
                </p>
              </div>
            )}
            {active && activeTagMeta && (
              <>
                <header className="pxbrain-card-head">
                  <Tag name={active} size="lg" />
                  <span className="pxbrain-card-count">{activeTagMeta.count} memories</span>
                </header>
                <p className="pxbrain-card-desc">{activeTagMeta.desc}</p>
                <div className="pxbrain-samples">
                  {activeSamples.length === 0 && (
                    <div className="pxbrain-empty-row">no samples in this demo brain.</div>
                  )}
                  {activeSamples.map((m) => (
                    <div key={m.id} className="pxbrain-sample">
                      <div className="pxbrain-sample-id">{m.id}</div>
                      <div className="pxbrain-sample-body">
                        <SafeInline html={m.body} />
                      </div>
                      <div className="pxbrain-sample-meta">{m.source} · {m.date}</div>
                    </div>
                  ))}
                </div>
                <div className="pxbrain-card-foot mono">
                  <span>
                    brain.find(&#123; supertag:{" "}
                    <span style={{ color: activeTagMeta.color }}>&quot;{active}&quot;</span> &#125;)
                  </span>
                  {selected && <button className="px-close" onClick={() => setSelected(null)}>✕</button>}
                </div>
              </>
            )}
          </aside>
        </div>
      </div>
    </section>
  );
}
