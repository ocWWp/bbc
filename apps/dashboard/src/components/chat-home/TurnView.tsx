"use client";

import { Fragment, useMemo, type ReactNode } from "react";
import Link from "next/link";
import { motion } from "framer-motion";

import { ActionCard } from "./ActionCard";
import { CitationChip } from "./CitationChip";

export type CitationRef = {
  id: string;
  /** Memory row title at the time of citation; null if unknown. */
  title?: string | null;
  /**
   * Memory type (decision, voice, vendor, team, …) at the time of citation;
   * null when the source can't supply it (e.g. historical turns persisted
   * before v1.8). Drives per-type color on the rendered chip — null
   * chips fall back to the neutral `--paper-muted` tint.
   */
  type?: string | null;
};

export type TurnViewModel = {
  id: string;
  role: "user" | "agent";
  status: "in_progress" | "completed" | "aborted" | "failed";
  text: string;
  toolCalls: Array<{ name: string; payload: unknown }>;
  citations: CitationRef[];
  /** True while SSE is still appending; renders a typing cursor. */
  streaming?: boolean;
};

export function TurnView({ turn }: { turn: TurnViewModel }) {
  const isUser = turn.role === "user";
  // Memoize the prose parse to avoid re-splitting the full accumulated
  // text on every text-delta. User turns skip the parse entirely.
  const renderedProse = useMemo(
    () => (isUser ? turn.text : renderProse(turn.text, turn.citations)),
    [isUser, turn.text, turn.citations],
  );
  // F4: Linear-style turn identity. Users get a right-aligned pill so
  // their input is unambiguously "what I said." The assistant runs
  // flush-left as prose — no bubble, no border — so the answer reads
  // as the page's primary content rather than a chat callout. Role label
  // surfaces on hover for screen-readers / explicit identification.
  return (
    <motion.div
      // Light enter-only motion. The streaming text already gives a
      // continuous cadence of change; the turn container fades up once
      // and then sits. MotionConfig at the ChatHome level honors
      // prefers-reduced-motion so screen-reader-tuned setups get a
      // duration:0 path automatically.
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: "easeOut" }}
      className={`group flex w-full ${isUser ? "justify-end" : "justify-start"}`}
      data-testid={`turn-${turn.role}-${turn.id}`}
      data-status={turn.status}
      title={isUser ? "You" : "Assistant"}
    >
      <div
        className={
          isUser
            ? "max-w-[min(720px,90%)]"
            : "max-w-[min(720px,82%)]"
        }
      >
        {turn.status === "aborted" && !isUser ? (
          <InterruptedBanner kind="aborted" />
        ) : turn.status === "failed" && !isUser ? (
          <InterruptedBanner kind="failed" />
        ) : null}

        {turn.text || turn.streaming ? (
          <p
            className={
              isUser
                ? "whitespace-pre-wrap text-sm leading-relaxed"
                : "whitespace-pre-wrap text-sm leading-relaxed text-foreground"
            }
          >
            {/* Assistant text can contain `[mem:UUID]` citation markers.
                Memoized into renderedProse above so streaming text-delta
                cadence doesn't re-split the full message each tick. */}
            {renderedProse}
            {turn.streaming ? (
              <span
                aria-hidden
                className="ml-0.5 inline-block h-3 w-1.5 translate-y-0.5 animate-pulse bg-current/60"
              />
            ) : null}
          </p>
        ) : null}

        {turn.toolCalls.length > 0 ? (
          <div className="mt-2 space-y-1.5">
            {turn.toolCalls.map((c, i) => (
              <ActionCard key={`${c.name}-${i}`} kind={c.name} payload={c.payload} />
            ))}
          </div>
        ) : null}

        {turn.citations.length > 0 ? (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {turn.citations.map((c) => (
              <CitationChip
                key={c.id}
                memoryId={c.id}
                label={c.title ?? undefined}
                type={c.type ?? undefined}
              />
            ))}
          </div>
        ) : null}
      </div>
    </motion.div>
  );
}

// Matches both 32-hex (raw) and 8-4-4-4-12 (dashed) uuid forms — the
// model can emit either inside [mem:...] markers depending on how it
// echoed the id. Anchored inside the brackets so we never eat trailing
// punctuation.
const MEM_MARKER_RE = /(\[mem:[0-9a-f-]{32,36}\])/gi;
const MEM_ID_RE = /^\[mem:([0-9a-f-]{32,36})\]$/i;

function renderProse(text: string, citations: CitationRef[]): ReactNode {
  if (!text.includes("[mem:")) return text;
  const titles = new Map<string, string>();
  const types = new Map<string, string>();
  for (const c of citations) {
    const key = c.id.toLowerCase();
    if (c.title) titles.set(key, c.title);
    if (c.type) types.set(key, c.type);
  }
  const parts = text.split(MEM_MARKER_RE);
  return parts.map((part, i) => {
    const m = part.match(MEM_ID_RE);
    if (!m) return <Fragment key={i}>{part}</Fragment>;
    const id = m[1]!.toLowerCase();
    const title = titles.get(id) ?? `mem · ${id.slice(0, 6)}`;
    const type = types.get(id);
    return (
      <Link
        key={i}
        href={`/memory/${id}`}
        className="citation-chip mx-0.5 align-baseline"
        {...(type ? { "data-type": type } : {})}
        data-testid={`inline-citation-${id}`}
      >
        <span aria-hidden className="citation-chip-dot" />
        <span className="citation-chip-label">{title}</span>
      </Link>
    );
  });
}

function InterruptedBanner({ kind }: { kind: "aborted" | "failed" }) {
  // Inline lede, not a colored block. The dot carries the status; the
  // text reads as part of the turn's first line. Works on the white
  // home-pilot agent card without shouting.
  return (
    <div className="mb-1.5 flex items-center gap-2 text-xs text-muted-foreground">
      <span
        aria-hidden
        className="inline-block size-1.5 rounded-full bg-amber-500/70"
      />
      <span>
        {kind === "aborted"
          ? "This turn was interrupted."
          : "Something went wrong on this turn."}
      </span>
    </div>
  );
}
