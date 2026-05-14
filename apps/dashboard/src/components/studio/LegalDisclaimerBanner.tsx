// Persistent "not legal advice" banner for the Legal Studio. UI-SPEC §2 makes
// this a FIRST-CLASS element, not fine print: unauthorized-practice-of-law
// liability is live litigation in 2026. It renders once at the top of the
// Legal Studio body, in every state, and never collapses or dismisses.
//
// Tone is deliberately calm — slate, not red. It's a standing fact about what
// the Studio is, not an error. Pairs with the per-doc-type triage chip
// (legalTriageFor) which carries the variable, doc-specific risk.

export function LegalDisclaimerBanner() {
  return (
    <div
      role="note"
      aria-label="Legal Studio disclaimer"
      className="flex items-start gap-3 rounded-xl border border-studio-accent/40 bg-studio-accent/10 px-4 py-3"
    >
      <ScaleIcon />
      <div className="space-y-0.5 text-sm leading-snug">
        <p className="font-semibold text-foreground">
          Drafting assistant — not legal advice.
        </p>
        <p className="text-muted-foreground">
          Every document this Studio produces is a draft. Have an attorney review it
          before you use it. BBC does not provide legal advice and nothing here is a
          substitute for a lawyer.
        </p>
      </div>
    </div>
  );
}

function ScaleIcon() {
  return (
    <svg
      width={18}
      height={18}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="mt-0.5 shrink-0 text-studio-accent"
      aria-hidden
    >
      <path d="M12 3v18" />
      <path d="M7 7h10" />
      <path d="M5 21h14" />
      <path d="M7 7l-3.5 7a3.5 3.5 0 0 0 7 0L7 7z" />
      <path d="M17 7l-3.5 7a3.5 3.5 0 0 0 7 0L17 7z" />
    </svg>
  );
}
