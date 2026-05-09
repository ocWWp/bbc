import fs from "node:fs/promises";
import path from "node:path";
import { bbcRepoRoot } from "./bbc-paths";
import { listLeafResources } from "./read-leaf-resources";

/**
 * Tree primitives — a node has a label, a kind (drives color), optional meta line,
 * and optional children. Layout is computed in this file and emitted as
 * absolute-positioned `LaidOutNode` arrays so the SVG renderer is dumb.
 */

export type TreeKind =
  | "layer-main"
  | "layer-manager"
  | "layer-leaf"
  | "agent"
  | "external-skill"
  | "bbc-skill"
  | "folder"
  | "action"
  | "artifact";

export type TreeNode = {
  id: string;
  label: string;
  kind: TreeKind;
  meta?: string;
  children?: TreeNode[];
};

export type LaidOutNode = {
  id: string;
  label: string;
  kind: TreeKind;
  meta?: string;
  x: number; // center
  y: number; // center
};

export type Layout = {
  nodes: LaidOutNode[];
  edges: { from: string; to: string }[];
  width: number;
  height: number;
};

const NODE_W = 220;
const NODE_H = 56;
const X_GAP = 18;
const Y_GAP = 70;

/** Two-pass tree layout: bottom-up width sums, top-down x assignment. */
export function layoutTree(root: TreeNode): Layout {
  type WN = { node: TreeNode; width: number; children: WN[] };
  function widthPass(n: TreeNode): WN {
    const children = (n.children ?? []).map(widthPass);
    const childrenWidth = children.reduce((s, c, i) => s + c.width + (i ? X_GAP : 0), 0);
    const width = Math.max(NODE_W, childrenWidth);
    return { node: n, width, children };
  }
  const nodes: LaidOutNode[] = [];
  const edges: { from: string; to: string }[] = [];
  let maxDepth = 0;
  function place(wn: WN, depth: number, leftX: number) {
    if (depth > maxDepth) maxDepth = depth;
    let cursor = leftX;
    for (const c of wn.children) {
      place(c, depth + 1, cursor);
      cursor += c.width + X_GAP;
      edges.push({ from: wn.node.id, to: c.node.id });
    }
    nodes.push({
      id: wn.node.id,
      label: wn.node.label,
      kind: wn.node.kind,
      meta: wn.node.meta,
      x: leftX + wn.width / 2,
      y: depth * (NODE_H + Y_GAP) + NODE_H / 2,
    });
  }
  const rootW = widthPass(root);
  place(rootW, 0, 0);
  return {
    nodes,
    edges,
    width: rootW.width,
    height: (maxDepth + 1) * (NODE_H + Y_GAP),
  };
}

/* ───────────── View 1: Layer hierarchy ───────────── */

/**
 * Trimmed: shows only Main → Manager → leaves. Leaf-local agents and pinned
 * skills are NOT inlined here — they bloat the bottom row and obscure the
 * structural shape. Each leaf's meta line surfaces counts; the /skills page
 * has the full breakdown.
 */
export async function getLayerTree(): Promise<TreeNode> {
  const leaves = await listLeafResources();
  return {
    id: "main",
    label: "Main",
    kind: "layer-main",
    meta: "principles · memory · library",
    children: [
      {
        id: "manager",
        label: "Manager",
        kind: "layer-manager",
        meta: "rules · queue review · coordination",
        children: leaves.map((lr) => ({
          id: `leaf:${lr.leaf}`,
          label: lr.leaf,
          kind: "layer-leaf",
          meta: lr.shadowed_repo_present
            ? `${lr.agents.length} agents · ${lr.pinned_skills.length} pinned`
            : "(stub)",
        })),
      },
    ],
  };
}

/* ───────────── View 2: Folder tree ───────────── */

const FOLDER_DENYLIST = new Set([
  "node_modules",
  ".next",
  ".git",
  "_resolved",
  "_accepted",
  "_rejected",
  ".test-archive",
]);

const ROOT_DENYLIST = new Set(["next-env.d.ts"]);

