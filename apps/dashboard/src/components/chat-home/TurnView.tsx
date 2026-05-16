"use client";

import { Fragment, type ReactNode } from "react";
import Link from "next/link";
import { motion } from "framer-motion";

import { ActionCard } from "./ActionCard";
import { CitationChip } from "./CitationChip";

export type CitationRef = {
  id: string;
  /** Memory row title at the time of citation; null if unknown. */
  title?: string | null;
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
            ? "max-w-[min(720px,90%)] rounded-2xl bg-primary px-4 py-3 text-primary-foreground"
            : "max-w-[min(720px,92%)] px-1"
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
                Replace each with a compact inline pill that links to the
                memory row and shows the title (or a short-id fallback).
                User input never contains them — skip the parse for cheap. */}
            {isUser ? turn.text : renderProse(turn.text, turn.citations)}
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
              <CitationChip key={c.id} memoryId={c.id} label={c.title ?? undefined} />
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
  for (const c of citations) {
    if (c.title) titles.set(c.id.toLowerCase(), c.title);
  }
  const parts = text.split(MEM_MARKER_RE);
  return parts.map((part, i) => {
    const m = part.match(MEM_ID_RE);
    if (!m) return <Fragment key={i}>{part}</Fragment>;
    const id = m[1]!.toLowerCase();
    const title = titles.get(id) ?? `mem · ${id.slice(0, 6)}`;
    return (
      <Link
        key={i}
        href={`/memory/${id}`}
        className="mx-0.5 inline-flex items-center gap-1 rounded-md border border-border bg-muted/40 px-1.5 py-0 align-baseline text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        data-testid={`inline-citation-${id}`}
      >
        {title}
      </Link>
    );
  });
}

function InterruptedBanner({ kind }: { kind: "aborted" | "failed" }) {
  return (
    <div className="mb-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-xs text-amber-700 dark:text-amber-300">
      {kind === "aborted"
        ? "This turn was interrupted."
        : "Something went wrong on this turn."}
    </div>
  );
}
