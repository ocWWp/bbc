// Medium-style blog preview. Big serif title, smaller subtitle, prose-styled
// body. Markdown is rendered as plain text in v1 (no markdown lib dep) but
// the CitedText helper still works inside it. Headings starting with `#`,
// `##`, `###` get styled; everything else is paragraphs.

import { CitedText, type CitationContext } from "./CitedText";

type Props = {
  title: string;
  subtitle?: string;
  body_markdown: string;
  ctx?: CitationContext;
};

export function BlogDraftCard({ title, subtitle, body_markdown, ctx }: Props) {
  const paragraphs = body_markdown.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  const wordCount = body_markdown.split(/\s+/).filter(Boolean).length;
  const readMin = Math.max(1, Math.round(wordCount / 230));

  return (
    <article
      className="w-full max-w-[680px] rounded-2xl border bg-card text-card-foreground p-6 sm:p-10 shadow-sm"
      style={{ fontFamily: "Georgia, 'Times New Roman', Charter, serif" }}
    >
      <header className="mb-6">
        <h1
          className="text-[34px] sm:text-[40px] leading-[1.1] font-bold tracking-tight text-foreground"
          style={{ letterSpacing: "-0.02em" }}
        >
          <CitedText text={title} ctx={ctx} preserveBreaks={false} />
        </h1>
        {subtitle ? (
          <p className="mt-3 text-[18px] sm:text-[20px] leading-snug text-muted-foreground">
            <CitedText text={subtitle} ctx={ctx} preserveBreaks={false} />
          </p>
        ) : null}
        <div
          className="mt-5 flex items-center gap-3 text-[13px] text-muted-foreground"
          style={{ fontFamily: "system-ui, -apple-system, sans-serif" }}
        >
          <span>Draft</span>
          <span aria-hidden>·</span>
          <span>{wordCount.toLocaleString()} words</span>
          <span aria-hidden>·</span>
          <span>{readMin} min read</span>
        </div>
      </header>
      <div className="space-y-5">
        {paragraphs.map((p, i) => {
          const heading = /^#{1,3}\s+/.exec(p);
          if (heading) {
            const level = heading[0].trim().length;
            const stripped = p.slice(heading[0].length);
            const sizeClass =
              level === 1
                ? "text-[26px] font-bold mt-6"
                : level === 2
                  ? "text-[22px] font-bold mt-4"
                  : "text-[18px] font-semibold mt-3";
            return (
              <h2 key={i} className={`${sizeClass} leading-snug tracking-tight`}>
                <CitedText text={stripped} ctx={ctx} preserveBreaks={false} />
              </h2>
            );
          }
          return (
            <p key={i} className="text-[18px] leading-[1.7] text-foreground/90">
              <CitedText text={p} ctx={ctx} preserveBreaks />
            </p>
          );
        })}
      </div>
    </article>
  );
}
