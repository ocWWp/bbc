// TikTok / Reel script preview. Looks like a shooting script: hook callout at
// the top, timestamped beat list (tabular numerals), optional CTA at the
// bottom. Mono font for timecodes so they align in a column.

import { CitedText, type CitationContext } from "./CitedText";

type Beat = { time: string; line: string };

type Props = {
  hook: string;
  beats: Beat[];
  cta?: string;
  ctx?: CitationContext;
};

export function ScriptCard({ hook, beats, cta, ctx }: Props) {
  const totalSec = guessTotalSec(beats);
  return (
    <article
      className="w-full max-w-[640px] rounded-2xl border bg-card text-card-foreground shadow-sm overflow-hidden"
      style={{ fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif" }}
    >
      <header
        className="px-5 py-3 flex items-center justify-between text-xs font-mono"
        style={{
          background: "linear-gradient(90deg, var(--studio-accent) 0%, transparent 100%)",
          color: "var(--studio-accent-foreground)",
        }}
      >
        <span className="uppercase tracking-[0.18em] font-semibold">Script</span>
        <span className="tabular-nums opacity-90">{totalSec ? `~${totalSec}s` : "—"}</span>
      </header>

      <div className="p-5 sm:p-6">
        <div className="mb-5">
          <div className="text-[11px] uppercase tracking-[0.16em] font-semibold text-muted-foreground mb-1.5">
            Hook (0–3s)
          </div>
          <div className="text-[19px] leading-[1.3] font-semibold text-foreground">
            <CitedText text={hook} ctx={ctx} preserveBreaks />
          </div>
        </div>

        <ol className="space-y-3">
          {beats.map((b, i) => (
            <li key={i} className="grid grid-cols-[64px_1fr] gap-4 items-start">
              <span
                className="text-[12px] font-mono tabular-nums text-muted-foreground pt-1 border-r pr-3 self-stretch"
                style={{ borderColor: "var(--border)" }}
              >
                {b.time}
              </span>
              <div className="text-[15px] leading-[1.55] text-foreground/90">
                <CitedText text={b.line} ctx={ctx} preserveBreaks />
              </div>
            </li>
          ))}
        </ol>

        {cta ? (
          <div className="mt-6 pt-4 border-t">
            <div className="text-[11px] uppercase tracking-[0.16em] font-semibold text-muted-foreground mb-1.5">
              CTA
            </div>
            <div className="text-[15px] leading-[1.5] font-medium text-foreground">
              <CitedText text={cta} ctx={ctx} preserveBreaks />
            </div>
          </div>
        ) : null}
      </div>
    </article>
  );
}

function guessTotalSec(beats: Beat[]): number | null {
  if (beats.length === 0) return null;
  let max = 0;
  for (const b of beats) {
    const m = b.time.match(/(\d+):(\d{2})/);
    if (!m) continue;
    const s = Number(m[1]) * 60 + Number(m[2]);
    if (s > max) max = s;
  }
  return max || null;
}
