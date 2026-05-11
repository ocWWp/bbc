// X (Twitter) post preview card. Light + dark variants follow the dashboard
// theme rather than X's fixed-dark default -- the preview lives inside our
// own UI so consistency wins over pixel-match. Pure CSS / SVG, no scraped
// brand assets.

import { Avatar } from "./Avatar";
import { CitedText, type CitationContext } from "./CitedText";
import { deriveAuthor, previewRelativeTime, xCharCount } from "./utils";

type Props = {
  text: string;
  authorHint?: { name?: string; handle?: string; productName?: string };
  ctx?: CitationContext;
  // Optional: a small bird mark in the corner. Off by default to keep us
  // distinct from real X UI.
  showCornerMark?: boolean;
};

export function XPostCard({ text, authorHint, ctx, showCornerMark = true }: Props) {
  const author = deriveAuthor(authorHint);
  const count = xCharCount(text);
  const over = count > 280;

  return (
    <article
      className="relative w-full max-w-[560px] rounded-2xl border bg-card text-card-foreground p-4 sm:p-5 shadow-sm"
      style={{ fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif" }}
    >
      <header className="flex items-start gap-3">
        <Avatar seed={author.handle} initial={author.initial} size={44} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-[15px] leading-tight">
            <span className="font-semibold tracking-tight truncate">
              {author.displayName}
            </span>
            <VerifiedDot />
            <span className="text-muted-foreground truncate">@{author.handle}</span>
            <span className="text-muted-foreground">·</span>
            <span className="text-muted-foreground">{previewRelativeTime()}</span>
          </div>
        </div>
        {showCornerMark ? <XMark /> : null}
      </header>

      <div className="mt-2 text-[15px] leading-[1.45] text-foreground whitespace-pre-wrap break-words">
        <CitedText text={text} ctx={ctx} preserveBreaks />
      </div>

      <footer className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
        <div className="flex items-center gap-4">
          <IconRow />
        </div>
        <span
          className={
            "font-medium tabular-nums " +
            (over
              ? "text-destructive"
              : count > 260
                ? "text-amber-600 dark:text-amber-400"
                : "text-muted-foreground")
          }
          aria-label={`Character count ${count} of 280`}
        >
          {count}/280
        </span>
      </footer>
    </article>
  );
}

function VerifiedDot() {
  // Generic verification dot — not the X checkmark. Keeps us legally clean.
  return (
    <span
      aria-hidden
      className="inline-block size-3 rounded-full"
      style={{ background: "var(--studio-accent)" }}
    />
  );
}

function XMark() {
  // Stylized X glyph — not the real logo, just an "X" letterform.
  return (
    <span
      aria-hidden
      className="absolute right-4 top-4 text-muted-foreground/40 select-none"
      style={{ fontSize: 18, fontWeight: 700, letterSpacing: "-0.04em" }}
    >
      𝕏
    </span>
  );
}

function IconRow() {
  return (
    <div className="flex items-center gap-5 text-muted-foreground/70">
      <Glyph d="M3 8.5a4.5 4.5 0 0 1 4.5-4.5h9A4.5 4.5 0 0 1 21 8.5v4a4.5 4.5 0 0 1-4.5 4.5H12l-4 3v-3h-.5A4.5 4.5 0 0 1 3 12.5v-4Z" />
      <Glyph d="M4 8l8 5 8-5M4 8v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8M4 8l2-2h12l2 2" />
      <Glyph d="M12 4v16M4 12h16" />
      <Glyph d="M5 12l4 4L19 6" />
    </div>
  );
}

function Glyph({ d }: { d: string }) {
  return (
    <svg
      aria-hidden
      width={16}
      height={16}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={d} />
    </svg>
  );
}
