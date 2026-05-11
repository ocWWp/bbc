// LinkedIn-style preview. Slightly heavier card chrome, name + role/title
// row, optional bold headline above the body, hashtag chips at the end.

import { Avatar } from "./Avatar";
import { CitedText, type CitationContext } from "./CitedText";
import { deriveAuthor, previewRelativeTime } from "./utils";

type Props = {
  headline?: string;
  body: string;
  hashtags?: string[];
  authorHint?: { name?: string; handle?: string; productName?: string; role?: string };
  ctx?: CitationContext;
};

export function LinkedInCard({ headline, body, hashtags = [], authorHint, ctx }: Props) {
  const author = deriveAuthor(authorHint);
  const role = authorHint?.role?.trim() || "Founder";
  return (
    <article
      className="w-full max-w-[600px] rounded-lg border bg-card text-card-foreground shadow-sm"
      style={{ fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif" }}
    >
      <header className="flex items-start gap-3 px-4 pt-4">
        <Avatar seed={author.handle + "-li"} initial={author.initial} size={48} shape="circle" />
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-[15px] leading-tight truncate">
            {author.displayName}
          </div>
          <div className="text-[13px] text-muted-foreground leading-tight truncate">{role}</div>
          <div className="text-[12px] text-muted-foreground mt-0.5 flex items-center gap-1">
            <span>{previewRelativeTime()}</span>
            <span aria-hidden>·</span>
            <Globe />
          </div>
        </div>
      </header>
      <div className="px-4 pt-3 pb-2">
        {headline ? (
          <div className="text-[16px] font-semibold leading-snug mb-2">
            <CitedText text={headline} ctx={ctx} preserveBreaks={false} />
          </div>
        ) : null}
        <div className="text-[14.5px] leading-[1.6] whitespace-pre-wrap break-words text-foreground">
          <CitedText text={body} ctx={ctx} preserveBreaks />
        </div>
        {hashtags.length ? (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {hashtags.map((t) => (
              <span
                key={t}
                className="text-[13px] font-medium text-[#0a66c2] dark:text-[#70b5f9]"
              >
                #{t.replace(/^#/, "")}
              </span>
            ))}
          </div>
        ) : null}
      </div>
      <div className="border-t mt-2 px-2 py-1 flex items-center justify-around text-muted-foreground/70 text-[13px]">
        <Action label="Like" />
        <Action label="Comment" />
        <Action label="Repost" />
        <Action label="Send" />
      </div>
    </article>
  );
}

function Action({ label }: { label: string }) {
  return (
    <button
      type="button"
      disabled
      className="px-3 py-1.5 rounded-md font-medium opacity-90 cursor-default"
    >
      {label}
    </button>
  );
}

function Globe() {
  return (
    <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6}>
      <circle cx={12} cy={12} r={9} />
      <path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
    </svg>
  );
}
