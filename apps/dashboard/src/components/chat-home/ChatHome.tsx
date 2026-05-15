"use client";

// ChatHome: conversational-routing surface for /home. Wraps routeTask in a
// constrained state machine so the page never drifts into chat-thread mode.
//
// State machine: idle → thinking → (candidates | clarify | error)
// Max 1 clarify turn per task — enforced both client-side (hasClarified) and
// server-side (routeTask with opts.clarification forces tool_choice=route_task).

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  routeTask,
  type RoutedTemplate,
} from "@/lib/studio/route-task-action";
import { TASK_MIN_LEN } from "@/lib/studio/task-limits";
import StarterPrompts from "./StarterPrompts";
import RecentRunsStrip, { type RecentRun } from "./RecentRunsStrip";

type Stage =
  | { kind: "idle" }
  | { kind: "thinking" }
  | { kind: "candidates"; candidates: RoutedTemplate[] }
  | { kind: "clarify"; question: string; suggestions: string[]; task: string }
  | { kind: "error"; message: string };

type Role = "member" | "operator" | "admin" | "viewer";

export type ChatHomeProps = {
  role: Role;
  hasProviderKey: boolean;
  recentRuns: ReadonlyArray<RecentRun>;
};

export default function ChatHome({ role, hasProviderKey, recentRuns }: ChatHomeProps) {
  const recentRunsCount = recentRuns.length;
  const router = useRouter();
  const [task, setTask] = useState("");
  const [stage, setStage] = useState<Stage>({ kind: "idle" });
  const [hasClarified, setHasClarified] = useState(false);
  const [, startTransition] = useTransition();

  if (!hasProviderKey) {
    return (
      <div className="chat-home no-provider-key">
        <span className="eyebrow">
          <span className="dot" aria-hidden /> ask bbc · setup needed
        </span>
        <h1 className="chat-home-title">
          No provider key <span className="serif">yet</span>.
        </h1>
        {role === "admin" ? (
          <>
            <p className="chat-home-blurb">
              BBC needs a model provider key to route tasks. Connect one and you're set.
            </p>
            <Link href="/settings/api-keys" className="btn primary">
              Connect a provider →
            </Link>
          </>
        ) : (
          <p className="chat-home-blurb">
            Ask your admin to connect a provider so you can ask BBC.
          </p>
        )}
      </div>
    );
  }

  const submit = (taskText: string, clarification?: string) => {
    const t = taskText.trim();
    if (t.length < TASK_MIN_LEN) {
      setStage({ kind: "error", message: "Describe what you need in a few more words." });
      return;
    }
    setStage({ kind: "thinking" });
    startTransition(async () => {
      const res = await routeTask(t, clarification ? { clarification } : undefined);
      if (!res.ok) {
        setStage({ kind: "error", message: res.error });
        return;
      }
      if (res.kind === "clarify") {
        // Client-side guardrail: refuse a second clarify even if the server tries.
        if (hasClarified) {
          setStage({
            kind: "error",
            message: "Couldn't narrow this down — try rephrasing what you need.",
          });
          return;
        }
        setStage({
          kind: "clarify",
          question: res.question,
          suggestions: res.suggestions,
          task: t,
        });
        return;
      }
      setStage({ kind: "candidates", candidates: res.candidates });
    });
  };

  const onClarifyClick = (suggestion: string) => {
    if (stage.kind !== "clarify") return;
    setHasClarified(true);
    submit(stage.task, suggestion);
  };

  const onCandidateClick = (c: RoutedTemplate) => {
    const taskToCarry = stage.kind === "clarify" ? stage.task : task;
    router.push(
      `/studio/${c.owningRole}?template=${encodeURIComponent(c.templateId)}&task=${encodeURIComponent(taskToCarry.trim())}`,
    );
  };

  const onStarterPick = (starter: string) => {
    setTask(starter);
    setStage({ kind: "idle" });
  };

  const onKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      submit(task);
    }
  };

  const canSubmit = task.trim().length >= TASK_MIN_LEN && stage.kind !== "thinking";

  return (
    <div className="chat-home">
      <header className="chat-home-head">
        <span className="eyebrow">
          <span className="dot" aria-hidden /> ask bbc · the fast path
        </span>
        <h1 className="chat-home-title">
          Tell BBC what you <span className="serif">need</span>.
        </h1>
        <p className="chat-home-blurb">
          Describe the work in your own words. BBC routes it to the right workflow across all
          eight studios — you review every draft before anything is saved or sent.
        </p>
      </header>

      {stage.kind === "clarify" ? (
        <section className="chat-home-clarify" aria-live="polite">
          <p className="clarify-task-recall">
            <span className="muted">your task —</span> &ldquo;{stage.task}&rdquo;
          </p>
          <span className="clarify-eyebrow">BBC needs one detail</span>
          <p className="clarify-question">{stage.question}</p>
          <div className="clarify-chips">
            {stage.suggestions.map((s) => (
              <button
                key={s}
                type="button"
                className="chip"
                data-kind="answer"
                onClick={() => onClarifyClick(s)}
                aria-label={`answer: ${s}`}
              >
                {s}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="link-quiet"
            onClick={() => setStage({ kind: "idle" })}
          >
            or rephrase →
          </button>
        </section>
      ) : (
        <section className="chat-home-composer">
          <div className="composer-row">
            <textarea
              className="chat-home-input"
              value={task}
              onChange={(e) => setTask(e.target.value)}
              onKeyDown={onKey}
              placeholder="e.g. follow up with a customer who churned, or draft an NDA for a contractor"
              rows={3}
              aria-label="Describe what you need"
              disabled={stage.kind === "thinking"}
            />
            <button
              type="button"
              className="btn primary chat-home-submit"
              onClick={() => submit(task)}
              disabled={!canSubmit}
            >
              Ask BBC
            </button>
          </div>
          <p className="composer-hint">
            <kbd>⌘</kbd>
            <kbd>↵</kbd> to send
          </p>
        </section>
      )}

      {stage.kind === "thinking" && (
        <div className="chat-home-stage" data-state="thinking" aria-live="polite">
          <span className="thinking-eyebrow">routing…</span>
          <div className="thinking-skeleton" aria-hidden>
            <span className="skel-row" style={{ width: "60%" }} />
            <span className="skel-row" style={{ width: "80%" }} />
            <span className="skel-row" style={{ width: "45%" }} />
          </div>
        </div>
      )}

      {stage.kind === "candidates" && (
        <div className="chat-home-stage" data-state="candidates" aria-live="polite">
          <span className="eyebrow">candidates · pick one to start</span>
          <ul className="candidates-list">
            {stage.candidates.map((c) => (
              <li key={c.templateId}>
                <button
                  type="button"
                  className="candidate-card"
                  onClick={() => onCandidateClick(c)}
                  aria-label={`open ${c.label} in ${c.owningRole} studio`}
                >
                  <span className="cand-role">{c.owningRole}</span>
                  <span className="cand-label">{c.label}</span>
                  <span className="cand-rationale">{c.rationale}</span>
                  <span className="cand-arrow" aria-hidden>→</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {stage.kind === "error" && (
        <div className="chat-home-stage" data-state="error" role="alert" aria-live="polite">
          <p className="error-message">{stage.message}</p>
        </div>
      )}

      <StarterPrompts
        promoted={recentRunsCount === 0}
        onPick={onStarterPick}
      />

      <RecentRunsStrip runs={recentRuns} />
    </div>
  );
}
