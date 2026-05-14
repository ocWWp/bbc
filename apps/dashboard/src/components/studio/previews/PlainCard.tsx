// Fallback preview for kind="plain" -- voice-consistency-check, hashtag
// strategy, custom-chat outputs. No platform framing; just a clean text block
// with citations.

import { CitedText, type CitationContext } from "./CitedText";

type Props = {
  text: string;
  ctx?: CitationContext;
};

export function PlainCard({ text, ctx }: Props) {
  return (
    <article className="w-full max-w-[640px] rounded-xl border bg-card text-card-foreground p-5 sm:p-6 shadow-sm">
      <div className="text-[15px] leading-[1.65] whitespace-pre-wrap break-words text-foreground/90">
        <CitedText text={text} ctx={ctx} preserveBreaks />
      </div>
    </article>
  );
}
