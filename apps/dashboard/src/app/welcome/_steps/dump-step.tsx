"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { SourceItem } from "./source-types";
import { SeedDemoBrainButton } from "./seed-demo-button";

const PLACEHOLDERS = [
  "We're a developer-tools startup helping early-stage founders ship product faster. Our voice is direct and lowercase — we never use the word 'leverage' or 'synergy'. The team is Sarah (PM), Alex (eng), Mei (design)...",
  "Our product is a memory layer for AI agents. We picked Supabase for the database because of Row-Level Security. Competitors are Mem0 and Letta. Founders are our target user, not enterprises...",
  "We sound casual and curious. The team uses Slack, GitHub, and Linear. Our key decision last month: stop pretending we'll ever support self-hosted on-prem — we're SaaS-only.",
];

const MIN = 80;
const SWEET = 700;
const MAX = 8000;

const EXAMPLE_BRAIN: { type: string; items: string[] }[] = [
  { type: "product", items: ["Memory layer for AI agents"] },
  { type: "voice", items: ["Lowercase, no jargon"] },
  { type: "team", items: ["Sarah · PM", "Alex · Eng"] },
  { type: "vendor", items: ["Supabase · Database"] },
  { type: "decision", items: ["SaaS-only, no on-prem"] },
];

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
}: Props) {
  const [idx, setIdx] = useState(0);
  const [urlPopoverOpen, setUrlPopoverOpen] = useState(false);
  const [urlInput, setUrlInput] = useState("");
  const [urlBusy, setUrlBusy] = useState(false);
  const [urlError, setUrlError] = useState<string | null>(null);
  const [fileBusy, setFileBusy] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [detectedUrl, setDetectedUrl] = useState<{ url: string; range: [number, number] } | null>(null);
  const [detectBusy, setDetectBusy] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    ref.current?.focus();
  }, []);

  useEffect(() => {
    if (value) return;
    const t = setInterval(() => setIdx((i) => (i + 1) % PLACEHOLDERS.length), 5500);
    return () => clearInterval(t);
  }, [value]);

  const len = value.length;
  const hasContent = len >= MIN || sources.length > 0;
  const canSubmit = hasContent && len <= MAX && !busy;
  const progress = Math.min(1, Math.max(len / SWEET, sources.length > 0 ? 1 : 0));

  async function handleUrlFetch() {
    const url = urlInput.trim();
    if (!url) {
      setUrlError("Paste a URL first.");
      return;
    }
    setUrlError(null);
    setUrlBusy(true);
    const res = await onAddUrl(url);
    setUrlBusy(false);
    if (res.ok) {
      setUrlInput("");
      setUrlPopoverOpen(false);
    } else {
      setUrlError(res.error);
    }
  }

  function handlePaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    const pasted = e.clipboardData.getData("text").trim();
    // Only react when the entire pasted blob is a single bare URL. Long
    // copy-pastes that happen to contain a URL stay as text (the user clearly
    // wanted prose, not a fetch).
    if (pasted.length < 8 || pasted.length > 500) return;
    if (!/^https?:\/\/\S+$/i.test(pasted)) return;
    if (/\s/.test(pasted)) return;
    // Capture where it will land so we can excise it later if user chooses Fetch.
    const target = e.currentTarget;
    const start = target.selectionStart;
    const end = start + pasted.length;
    // Defer so React's onChange has already applied the paste.
    setTimeout(() => setDetectedUrl({ url: pasted, range: [start, end] }), 0);
  }

  async function fetchDetectedUrl() {
    if (!detectedUrl) return;
    setDetectBusy(true);
    const res = await onAddUrl(detectedUrl.url);
    setDetectBusy(false);
    if (!res.ok) {
      // Surface in the same place as the popover error, then keep the chip
      // so the user can retry or dismiss.
      setUrlError(res.error);
      return;
    }
    // Excise the URL from the textarea (and the surrounding whitespace it
    // probably landed in).
    const [s, e] = detectedUrl.range;
    const before = value.slice(0, s);
    const after = value.slice(e);
    onChange((before + after).replace(/[ \t]{2,}/g, " ").replace(/\n{3,}/g, "\n\n").trim());
    setDetectedUrl(null);
  }

  async function handleFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    setFileError(null);
    setFileBusy(true);
    for (const file of Array.from(fileList)) {
      const res = await onAddFile(file);
      if (!res.ok) {
        setFileError(res.error);
        break;
      }
    }
    setFileBusy(false);
    if (fileRef.current) fileRef.current.value = "";
  }

  const submitLabel =
    sources.length > 0
      ? `Structure my brain + ${sources.length} source${sources.length === 1 ? "" : "s"}`
      : "Structure my brain";

  return (
    <section className="grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1fr)_18rem] lg:gap-12">
      <div className="space-y-7">
        <div className="space-y-3">
          <motion.h1
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: [0.2, 0, 0, 1] }}
            className="text-4xl font-semibold tracking-[-0.025em] text-foreground sm:text-[2.75rem] sm:leading-[1.05]"
          >
            Tell us about your product.
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.08, ease: [0.2, 0, 0, 1] }}
            className="max-w-xl text-[15px] leading-relaxed text-muted-foreground"
          >
            Voice, team, decisions, vendors — anything that should live in your shared brain. Don't overthink it.
          </motion.p>
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.16, ease: [0.2, 0, 0, 1] }}
          >
            <SeedDemoBrainButton />
          </motion.div>
        </div>

        {sources.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-wrap gap-2"
            aria-label="Attached sources"
          >
            {sources.map((s) => (
              <SourceChip key={s.sourceId} source={s} onRemove={() => onRemoveSource(s.sourceId)} />
            ))}
          </motion.div>
        )}

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.14, ease: [0.2, 0, 0, 1] }}
          className="relative group"
        >
          <div
            aria-hidden
            className="pointer-events-none absolute -inset-px rounded-xl bg-gradient-to-br from-brain-accent/0 via-brain-accent/0 to-brain-accent/0 opacity-0 transition-opacity duration-500 group-focus-within:from-brain-accent/15 group-focus-within:to-brain-accent/5 group-focus-within:opacity-100 blur-sm"
          />
          <textarea
            ref={ref}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onPaste={handlePaste}
            rows={11}
            className="relative w-full resize-none rounded-xl border border-border/80 bg-card/60 px-5 py-4 text-[15px] leading-relaxed shadow-[0_0_0_1px_rgba(0,0,0,0.04),0_2px_4px_-2px_rgba(0,0,0,0.08)] backdrop-blur-sm transition-all duration-300 placeholder:text-muted-foreground/50 focus:outline-none focus:border-brain-accent/40 focus:bg-card/80 focus:shadow-[0_0_0_1px_color-mix(in_oklch,var(--brain-accent)_30%,transparent),0_8px_28px_-12px_color-mix(in_oklch,var(--brain-accent)_25%,transparent)] dark:bg-card/40 dark:focus:bg-card/60"
            aria-label="Brain dump"
          />
          {!value && (
            <div className="pointer-events-none absolute inset-x-5 top-4 select-none">
              <AnimatePresence mode="wait">
                <motion.p
                  key={idx}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.45, ease: [0.2, 0, 0, 1] }}
                  className="text-[15px] leading-relaxed text-muted-foreground/70 dark:text-muted-foreground/60"
                >
                  {PLACEHOLDERS[idx]}
                </motion.p>
              </AnimatePresence>
            </div>
          )}
        </motion.div>

        {detectedUrl && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center justify-between gap-3 rounded-lg border border-brain-accent/30 bg-brain-accent/[0.04] px-3 py-2 text-xs"
          >
            <p className="min-w-0 flex-1 truncate text-foreground">
              <span className="text-muted-foreground">Looks like a URL — </span>
              fetch <span className="font-medium" title={detectedUrl.url}>{labelForDetectedUrl(detectedUrl.url)}</span> as a separate source?
            </p>
            <div className="flex shrink-0 items-center gap-1.5">
              <button
                type="button"
                onClick={() => setDetectedUrl(null)}
                className="rounded-md px-2 py-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                Keep as text
              </button>
              <button
                type="button"
                onClick={fetchDetectedUrl}
                disabled={detectBusy}
                className="rounded-md bg-brain-accent px-2.5 py-1 font-medium text-brain-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {detectBusy ? "Fetching…" : "Fetch"}
              </button>
            </div>
          </motion.div>
        )}

        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.2 }}
          className="grid grid-cols-1 gap-2 sm:grid-cols-3"
        >
          <label
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              handleFiles(e.dataTransfer.files);
            }}
            className={`group/tile relative flex cursor-pointer items-center gap-3 rounded-xl border bg-card/40 px-4 py-3 text-left transition-all duration-200 hover:bg-card/70 ${
              dragging
                ? "border-brain-accent/60 bg-brain-accent/5 shadow-[0_0_0_1px_color-mix(in_oklch,var(--brain-accent)_30%,transparent)]"
                : "border-border/70"
            }`}
          >
            <input
              ref={fileRef}
              type="file"
              accept=".md,.markdown,.txt"
              multiple
              className="sr-only"
              onChange={(e) => handleFiles(e.target.files)}
            />
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted/60 text-muted-foreground group-hover/tile:text-foreground transition-colors">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">Drop files</p>
              <p className="truncate text-[11px] text-muted-foreground">
                {fileBusy ? "Reading…" : ".md or .txt, up to 1 MB"}
              </p>
            </div>
          </label>

          <button
            type="button"
            onClick={() => setUrlPopoverOpen((o) => !o)}
            className="group/tile relative flex items-center gap-3 rounded-xl border border-border/70 bg-card/40 px-4 py-3 text-left transition-all duration-200 hover:bg-card/70"
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted/60 text-muted-foreground group-hover/tile:text-foreground transition-colors">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
              </svg>
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">Paste a URL</p>
              <p className="truncate text-[11px] text-muted-foreground">README, blog post, deck</p>
            </div>
          </button>

          <a
            href="/sources"
            className="group/tile relative flex items-center gap-3 rounded-xl border border-dashed border-border/60 bg-transparent px-4 py-3 text-left transition-all duration-200 hover:border-border/90 hover:bg-card/40"
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted/40 text-muted-foreground group-hover/tile:text-foreground transition-colors">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <circle cx="12" cy="12" r="9" />
                <line x1="12" y1="8" x2="12" y2="16" />
                <line x1="8" y1="12" x2="16" y2="12" />
              </svg>
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">More sources</p>
              <p className="truncate text-[11px] text-muted-foreground">GitHub, Notion, Linear · soon</p>
            </div>
          </a>
        </motion.div>

        {(fileError || urlError) && (
          <p className="text-xs text-rose-600 dark:text-rose-400">{fileError ?? urlError}</p>
        )}

        {urlPopoverOpen && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col gap-2 rounded-xl border border-border/70 bg-card/80 px-4 py-3 backdrop-blur-sm sm:flex-row sm:items-center"
          >
            <input
              type="url"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleUrlFetch(); } }}
              placeholder="https://acme.com/handbook"
              className="flex-1 rounded-lg border border-border/60 bg-background/70 px-3 py-1.5 text-sm focus:border-brain-accent/40 focus:outline-none"
              aria-label="URL to fetch"
              autoFocus
            />
            <button
              type="button"
              onClick={handleUrlFetch}
              disabled={urlBusy || !urlInput.trim()}
              className="rounded-lg bg-foreground px-3 py-1.5 text-sm font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {urlBusy ? "Fetching…" : "Fetch"}
            </button>
            <button
              type="button"
              onClick={() => { setUrlPopoverOpen(false); setUrlError(null); setUrlInput(""); }}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Cancel
            </button>
          </motion.div>
        )}

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3, delay: 0.26 }}
          className="flex items-center justify-between gap-4"
        >
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <div className="relative h-1 w-32 overflow-hidden rounded-full bg-muted">
              <motion.div
                initial={false}
                animate={{ width: `${progress * 100}%` }}
                transition={{ duration: 0.35, ease: [0.2, 0, 0, 1] }}
                className={canSubmit
                  ? "h-full bg-brain-accent shadow-[0_0_12px_color-mix(in_oklch,var(--brain-accent)_60%,transparent)]"
                  : "h-full bg-muted-foreground/40"}
              />
            </div>
            <span className="tabular-nums font-medium">
              <span className={canSubmit ? "text-foreground" : ""}>{len}</span>
              <span className="text-muted-foreground/60"> / {MAX}</span>
            </span>
            {len > 0 && len < MIN && sources.length === 0 && (
              <span className="text-muted-foreground/60">— need {MIN - len} more</span>
            )}
          </div>

          <button
            type="button"
            onClick={onSubmit}
            disabled={!canSubmit}
            className="group/btn relative inline-flex items-center gap-2 rounded-full bg-brain-accent px-5 py-2.5 text-sm font-medium text-brain-accent-foreground shadow-[0_2px_12px_-2px_color-mix(in_oklch,var(--brain-accent)_50%,transparent),0_0_32px_-12px_color-mix(in_oklch,var(--brain-accent)_70%,transparent)] transition-all duration-200 hover:shadow-[0_4px_20px_-2px_color-mix(in_oklch,var(--brain-accent)_60%,transparent),0_0_44px_-8px_color-mix(in_oklch,var(--brain-accent)_80%,transparent)] hover:-translate-y-[1px] active:translate-y-0 disabled:opacity-40 disabled:shadow-none disabled:cursor-not-allowed disabled:hover:translate-y-0"
          >
            {submitLabel}
            <span className="transition-transform duration-200 group-hover/btn:translate-x-0.5">→</span>
          </button>
        </motion.div>

        {error && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-300"
          >
            {error}
          </motion.div>
        )}
      </div>

      <SidebarPreview />
    </section>
  );
}

