"use client";

import { useState } from "react";
import type { FolderEntry } from "@/lib/graph-data";
import { annotationFor, DEFAULT_EXPANDED } from "@/lib/folder-annotations";

/**
 * Interactive directory tree. Each non-empty folder has a chevron; clicking
 * the row toggles its children. Annotations come from FOLDER_ANNOTATIONS and
 * appear in muted text after the folder name.
 *
 * Tree-branch characters render correctly because we re-derive them per row
 * from the parent's "is-last-child" trail.
 */
export default function FolderList({ root }: { root: FolderEntry }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set(DEFAULT_EXPANDED));

  const toggle = (relPath: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(relPath)) next.delete(relPath);
      else next.add(relPath);
      return next;
    });
  };

  const expandAll = () => {
    const all = new Set<string>();
    function collect(e: FolderEntry) {
      if (e.hasChildren) all.add(e.rel_path);
      e.children.forEach(collect);
    }
    collect(root);
    setExpanded(all);
  };
  const collapseAll = () => setExpanded(new Set([""]));

  return (
    <>
      <div className="folder-controls">
        <button className="btn" onClick={expandAll}>expand all</button>
        <button className="btn" onClick={collapseAll}>collapse all</button>
      </div>
      <div className="folder-tree">
        <Entry
          entry={root}
          ancestorIsLast={[]}
          isLast={true}
          isRoot={true}
          expanded={expanded}
          onToggle={toggle}
        />
      </div>
    </>
  );
}

function Entry({
  entry,
  ancestorIsLast,
  isLast,
  isRoot,
  expanded,
  onToggle,
}: {
  entry: FolderEntry;
  ancestorIsLast: boolean[];
  isLast: boolean;
  isRoot: boolean;
  expanded: Set<string>;
  onToggle: (rel: string) => void;
}) {
  const isOpen = expanded.has(entry.rel_path);
  const annotation = annotationFor(entry.rel_path);

  // Build the prefix from ancestor "is-last" flags.
  const prefix = ancestorIsLast.map((a) => (a ? "    " : "│   ")).join("");
  const branch = isRoot ? "" : isLast ? "└── " : "├── ";
  const chevron = entry.hasChildren ? (isOpen ? "▾" : "▸") : " ";

  return (
    <>
      <div
        className={`folder-row${entry.hasChildren ? " clickable" : ""}`}
        onClick={() => entry.hasChildren && onToggle(entry.rel_path)}
        role={entry.hasChildren ? "button" : undefined}
        aria-expanded={entry.hasChildren ? isOpen : undefined}
      >
        <span className="folder-branch">{prefix}{branch}</span>
        <span className="folder-chevron">{chevron}</span>
        <span className="folder-name">
          {entry.name}
          {entry.children.length > 0 && "/"}
        </span>
        {entry.hasChildren && (
          <span className="folder-meta">{entry.children.length}</span>
        )}
        {annotation && (
          <span className="folder-annotation"># {annotation}</span>
        )}
      </div>
      {isOpen &&
        entry.children.map((child, i) => (
          <Entry
            key={child.rel_path}
            entry={child}
            ancestorIsLast={isRoot ? ancestorIsLast : [...ancestorIsLast, isLast]}
            isLast={i === entry.children.length - 1}
            isRoot={false}
            expanded={expanded}
            onToggle={onToggle}
          />
        ))}
    </>
  );
}
