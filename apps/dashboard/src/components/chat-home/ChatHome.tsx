"use client";

// ChatHome: conversational-routing surface for /home. Wraps routeTask in a
// constrained state machine so the page never drifts into chat-thread mode.
//
// State machine: idle → thinking → (candidates | clarify | brain_results | error)
// Two intents, declared by the user via a segmented control:
//   - "make" → submit() calls routeTask() and lands in candidates/clarify
//   - "ask"  → submit() calls searchBrain() and lands in brain_results
// Codex consult (2026-05-15) settled on the explicit Read-vs-Make split rather
// than auto-classifying intent server-side — synthesizing fluent answers from
// incomplete memory is a citation-liability risk we're not taking on in Phase P.
//
// Max 1 clarify turn per make-task — enforced server-side (routeTask with
// opts.clarification forces tool_choice=route_task) and client-side by
// rejecting any clarify response that comes back from a CLARIFIED request.
// We use the closure-local `clarification` arg as the per-task signal, not
// component state, so it can't leak across tasks.

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  routeTask,
  type RoutedTemplate,
} from "@/lib/studio/route-task-action";
import {
  searchBrain,
  type BrainHit,
} from "@/lib/home/search-brain-action";
import { TASK_MIN_LEN } from "@/lib/studio/task-limits";
import StarterPrompts from "./StarterPrompts";
import RecentRunsStrip, { type RecentRun } from "./RecentRunsStrip";
import BrainResults from "./BrainResults";

type Stage =
  | { kind: "idle" }
  | { kind: "thinking" }
  // candidates carries the EXACT task it was routed for, not the live `task`
  // input. Otherwise: submit task A, type task B before A resolves, click a
  // candidate → studio receives task B with a template chosen for A. Codex
  // review caught this in the FAIL_BLOCKING pass on 2026-05-15.
  | {
      kind: "candidates";
      candidates: RoutedTemplate[];
      task: string;
      clarification?: string;
    }
  | { kind: "clarify"; question: string; suggestions: string[]; task: string }
  | { kind: "brain_results"; query: string; hits: ReadonlyArray<BrainHit> }
  | { kind: "error"; message: string };

type Intent = "make" | "ask";

type Role = "member" | "operator" | "admin" | "viewer";

export type ChatHomeProps = {
  role: Role;
  hasProviderKey: boolean;
  recentRuns: ReadonlyArray<RecentRun>;
};

const PLACEHOLDER: Record<Intent, string> = {
  make: "e.g. follow up with a customer who churned, or draft an NDA for a contractor",
  ask: "e.g. when did we sign Stripe? what's our runway? who owns the auth migration?",
};

const SUBMIT_LABEL: Record<Intent, string> = {
  make: "Ask BBC",
  ask: "Search brain",
};

// Make-flow needs a fuller task description for routeTask to classify well.
// Ask-flow is a keyword search — short terms like "runway" or "stripe" are
// the natural input shape and the server-side searchBrain only enforces 2
// chars. Per-intent min keeps the client gate from blocking legitimate
// brain queries.
const MIN_INPUT_LEN: Record<Intent, number> = {
  make: TASK_MIN_LEN,
  ask: 2,
};