export type FolderEntry = {
  name: string;
  /** Path relative to BBC repo root, with trailing slash; root entry is "" (empty). */
  rel_path: string;
  hasChildren: boolean;
  children: FolderEntry[];
};

export async function getFolderTree(maxDepth = 5): Promise<FolderEntry> {
  const root = bbcRepoRoot();
  return walkFolderEntry(root, root, "bbc/", "", maxDepth);
}

async function walkFolderEntry(
  rootAbs: string,
  absPath: string,
  label: string,
  relPath: string,
  depthRemaining: number,
): Promise<FolderEntry> {
  const node: FolderEntry = { name: label, rel_path: relPath, hasChildren: false, children: [] };
  if (depthRemaining <= 0) return node;
  let entries: string[];
  try {
    entries = await fs.readdir(absPath);
  } catch {
    return node;
  }
  entries = entries
    .filter((e) => !e.startsWith(".") || e === ".planning" || e === ".claude")
    .filter((e) => !FOLDER_DENYLIST.has(e) && !ROOT_DENYLIST.has(e))
    .sort();

  for (const e of entries) {
    const full = path.join(absPath, e);
    let isDir = false;
    try {
      isDir = (await fs.stat(full)).isDirectory();
    } catch {
      continue;
    }
    if (!isDir) continue;
    const childRel = path.relative(rootAbs, full);
    node.children.push(await walkFolderEntry(rootAbs, full, e, childRel, depthRemaining - 1));
  }
  node.hasChildren = node.children.length > 0;
  return node;
}

/* ───────────── View 3: Workflow (queue lifecycle) ───────────── */

export type WorkflowGraph = {
  nodes: LaidOutNode[];
  edges: { from: string; to: string; label?: string }[];
  width: number;
  height: number;
};

/**
 * Hand-positioned because it's small and conceptual. Three columns:
 *   col 0 (x≈140): leaf side (proposes, sees provenance)
 *   col 1 (x≈430): queue side (the artifact that travels)
 *   col 2 (x≈720): main/manager side (reviews + accepts)
 */
export function getWorkflowGraph(): WorkflowGraph {
  const nodes: LaidOutNode[] = [
    { id: "leaf", label: "Leaf observes", kind: "layer-leaf", meta: "fact / rule change", x: 140, y: 80 },
    { id: "propose", label: "propose.sh", kind: "action", meta: "/bbc:propose", x: 140, y: 200 },
    { id: "queued", label: "queue/<id>.md", kind: "artifact", meta: "status: pending", x: 430, y: 200 },
    { id: "manager", label: "Manager review", kind: "layer-manager", meta: "/bbc:review", x: 720, y: 200 },
    { id: "annotated", label: "+ manager_review", kind: "artifact", meta: "verdict, cross_leaf, promotion", x: 430, y: 320 },
    { id: "main", label: "Main accept", kind: "layer-main", meta: "/bbc:accept", x: 720, y: 440 },
    { id: "accept", label: "accept.sh", kind: "action", meta: "patch + frontmatter + archive", x: 140, y: 440 },
    { id: "applied", label: "memory/* updated", kind: "artifact", meta: "+ provenance: [<id>]", x: 430, y: 440 },
    { id: "archived", label: "queue/_accepted/", kind: "artifact", meta: "audit trail (immutable)", x: 720, y: 560 },
    { id: "log", label: "_log/operations.jsonl", kind: "artifact", meta: "v++; LKG advances", x: 430, y: 560 },
  ];
  const edges = [
    { from: "leaf", to: "propose" },
    { from: "propose", to: "queued", label: "writes" },
    { from: "queued", to: "manager", label: "triages" },
    { from: "manager", to: "annotated", label: "appends" },
    { from: "annotated", to: "main", label: "if approved" },
    { from: "main", to: "accept" },
    { from: "accept", to: "applied", label: "diff" },
    { from: "accept", to: "archived", label: "moves" },
    { from: "accept", to: "log", label: "emits" },
  ];
  return { nodes, edges, width: 900, height: 660 };
}
