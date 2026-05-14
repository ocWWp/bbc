// Meta Threads-style preview. Compared to X: square-rounded avatar (Threads
// uses square-ish), spiral mark in the corner.

import { Avatar } from "./Avatar";
import { CitedText, type CitationContext } from "./CitedText";
import { deriveAuthor, previewRelativeTime } from "./utils";

type Props = {
  text: string;
  authorHint?: { name?: string; handle?: string; productName?: string };
  ctx?: CitationContext;
};

export function ThreadsPostCard({ text, authorHint, ctx }: Props) {
  const author = deriveAuthor(authorHint);
  return (
    <article
      className="relative w-full max-w-[540px] rounded-2xl border bg-card text-card-foreground p-4 sm:p-5 shadow-sm"
      style={{ fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif" }}
    >
      <header className="flex items-start gap-3">
        <Avatar seed={author.handle} initial={author.initial} size={42} shape="rounded" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-[15px] leading-tight">
            <span className="font-semibold tracking-tight truncate">{author.displayName}</span>
            <span className="text-muted-foreground text-[13px]">{previewRelativeTime()}</span>
          </div>
          <div className="text-muted-foreground text-[13px] truncate">@{author.handle}</div>
        </div>
        <SpiralMark />
      </header>
      <div className="mt-3 text-[15px] leading-[1.5] text-foreground whitespace-pre-wrap break-words">
        <CitedText text={text} ctx={ctx} preserveBreaks />
      </div>
      <footer className="mt-4 flex items-center gap-5 text-muted-foreground/70">
        <Heart />
        <Bubble />
        <Repost />
        <Share />
      </footer>
    </article>
  );
}

function SpiralMark() {
  return (
    <svg
      aria-hidden
      width={20}
      height={20}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="text-muted-foreground/40 absolute right-4 top-4"
    >
      <path d="M12 3a9 9 0 1 0 9 9c0-5-3.5-8-7-8s-6 2.5-6 6 2 5 4.5 5 4-1.5 4-3.5-1.2-3-2.5-3-2 1-2 2" />
    </svg>
  );
}

function StrokeIcon({ d }: { d: string }) {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
}
function Heart() { return <StrokeIcon d="M12 21s-7-4.5-9.5-9.2C.7 8 3 4 7 4c2 0 3.5 1 5 3 1.5-2 3-3 5-3 4 0 6.3 4 4.5 7.8C19 16.5 12 21 12 21z" />; }
function Bubble() { return <StrokeIcon d="M21 15a4 4 0 0 1-4 4H8l-5 3V8a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4v7Z" />; }
function Repost() { return <StrokeIcon d="M17 1l4 4-4 4M3 11V9a4 4 0 0 1 4-4h14M7 23l-4-4 4-4M21 13v2a4 4 0 0 1-4 4H3" />; }
function Share() { return <StrokeIcon d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7M16 6l-4-4-4 4M12 2v13" />; }
