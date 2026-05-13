import Link from "next/link";
import { getLayerTree, getFolderTree, getWorkflowGraph, layoutTree } from "@/lib/graph-data";
import SvgTree from "@/components/SvgTree";
import SvgWorkflow from "@/components/SvgWorkflow";
import FolderList from "@/components/FolderList";
import { MemoryTabs } from "@/components/MemoryTabs";

export const dynamic = "force-dynamic";

type View = "layers" | "folder" | "workflow";

type PageProps = { searchParams: Promise<{ view?: string }> };

export default async function GraphPage({ searchParams }: PageProps) {
  const { view: viewParam } = await searchParams;
  const view: View =
    viewParam === "folder" ? "folder" : viewParam === "workflow" ? "workflow" : "layers";

  return (
    <div className="container page">
      <MemoryTabs />
      <header className="page-head">
        <div className="page-head-left">
          <div className="page-crumb">
            <Link href="/queue">acme</Link>
            <span className="sep">/</span>
            <Link href="/memory">memory</Link>
            <span className="sep">/</span>
            <span className="current">graph</span>
          </div>
          <h1 className="page-title">Structure &amp; workflow</h1>
          <p className="page-blurb">
            Three views of how BBC is wired. Hover any node for its meta line. SVG only — no graph
            library; tree positions are computed server-side.
          </p>
        </div>
      </header>

      <div className="tabs" style={{ marginBottom: 16 }}>
        <Link href="/graph?view=layers" className={tabClass(view === "layers")}>Layer hierarchy</Link>
        <Link href="/graph?view=folder" className={tabClass(view === "folder")}>Folder tree</Link>
        <Link href="/graph?view=workflow" className={tabClass(view === "workflow")}>Queue workflow</Link>
      </div>

      {view === "layers" && <LayersView />}
      {view === "folder" && <FolderView />}
      {view === "workflow" && <WorkflowView />}

      <h2 style={{ marginTop: 32 }}>Legend</h2>
      <div className="card legend">
        <span className="legend-pill" style={{ borderColor: "var(--ok)", color: "var(--ok)" }}>Main</span>
        <span className="legend-pill" style={{ borderColor: "var(--warn)", color: "var(--warn)" }}>Manager</span>
        <span className="legend-pill" style={{ borderColor: "var(--accent)", color: "var(--accent)" }}>Distribution leaf · action</span>
        <span className="legend-pill" style={{ borderColor: "var(--line)", color: "var(--fg)" }}>Agent · folder · artifact</span>
        <span className="legend-pill" style={{ borderColor: "var(--muted)", color: "var(--muted)" }}>External pinned skill</span>
      </div>
    </div>
  );
}

function tabClass(active: boolean) {
  return active ? "tab active" : "tab";
}

async function LayersView() {
  const tree = await getLayerTree();
  const layout = layoutTree(tree);
  return (
    <div className="card">
      <p className="muted" style={{ fontSize: 12, marginBottom: 8 }}>
        Main → Manager → leaves. Each leaf&apos;s meta shows agent and pinned-skill counts;
        for the actual list see <Link href="/settings/skills">/settings/skills</Link>.
      </p>
      <SvgTree layout={layout} />
    </div>
  );
}

async function FolderView() {
  const tree = await getFolderTree(4);
  return (
    <div className="card">
      <p className="muted" style={{ fontSize: 12, marginBottom: 8 }}>
        Top 4 levels of <code>bbc/</code>. Hidden directories shown only if they&apos;re first-class
        (<code>.planning</code>, <code>.claude</code>); <code>node_modules</code>, <code>.git</code>,
        <code>_resolved</code>, <code>_accepted</code>, <code>_rejected</code>, <code>.test-archive</code> excluded.
        Number badges show subdir counts.
      </p>
      <FolderList root={tree} />
    </div>
  );
}

function WorkflowView() {
  const graph = getWorkflowGraph();
  return (
    <div className="card">
      <p className="muted" style={{ fontSize: 12, marginBottom: 8 }}>
        How a proposal travels. Leaf observes → <code>propose.sh</code> → queue file → Manager review →
        Main accept → memory updated + log appended + proposal archived.
      </p>
      <SvgWorkflow graph={graph} />
    </div>
  );
}
