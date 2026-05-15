"use client";
// "Ask BBC" -- the task-first router that sits atop the gallery. Type what you
// need; it routes to candidate templates across all 8 studios and deep-links
// into the structured plan-before-run flow. It NEVER generates directly.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { routeTask, type RoutedTemplate } from "@/lib/studio/route-task-action";
import { TASK_MIN_LEN } from "@/lib/studio/task-limits";

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

  return (
    <section aria-label="Ask BBC">
      {/* VISUAL: restyle from mockup. Structure must stay: input + submit, then candidate list. */}
      <label htmlFor="ask-bbc">Tell BBC what you need</label>
      <textarea
        id="ask-bbc"
        value={task}
        onChange={(e) => setTask(e.target.value)}
        placeholder="e.g. follow up with a customer who churned"
      />
      <button
        type="button"
        onClick={submit}
        disabled={pending || task.trim().length < TASK_MIN_LEN}
      >
        {pending ? "Thinking…" : "Ask BBC"}
      </button>
      {error ? <p role="alert">{error}</p> : null}
      {candidates ? (
        <ul aria-label="Suggested workflows">
          {candidates.map((c) => (
            <li key={c.templateId}>
              <button type="button" onClick={() => open(c)}>
                <span>{c.label}</span>
                <span>{c.owningRole}</span>
                <span>{c.rationale}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
