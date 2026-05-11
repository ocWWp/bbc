import type { Supertag } from "@/lib/memory/types";
import { cn } from "@/lib/utils";

const styles: Record<Supertag, string> = {
  voice:    "bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300 ring-rose-200/60 dark:ring-rose-900/40",
  decision: "bg-lime-100 text-lime-800 dark:bg-lime-950/60 dark:text-lime-300 ring-lime-200/60 dark:ring-lime-900/40",
  glossary: "bg-violet-100 text-violet-800 dark:bg-violet-950/60 dark:text-violet-300 ring-violet-200/60 dark:ring-violet-900/40",
  vendor:   "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 ring-amber-200/60 dark:ring-amber-900/40",
  product:  "bg-sky-100 text-sky-800 dark:bg-sky-950/60 dark:text-sky-300 ring-sky-200/60 dark:ring-sky-900/40",
  team:     "bg-pink-100 text-pink-800 dark:bg-pink-950/60 dark:text-pink-300 ring-pink-200/60 dark:ring-pink-900/40",
  skill:    "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 ring-emerald-200/60 dark:ring-emerald-900/40",
};

const sizes = {
  xs: "text-[10px] px-1.5 py-0.5 tracking-wide",
  sm: "text-xs px-2 py-0.5 tracking-wide",
  md: "text-sm px-2.5 py-1",
};

export function TypeChip({
  type,
  size = "sm",
  className,
}: {
  type: Supertag;
  size?: keyof typeof sizes;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full font-medium uppercase ring-1 ring-inset transition-colors",
        styles[type],
        sizes[size],
        className,
      )}
    >
      {type}
    </span>
  );
}
