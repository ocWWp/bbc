"use client";
// "Ask BBC" -- the task-first router that sits atop the gallery. Type what you
// need; it routes to candidate templates across all 8 studios and deep-links
// into the structured plan-before-run flow. It NEVER generates directly --
// it routes. Three states: empty (input only), thinking, results.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { routeTask, type RoutedTemplate } from "@/lib/studio/route-task-action";
import { TASK_MIN_LEN } from "@/lib/studio/task-limits";
import { STUDIO_PRESENTATION } from "@/lib/studio/studio-presentation";

export default function AskBbc() {
  const router = useRouter();
  const [task, setTask] = useState("");
  const [candidates, setCandidates] = useState<RoutedTemplate[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const submit = () => {
    const t = task.trim();
    if (t.length < TASK_MIN_LEN) {
      setError("Describe what you need in a few more words.");
      return;
    }
    setError(null);
    start(async () => {
      const res = await routeTask(t);
      if (!res.ok) {
        setError(res.error);
        setCandidates(null);
        return;
      }
      setCandidates(res.candidates);
    });
  };

  const open = (c: RoutedTemplate) =>
    router.push(
      `/studio/${c.owningRole}?template=${encodeURIComponent(c.templateId)}&task=${encodeURIComponent(task.trim())}`,
    );

  const onKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <section className="ask-bbc" aria-label="Ask BBC">
      <div className="ask-head">
        <span className="eyebrow">
          <span className="dot" aria-hidden /> ask bbc · the fast path
        </span>
        <h2>
          Tell BBC what you <span className="serif">need</span>.
        </h2>
        <p className="sub">
          Describe the work in your own words. BBC routes it to the right workflows
          across all eight studios — you review every draft before anything is saved
          or sent.
        </p>
      </div>

      <div className="ask-row">
        <textarea
          className="ask-input"
          value={task}
          onChange={(e) => setTask(e.target.value)}
          onKeyDown={onKey}
          rows={2}
          placeholder="e.g. follow up with a customer who churned, or draft an NDA for a contractor"
          aria-label="Tell BBC what you need"
        />
        <button
          type="button"
          className="btn primary ask-go"
          onClick={submit}
          disabled={pending || task.trim().length < TASK_MIN_LEN}
        >
          {pending ? "Thinking…" : "Ask BBC"}
        </button>
      </div>

      {error ? (
        <p className="ask-error" role="alert">
          {error}
        </p>
      ) : null}

      {candidates ? (
        <div className="ask-results">
          <span className="eyebrow">
            {candidates.length} way{candidates.length === 1 ? "" : "s"} to do this · pick one to start
          </span>
          <ul className="ask-cands" aria-label="Suggested workflows">
            {candidates.map((c) => {
              const pres = STUDIO_PRESENTATION[c.owningRole];
              return (
                <li key={c.templateId}>
                  <button
                    type="button"
                    className="ask-cand"
                    onClick={() => open(c)}
                    style={{ ["--role-color" as string]: pres.tint }}
                  >
                    <span className="ac-dot" aria-hidden />
                    <span className="ac-body">
                      <span className="ac-label">{c.label}</span>
                      <span className="ac-rat">{c.rationale}</span>
                    </span>
                    <span className="ac-role">{pres.label}</span>
                    <span className="ac-arrow" aria-hidden>
                      →
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
