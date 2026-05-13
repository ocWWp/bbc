"use client";

import React, { useRef, useState } from "react";
import type { SourceItem } from "./source-types";
import { SeedDemoBrainButton } from "./seed-demo-button";
import { BrainView } from "@/components/memory/BrainView";

const MIN = 80;
const MAX = 8000;

const SUPERTAG_TALLY: ReadonlyArray<{ key: string; n: number }> = [
  { key: "voice", n: 0 },
  { key: "decision", n: 0 },
  { key: "vendor", n: 0 },
  { key: "team", n: 0 },
  { key: "product", n: 0 },
  { key: "glossary", n: 0 },
  { key: "skill", n: 0 },
  { key: "source_artifact", n: 0 },
  { key: "note", n: 0 },
];

const SAMPLE_MEMORIES = [
  {
    tag: "decision",
    id: "mem_???_01",
    body: <><strong>Announce on May 5 · 8am ET.</strong> Lead with the wedge, not the dollar amount.</>,
    fields: [
      ["context", "Seed-round call · investor preference"],
      ["consequence", "Avoid $-amount in the headline"],
    ],
  },
  {
    tag: "voice",
    id: "mem_???_02",
    body: "Lowercase. Matter-of-fact. Say what we built and what it does.",
    fields: [
      ["do", <span key="d"><em>&quot;open-source&quot;</em>, <em>&quot;typed memory&quot;</em></span>],
      ["don't", <span key="dt"><em>&quot;thrilled&quot;</em>, <em>&quot;leverage&quot;</em></span>],
    ],
  },
  {
    tag: "team",
    id: "mem_???_03",
    body: <><strong>Priya Sridhar</strong> — CTO, IST timezone, owns infra.</>,
    fields: [
      ["role", "internal · cto"],
      ["tz", "asia/kolkata"],
    ],
  },
] as const;

type Mode = "paste" | "drop" | "url";

type Props = {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  error: string | null;
  sources: SourceItem[];
  onAddUrl: (url: string) => Promise<{ ok: true } | { ok: false; error: string }>;
  onAddFile: (file: File) => Promise<{ ok: true } | { ok: false; error: string }>;
  onRemoveSource: (sourceId: string) => void;
  busy?: boolean;
  /** The actor's tenant slug, used to personalize the dump-phase headline. */
  tenantSlug?: string;
};

