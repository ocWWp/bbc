// Vertical stack of X posts as a thread. All same author. A connector line
// runs down the avatar gutter between consecutive posts.

import { Avatar } from "./Avatar";
import { CitedText, type CitationContext } from "./CitedText";
import { deriveAuthor, previewRelativeTime, xCharCount } from "./utils";

type Post = { text: string };

type Props = {
  posts: Post[];
  authorHint?: { name?: string; handle?: string; productName?: string };
  ctx?: CitationContext;
};

export function XThreadCard({ posts, authorHint, ctx }: Props) {
  const author = deriveAuthor(authorHint);
  return (
    <article
      className="w-full max-w-[560px] rounded-2xl border bg-card text-card-foreground p-4 sm:p-5 shadow-sm"
      style={{ fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif" }}
    >
      <header className="flex items-center gap-3 mb-3">
        <span className="text-xs uppercase tracking-[0.14em] text-muted-foreground font-semibold">
          Thread · {posts.length} posts
        </span>
      </header>
      <ol className="relative">
        {posts.map((p, i) => {
          const isLast = i === posts.length - 1;
          const count = xCharCount(p.text);
          const over = count > 280;
          return (
            <li key={i} className="relative pl-0 pb-4 last:pb-0">
              <div className="flex items-start gap-3">
                <div className="flex flex-col items-center self-stretch">
                  <Avatar seed={author.handle} initial={author.initial} size={36} />
                  {!isLast ? (
                    <span
                      aria-hidden
                      className="mt-1 flex-1 w-px bg-border min-h-6"
                    />
                  ) : null}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 text-[14px] leading-tight">
                    <span className="font-semibold truncate">{author.displayName}</span>
                    <span className="text-muted-foreground truncate">@{author.handle}</span>
                    <span className="text-muted-foreground">·</span>
                    <span className="text-muted-foreground">{previewRelativeTime()}</span>
                  </div>
                  <div className="mt-1 text-[14.5px] leading-[1.45] whitespace-pre-wrap break-words">
                    <CitedText text={p.text} ctx={ctx} preserveBreaks />
                  </div>
                  <div className="mt-1 flex items-center gap-3 text-[11px] text-muted-foreground">
                    <span className="tabular-nums">
                      {i + 1}/{posts.length}
                    </span>
                    <span
                      className={
                        "tabular-nums " +
                        (over
                          ? "text-destructive"
                          : count > 260
                            ? "text-amber-600 dark:text-amber-400"
                            : "")
                      }
                    >
                      {count}/280
                    </span>
                  </div>
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </article>
  );
}