export default function ChatHome({ role, hasProviderKey, recentRuns }: ChatHomeProps) {
  const recentRunsCount = recentRuns.length;
  const router = useRouter();
  const [task, setTask] = useState("");
  // Default to "ask" when no provider key is configured — the read path
  // doesn't need an LLM, so it should be the available path. With a key,
  // "make" is the default since routing to a studio is the primary action.
  const [intent, setIntent] = useState<Intent>(hasProviderKey ? "make" : "ask");
  const [stage, setStage] = useState<Stage>({ kind: "idle" });
  const [, startTransition] = useTransition();
  // Monotonic request id — every submit/intent-flip bumps it. Async
  // completions ignore their result if the current id doesn't match the
  // one captured at dispatch time. Without this, a slow searchBrain can
  // land brain_results onto the Make UI after the user has flipped intent.
  const requestIdRef = useRef(0);

  const submitMake = (taskText: string, clarification?: string) => {
    const t = taskText.trim();
    if (t.length < TASK_MIN_LEN) {
      setStage({ kind: "error", message: "Describe what you need in a few more words." });
      return;
    }
    const myId = ++requestIdRef.current;
    setStage({ kind: "thinking" });
    startTransition(async () => {
      const res = await routeTask(t, clarification ? { clarification } : undefined);
      // Stale-response guard: if the user submitted another task or flipped
      // intent while this request was in flight, drop the result on the floor.
      if (requestIdRef.current !== myId) return;
      if (!res.ok) {
        setStage({ kind: "error", message: res.error });
        return;
      }
      if (res.kind === "clarify") {
        // Per-task guard: a second clarify is only blocked when THIS call was
        // already a clarified turn (i.e. clarification arg is set). A fresh
        // submit's first clarify response is always welcomed. Using the
        // closure arg instead of component state means the guard cannot leak
        // across tasks (codex review caught the leak in the prior approach).
        if (clarification) {
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
      // Carry the exact task the LLM routed for. Don't trust the live `task`
      // input — the user may have typed something else by the time candidates
      // resolve, and routing task B to a template chosen for A is silent
      // mis-routing.
      setStage({ kind: "candidates", candidates: res.candidates, task: t, clarification });
    });
  };

  const submitAsk = (taskText: string) => {
    const t = taskText.trim();
    if (t.length < MIN_INPUT_LEN.ask) {
      setStage({ kind: "error", message: "Type at least 2 characters to search." });
      return;
    }
    const myId = ++requestIdRef.current;
    setStage({ kind: "thinking" });
    startTransition(async () => {
      const res = await searchBrain(t);
      if (requestIdRef.current !== myId) return;
      if (!res.ok) {
        setStage({ kind: "error", message: res.error });
        return;
      }
      setStage({ kind: "brain_results", query: t, hits: res.hits });
    });
  };

  const submit = (taskText: string, clarification?: string) => {
    if (intent === "ask") {
      submitAsk(taskText);
      return;
    }
    submitMake(taskText, clarification);
  };

  const onClarifyClick = (suggestion: string) => {
    if (stage.kind !== "clarify") return;
    submitMake(stage.task, suggestion);
  };

  const onCandidateClick = (c: RoutedTemplate) => {
    if (stage.kind !== "candidates") return;
    // Use the task the LLM was actually routed against, not the live `task`
    // input. The user may have typed something different by the time they
    // click a candidate (e.g. they hit a starter prompt, or kept typing).
    // Routing a different task into a template chosen for the original is
    // silent mis-routing — codex review caught this on 2026-05-15.
    const routedTask = stage.task;
    const { clarification } = stage;
    // If this candidate came out of a clarify cycle, append the clarification
    // to the task before handoff so the studio run sees the detail the user
    // just supplied. Otherwise the studio would re-receive the original
    // ambiguous text and produce a draft without the disambiguator.
    const enriched = clarification ? `${routedTask} — ${clarification}` : routedTask;
    router.push(
      `/studio/${c.owningRole}?template=${encodeURIComponent(c.templateId)}&task=${encodeURIComponent(enriched)}`,
    );
  };

  const onStarterPick = (starter: string) => {
    setTask(starter);
    setStage({ kind: "idle" });
  };

  const onRephrase = () => {
    setStage({ kind: "idle" });
  };

  const onResetBrain = () => {
    setStage({ kind: "idle" });
  };

  const onIntentChange = (next: Intent) => {
    if (next === intent) return;
    setIntent(next);
    // Bump the request id so any in-flight response from the previous
    // intent is dropped on the floor when it lands. Without this, a slow
    // searchBrain that started under "ask" can render brain_results on
    // top of the Make UI after the user flipped intent.
    requestIdRef.current++;
    // Switching intent always returns to idle — a half-loaded candidates list
    // or brain hits for the *other* intent would be confusing.
    setStage({ kind: "idle" });
  };

  const onKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      submit(task);
    }
  };

  const canSubmit =
    task.trim().length >= MIN_INPUT_LEN[intent] && stage.kind !== "thinking";

  return (
    <div className="chat-home">
      <header className="chat-home-head">
        <span className="eyebrow">
          <span className="dot" aria-hidden /> ask bbc
        </span>
        <h1 className="chat-home-title">
          What can we <span className="serif">make</span> today?
        </h1>
        <p className="chat-home-blurb">
          Describe the work in your own words. BBC routes it to the right workflow across all
          eight studios — you review every draft before anything is saved or sent.
        </p>
      </header>

      <section className="chat-home-composer">
        <div
          className="intent-toggle"
          role="tablist"
          aria-label="What do you want to do?"
        >
          <button
            type="button"
            role="tab"
            aria-selected={intent === "make"}
            className="intent-toggle-btn"
            data-on={intent === "make" || undefined}
            onClick={() => onIntentChange("make")}
          >
            Make draft
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={intent === "ask"}
            className="intent-toggle-btn"
            data-on={intent === "ask" || undefined}
            onClick={() => onIntentChange("ask")}
          >
            Ask brain
          </button>
        </div>

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
              onClick={onRephrase}
            >
              or rephrase →
            </button>
          </section>
        ) : stage.kind === "brain_results" ? (
          <BrainResults
            query={stage.query}
            hits={stage.hits}
            onReset={onResetBrain}
          />
        ) : intent === "make" && !hasProviderKey ? (
          // Make-flow requires an LLM provider key; Ask-brain does not. The
          // toggle above stays visible so the user can switch to Ask brain
          // and use the read-only path immediately. Codex review caught the
          // old gate blocking Ask entirely.
          <div className="composer-shell composer-shell--gated" data-disabled>
            <div className="composer-gated-body">
              <span className="eyebrow">make draft · setup needed</span>
              <p className="composer-gated-msg">
                {role === "admin"
                  ? "Connect a model provider to route tasks to a studio. Or switch to Ask brain — that path doesn't need a key."
                  : "Your admin needs to connect a model provider before BBC can route tasks. You can still use Ask brain to search what's already in memory."}
              </p>
              {role === "admin" && (
                <Link href="/settings/keys" className="btn primary">
                  Connect a provider →
                </Link>
              )}
            </div>
          </div>
        ) : (
          <div className="composer-shell" data-disabled={stage.kind === "thinking" || undefined}>
            <textarea
              className="chat-home-input"
              value={task}
              onChange={(e) => setTask(e.target.value)}
              onKeyDown={onKey}
              placeholder={PLACEHOLDER[intent]}
              rows={3}
              aria-label={intent === "make" ? "Describe what you need" : "Search your brain"}
              disabled={stage.kind === "thinking"}
            />
            <div className="composer-foot">
              <span className="composer-hint" aria-hidden>
                <kbd>⌘</kbd>
                <kbd>↵</kbd> to send
              </span>
              <button
                type="button"
                className="composer-submit"
                onClick={() => submit(task)}
                disabled={!canSubmit}
                aria-label={SUBMIT_LABEL[intent]}
              >
                <span>{SUBMIT_LABEL[intent]}</span>
                <span className="composer-submit-arrow" aria-hidden>→</span>
              </button>
            </div>
          </div>
        )}
      </section>

      {stage.kind === "thinking" && (
        <div className="chat-home-stage" data-state="thinking" aria-live="polite">
          <span className="thinking-eyebrow">
            {intent === "ask" ? "searching brain…" : "routing…"}
          </span>
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