function labelForDetectedUrl(url: string): string {
  try {
    const u = new URL(url);
    const path = u.pathname.length > 1 ? u.pathname.replace(/\/$/, "") : "";
    return `${u.hostname}${path}`;
  } catch {
    return url.length > 40 ? `${url.slice(0, 40)}…` : url;
  }
}

function SourceChip({ source, onRemove }: { source: SourceItem; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-muted/60 py-1 pl-2 pr-1 text-xs text-foreground">
      <span className="font-mono uppercase tracking-wider text-[9px] text-muted-foreground">
        {source.kind}
      </span>
      <span className="max-w-[14rem] truncate" title={source.label}>
        {source.label}
      </span>
      {source.reused && (
        <span className="rounded-full bg-amber-100 px-1.5 text-[9px] text-amber-800 dark:bg-amber-950/60 dark:text-amber-300" title="Same content as a previous ingest">
          dup
        </span>
      )}
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${source.kind} source`}
        className="ml-0.5 inline-flex h-4 w-4 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-foreground"
      >
        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" aria-hidden>
          <line x1="6" y1="6" x2="18" y2="18" />
          <line x1="6" y1="18" x2="18" y2="6" />
        </svg>
      </button>
    </span>
  );
}

function SidebarPreview() {
  return (
    <motion.aside
      initial={{ opacity: 0, x: 8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.5, delay: 0.22, ease: [0.2, 0, 0, 1] }}
      className="hidden lg:block"
    >
      <div className="sticky top-10 space-y-4">
        <p className="px-1 text-[12px] leading-relaxed text-muted-foreground">
          BBC turns your dump into typed, queryable memory. Here's what a finished brain looks like:
        </p>

        <div className="overflow-hidden rounded-2xl border border-border/70 bg-card/40 backdrop-blur-md dark:bg-card/30">
          <div className="flex items-baseline justify-between border-b border-border/40 px-5 pt-4 pb-3">
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground/80">
              Example brain
            </p>
            <p className="text-[11px] tabular-nums text-muted-foreground/70">6 items</p>
          </div>
          <ul className="divide-y divide-border/40">
            {EXAMPLE_BRAIN.map((g, gi) => (
              <motion.li
                key={g.type}
                initial={{ opacity: 0, y: 3 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35, delay: 0.32 + gi * 0.05, ease: [0.2, 0, 0, 1] }}
                className="px-4 py-2.5"
              >
                <p className="mb-1 font-mono text-[10px] uppercase tracking-wider text-brain-accent/90">
                  {g.type} · {g.items.length}
                </p>
                <ul className="space-y-0.5">
                  {g.items.map((it) => (
                    <li
                      key={it}
                      className="truncate text-[12.5px] leading-relaxed text-foreground/80"
                    >
                      {it}
                    </li>
                  ))}
                </ul>
              </motion.li>
            ))}
          </ul>
        </div>

        <p className="px-1 text-[11px] leading-relaxed text-muted-foreground/60">
          You'll review every item. Nothing is auto-accepted.
        </p>
      </div>
    </motion.aside>
  );
}
