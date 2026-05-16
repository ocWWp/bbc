"use client";

import { motion } from "framer-motion";

import { ActionCard } from "./ActionCard";
import { CitationChip } from "./CitationChip";

export type TurnViewModel = {
  id: string;
  role: "user" | "agent";
  status: "in_progress" | "completed" | "aborted" | "failed";
  text: string;
  toolCalls: Array<{ name: string; payload: unknown }>;
  citations: string[];
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
                : "whitespace-pre-wrap text-base leading-relaxed text-foreground"
            }
          >
            {turn.text}
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
            {turn.citations.map((id) => (
              <CitationChip key={id} memoryId={id} />
            ))}
          </div>
        ) : null}
      </div>
    </motion.div>
  );
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
