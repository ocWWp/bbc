"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/memory",  label: "Memory",  match: (p: string) => p === "/memory"  || p.startsWith("/memory/") },
  { href: "/sources", label: "Sources", match: (p: string) => p === "/sources" || p.startsWith("/sources/") },
] as const;

export function MemoryTabs() {
  const pathname = usePathname() || "";
  return (
    <div className="tabs" role="tablist" aria-label="memory sections" style={{ marginBottom: 22 }}>
      {TABS.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          role="tab"
          aria-selected={t.match(pathname)}
          className={t.match(pathname) ? "is-active" : ""}
        >
          {t.label}
        </Link>
      ))}
    </div>
  );
}
