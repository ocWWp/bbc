"use client";

// /gallery -- the template gallery, BBC's browse-first home screen. Search +
// department chips compose with AND; cards link into the owning studio.
// Visual design ported from the Claude Design "studio.html" bundle.

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { GalleryTemplate } from "@/lib/studio/gallery";
import { filterGallery } from "@/lib/studio/gallery-filter";
import type { StudioRole } from "@/lib/studio/template-id";
import type { PreviewKind } from "@/lib/studio/templates/types";
import { STUDIO_PRESENTATION, ROLE_ORDER } from "@/lib/studio/studio-presentation";

// Friendly output-type label per template kind -- the plain-language "what it
// produces" trust signal on each card.
const KIND_LABEL: Record<PreviewKind, string> = {
  x_post: "X post",
  x_thread: "X thread",
  threads_post: "Threads post",
  linkedin_post: "LinkedIn post",
  blog_draft: "Blog post",
  script: "Script",
  doc: "Document",
  plain: "Document",
};

type Props = { templates: GalleryTemplate[] };

export default function GalleryClient({ templates }: Props) {
  const [query, setQuery] = useState("");
  const [role, setRole] = useState<StudioRole | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // "/" focuses search from anywhere outside a text field.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      const tag = el?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el?.isContentEditable) {
        return;
      }
      e.preventDefault();
      searchRef.current?.focus();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  // Per-department counts, cross-listed: a template counts under every role in
  // `roles` (owning role + facets).
  const counts = useMemo(() => {
    const c: Record<string, number> = { all: templates.length };
    for (const r of ROLE_ORDER) c[r] = 0;
    for (const t of templates) for (const r of t.roles) c[r] = (c[r] ?? 0) + 1;
    return c;
  }, [templates]);

  const visible = useMemo(
    () => filterGallery(templates, { query, role: role ?? undefined }),
    [templates, query, role],
  );

  const filtering = query.trim().length > 0 || role !== null;

  return (
    <div className="container page" style={{ paddingBottom: 96 }}>
      <header className="page-head">
        <div className="page-head-left">
          <div className="page-crumb">
            <Link href="/queue">acme</Link>
            <span className="sep">/</span>
            <span className="current">gallery</span>
          </div>
          <h1 className="page-title">
            What can we <span className="serif">make</span> today?
          </h1>
          <p className="page-blurb">
            Pick a template. Each one drafts a real piece of work — grounded in your
            company memory, cited line by line, and reviewable before anything is
            saved or sent.
          </p>
        </div>
        <div className="page-actions">
          <Link href="/studio" className="btn btn-ghost">
            browse by studio
          </Link>
        </div>
      </header>

      {/* search */}
      <div className="gal-search">
        <span className="ic" aria-hidden>
          <SearchIcon />
        </span>
        <input
          ref={searchRef}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={`Search ${templates.length} templates — try 'board memo', 'job description', 'NDA'…`}
          aria-label="Search templates"
        />
        {query ? (
          <button
            type="button"
            className="clear"
            onClick={() => setQuery("")}
            aria-label="Clear search"
          >
            <XIcon />
          </button>
        ) : (
          <span className="kbd" aria-hidden>
            /
          </span>
        )}
      </div>

      {/* department chips */}
      <div className="gal-chips" role="group" aria-label="Filter by department">
        <button
          type="button"
          className={`gal-chip all ${role === null ? "is-on" : ""}`}
          aria-pressed={role === null}
          onClick={() => setRole(null)}
        >
          All
          <span className="ct">{counts.all}</span>
        </button>
        {ROLE_ORDER.map((r) => {
          const p = STUDIO_PRESENTATION[r];
          return (
            <button
              key={r}
              type="button"
              className={`gal-chip ${role === r ? "is-on" : ""}`}
              aria-pressed={role === r}
              onClick={() => setRole(role === r ? null : r)}
              style={{ ["--chip-color" as string]: p.tint }}
            >
              <span className="dot" aria-hidden />
              {p.label}
              <span className="ct">{counts[r] ?? 0}</span>
            </button>
          );
        })}
      </div>

      {/* result meta line — only while filtering, to keep first load calm */}
      {filtering ? (
        <div className="gal-result-line">
          <span>
            <span className="ink">{visible.length}</span> template
            {visible.length === 1 ? "" : "s"}
            {role !== null ? (
              <>
                {" "}
                in <span className="ink">{STUDIO_PRESENTATION[role].label}</span>
              </>
            ) : null}
            {query.trim() ? (
              <>
                {" "}
                matching &quot;<span className="ink">{query.trim()}</span>&quot;
              </>
            ) : null}
          </span>
          <button
            type="button"
            className="clear-link"
            onClick={() => {
              setQuery("");
              setRole(null);
            }}
          >
            clear filters
          </button>
        </div>
      ) : null}

      {/* grid OR empty */}
      {visible.length === 0 ? (
        <div className="gal-empty">
          <span className="e-eyebrow">no matches</span>
          <h3>
            No templates <span className="serif">match that</span>.
          </h3>
          <p>
            Try a different word, clear the{" "}
            {role !== null ? (
              <>
                <strong>{STUDIO_PRESENTATION[role].label}</strong> filter
              </>
            ) : (
              "search"
            )}
            , or browse all departments. New templates land here as BBC ships them.
          </p>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => {
              setQuery("");
              setRole(null);
            }}
          >
            clear filters
          </button>
        </div>
      ) : (
        <div className="gal-grid">
          {visible.map((t) => (
            <TemplateCard key={t.id} tpl={t} />
          ))}
        </div>
      )}
    </div>
  );
}

function TemplateCard({ tpl }: { tpl: GalleryTemplate }) {
  const primary = STUDIO_PRESENTATION[tpl.owningRole];
  const facets = tpl.roles.filter((r) => r !== tpl.owningRole);

  return (
    <Link
      href={`/studio/${tpl.owningRole}?template=${encodeURIComponent(tpl.id)}`}
      className="tpl-card"
      style={{ ["--role-color" as string]: primary.tint }}
    >
      <div className="glyph" aria-hidden>
        {primary.glyph}
      </div>

      <div className="out">
        <span className="pill">{KIND_LABEL[tpl.kind]}</span>
      </div>

      <h3 className="nm">{tpl.label}</h3>

      <p className="desc">{tpl.hint}</p>

      <div className="foot">
        <span className="dept" style={{ ["--dept-color" as string]: primary.tint }}>
          <span className="ddot" aria-hidden />
          {primary.label}
        </span>
        {facets.map((r) => (
          <Fragment key={r}>
            <span className="sep">·</span>
            <span
              className="dept"
              style={{ ["--dept-color" as string]: STUDIO_PRESENTATION[r].tint }}
            >
              <span className="ddot" aria-hidden />
              {STUDIO_PRESENTATION[r].label}
            </span>
          </Fragment>
        ))}
      </div>
    </Link>
  );
}

function SearchIcon() {
  return (
    <svg
      viewBox="0 0 14 14"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="6" cy="6" r="4" />
      <line x1="9" y1="9" x2="12" y2="12" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg
      viewBox="0 0 14 14"
      width="10"
      height="10"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
    >
      <line x1="3" y1="3" x2="11" y2="11" />
      <line x1="11" y1="3" x2="3" y2="11" />
    </svg>
  );
}