export function DumpStep({
  value,
  onChange,
  onSubmit,
  error,
  sources,
  onAddUrl,
  onAddFile,
  onRemoveSource,
  busy,
  tenantSlug,
}: Props) {
  const [mode, setMode] = useState<Mode>("paste");
  const [urlInput, setUrlInput] = useState("");
  const [urlBusy, setUrlBusy] = useState(false);
  const [urlError, setUrlError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const totalChars = value.length + sources.reduce((acc, s) => acc + s.rawText.length, 0);
  const enough = totalChars >= MIN;
  const tooMuch = value.length > MAX;
  const estimate = Math.max(0, Math.round(totalChars / 700));

  async function handleUrl(e: React.FormEvent) {
    e.preventDefault();
    const url = urlInput.trim();
    if (!url) return;
    setUrlBusy(true);
    setUrlError(null);
    const full = url.startsWith("http") ? url : `https://${url}`;
    const res = await onAddUrl(full);
    setUrlBusy(false);
    if (!res.ok) {
      setUrlError(res.error);
      return;
    }
    setUrlInput("");
  }

  async function handleFile(file: File) {
    const res = await onAddFile(file);
    if (!res.ok) setUrlError(res.error);
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) void handleFile(file);
  }

  return (
    <div className="dump">
      {/* Left: input */}
      <section>
        <div className="dump-eyebrow">
          <span className="dot" />
          <span>step 01 · brain dump</span>
        </div>
        <h1 className="dump-title">
          {tenantSlug ? `${tenantSlug}'s brain is ` : "your brain is "}
          <span className="serif">empty</span>.
        </h1>
        <p className="dump-blurb">
          paste anything that describes your team, voice, decisions, or product —
          a slack thread, a readme, a doc, raw notes. we&apos;ll structure it into typed
          memory you can review before anything is saved.
        </p>

        <div className="dump-modes" role="tablist">
          <button
            type="button"
            className={mode === "paste" ? "is-active" : ""}
            onClick={() => setMode("paste")}
          >
            <span>paste</span>
            <span className="kbd">⌘V</span>
          </button>
          <button
            type="button"
            className={mode === "drop" ? "is-active" : ""}
            onClick={() => setMode("drop")}
          >
            <span>drop a file</span>
          </button>
          <button
            type="button"
            className={mode === "url" ? "is-active" : ""}
            onClick={() => setMode("url")}
          >
            <span>paste a url</span>
          </button>
        </div>

        <div className="dump-input">
          {mode === "paste" && (
            <>
              <textarea
                className="dump-area"
                value={value}
                onChange={(e) => onChange(e.target.value)}
                placeholder="we're a developer-tools startup. our voice is direct and lowercase — we never say 'leverage' or 'synergy'. the team is sarah (pm), alex (eng), mei (design). we picked supabase because of row-level security. competitors are mem0 and letta..."
                disabled={busy}
              />
              <div className="dump-meta">
                <span>{value.length.toLocaleString()} chars · {sources.length === 0 ? "1 source" : `${sources.length + (value ? 1 : 0)} sources`}</span>
                {enough && !tooMuch && (
                  <span className="est">≈ {estimate || 1} memory items</span>
                )}
                {tooMuch && <span style={{ color: "var(--err)" }}>too long · {MAX.toLocaleString()} max</span>}
              </div>
            </>
          )}

          {mode === "drop" && (
            <div
              className={`dump-drop ${dragOver ? "is-drag" : ""}`}
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={onDrop}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".md,.txt,.json,.csv,.html,text/markdown,text/plain,application/json,text/csv,text/html"
                style={{ display: "none" }}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void handleFile(f);
                }}
              />
              <div className="icon">
                <svg viewBox="0 0 22 22" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M11 14V4" /><polyline points="6.5,8.5 11,4 15.5,8.5" />
                  <path d="M4 16v2a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-2" />
                </svg>
              </div>
              <div className="h">drop a file here, or click to browse</div>
              <div className="s">we read text and frontmatter, never images of text.</div>
              <div className="types">
                <span>.md</span><span>.txt</span><span>.json</span>
                <span>.csv</span><span>.html</span><span>≤ 2 mb</span>
              </div>
            </div>
          )}

          {mode === "url" && (
            <>
              <form onSubmit={handleUrl}>
                <div className="dump-url">
                  <span className="prefix">https://</span>
                  <input
                    value={urlInput}
                    onChange={(e) => setUrlInput(e.target.value.replace(/^https?:\/\//, ""))}
                    placeholder="github.com/acme/handbook/blob/main/voice.md"
                    autoFocus
                  />
                  <button
                    type="submit"
                    disabled={!urlInput || urlBusy}
                    className="btn-go"
                    style={{ height: 32, padding: "0 12px", fontSize: 12 }}
                  >
                    {urlBusy ? "fetching…" : "fetch"}
                  </button>
                </div>
              </form>
              <div style={{ padding: "40px 20px", textAlign: "center", fontFamily: "var(--font-geist-mono), monospace", fontSize: 12, color: "var(--paper-muted)" }}>
                we fetch the raw text on extract — no rendering, no js execution.
              </div>
            </>
          )}
        </div>

        {sources.length > 0 && (
          <div className="dump-sources">
            {sources.map((s) => (
              <span key={s.sourceId} className="dump-source-chip">
                <span className="kind">{s.kind}</span>
                <span>{s.label}</span>
                <button
                  type="button"
                  onClick={() => onRemoveSource(s.sourceId)}
                  aria-label="remove source"
                >×</button>
              </span>
            ))}
          </div>
        )}

        {(error || urlError) && (
          <div className="dump-error">{error || urlError}</div>
        )}

        <div className="dump-cta">
          <button
            type="button"
            className="btn-go"
            onClick={onSubmit}
            disabled={!enough || tooMuch || busy}
          >
            extract memories
            <svg viewBox="0 0 14 14" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <line x1="2.5" y1="7" x2="11.5" y2="7" />
              <polyline points="8,3.5 11.5,7 8,10.5" />
            </svg>
          </button>
          <SeedDemoBrainButton />
        </div>
      </section>

      {/* Right: preview */}
      <aside className="preview">
        <div className="preview-head">
          <span className="lab">
            <span className="arrow">↳</span>
            <span>preview of the brain you&apos;ll get</span>
          </span>
          <span className="ttl">
            bbc structures raw text into <em>nine supertags</em>, each a typed shape
            with required fields. nothing is saved until you review.
          </span>
        </div>

        <div className="brain-host is-dim">
          <span className="brain-host-label">
            <span className="dot" />
            <span>your brain · empty</span>
          </span>
          <div className="brain-embed">
            <BrainView nodes={[]} embedded />
          </div>
          <div className="brain-host-foot">
            <span className="l">0 / ∞ memories</span>
            <span>drag · scroll</span>
          </div>
        </div>

        <div className="tally">
          <div className="tally-head">
            <span>supertags · projected tally</span>
            <span className="total">9 types</span>
          </div>
          <div className="tally-grid">
            {SUPERTAG_TALLY.map(({ key, n }) => (
              <div className="tally-cell" key={key} style={{ ["--tag-color" as string]: `var(--t-${key})` }}>
                <span className="name"><span className="dot" />{key}</span>
                <span className="n">{n}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="samples">
          <div className="samples-head">example memories — your dump → this shape</div>
          {SAMPLE_MEMORIES.map((m) => (
            <article className="sample" key={m.id}>
              <div className="sample-head">
                <span
                  className="pill"
                  style={{
                    ["--tag-color" as string]: `var(--t-${m.tag})`,
                    background: "color-mix(in oklab, var(--tag-color), transparent 88%)",
                    color: "var(--tag-color)",
                    borderColor: "color-mix(in oklab, var(--tag-color), transparent 70%)",
                    fontSize: 10,
                    textTransform: "uppercase",
                    letterSpacing: "0.04em",
                  }}
                >
                  {m.tag}
                </span>
                <span className="id">{m.id}</span>
              </div>
              <div className="sample-body">{m.body}</div>
              <div className="sample-fields">
                {m.fields.map(([k, v], i) => (
                  <React.Fragment key={i}>
                    <span className="k">{k}</span>
                    <span className="v">{v}</span>
                  </React.Fragment>
                ))}
              </div>
            </article>
          ))}
        </div>
      </aside>
    </div>
  );
}
