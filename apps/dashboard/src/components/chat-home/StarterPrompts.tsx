"use client";

export const STARTER_PROMPTS = [
  { label: "Draft an NDA", task: "draft an NDA for a contractor" },
  { label: "Win-back email", task: "write a win-back email for a churned customer" },
  { label: "Board memo", task: "draft a board update memo" },
  { label: "Bug ack", task: "acknowledge a bug report from a customer" },
  { label: "Blog post", task: "draft a blog post about our latest feature" },
  { label: "Job description", task: "write a job description for a senior engineer" },
] as const;

type Props = {
  onPick: (task: string) => void;
  promoted: boolean;
};

export default function StarterPrompts({ onPick, promoted }: Props) {
  return (
    <div className={`chat-home-starters ${promoted ? "is-promoted" : ""}`}>
      {promoted && (
        <span className="eyebrow">
          <span className="dot" aria-hidden /> no runs yet · pick a starter
        </span>
      )}
      <div className="starter-pills">
        {STARTER_PROMPTS.map((p) => (
          <button
            key={p.label}
            type="button"
            className="chip"
            data-kind="starter"
            onClick={() => onPick(p.task)}
          >
            {p.label}
          </button>
        ))}
      </div>
    </div>
  );
}
