// Shared helpers for the preview cards. Pure, no React.

/**
 * Deterministic hash → hsl. Used to seed the avatar gradient so the same
 * brain context produces the same avatar across runs. Falls back to a neutral
 * pair when seed is empty.
 */
export function avatarGradient(seed: string): { from: string; to: string } {
  if (!seed) return { from: "hsl(220 14% 65%)", to: "hsl(220 14% 45%)" };
  let h = 0;
  for (let i = 0; i < seed.length; i += 1) {
    h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  }
  const hue1 = h % 360;
  const hue2 = (hue1 + 40) % 360;
  return {
    from: `hsl(${hue1} 75% 60%)`,
    to: `hsl(${hue2} 70% 45%)`,
  };
}

/**
 * X imposes a 280-char limit but counts each URL as 23 chars regardless of
 * length. We approximate that for the preview char counter.
 */
const X_URL_WEIGHT = 23;
const X_URL_RE = /https?:\/\/\S+/g;

export function xCharCount(text: string): number {
  let total = 0;
  let lastIndex = 0;
  for (const match of text.matchAll(X_URL_RE)) {
    total += match.index! - lastIndex; // chars before this URL
    total += X_URL_WEIGHT;
    lastIndex = match.index! + match[0].length;
  }
  total += text.length - lastIndex;
  return total;
}

/**
 * Compact relative-time string. Real platforms show "12m" "3h" "May 11".
 * For the preview we always show "now" -- the post hasn't been published.
 */
export function previewRelativeTime(): string {
  return "now";
}

/**
 * The brain context summary the cards consume for avatar + author name. We
 * derive a one-line "author identity" from the founder's product memory rather
 * than scraping a logo. v1 favors not-impersonating-real-platforms.
 */
export type AuthorIdentity = {
  displayName: string;
  handle: string;
  initial: string;
};

export function deriveAuthor(
  // Optional founder name from team memory; if absent we use a generic.
  hint?: { name?: string; handle?: string; productName?: string },
): AuthorIdentity {
  const name = hint?.name?.trim() || hint?.productName?.trim() || "Your draft";
  const handle =
    hint?.handle?.replace(/^@/, "").trim() ||
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "")
      .slice(0, 14) ||
    "draft";
  return {
    displayName: name,
    handle,
    initial: name.charAt(0).toUpperCase() || "•",
  };
}
