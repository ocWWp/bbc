"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Settings sub-nav. Three groups (workspace / agents / audit) collapsing the
 * seven absorbed routes (general, team, BBC api-keys, BYO provider keys,
 * bindings, tools, activity log) into one rail. Active state matches on path
 * via `usePathname` — works for both `/settings/*` (rail-visible) and the
 * legacy paths `/team`, `/api-keys`, `/bindings`, `/tools`, `/log` (no rail
 * yet; that's a follow-up migration).
 */
const GROUPS: ReadonlyArray<{
  lab: string;
  items: ReadonlyArray<{ key: string; label: string; href: string; count?: string }>;
}> = [
  {
    lab: "workspace",
    items: [
      { key: "general", label: "General", href: "/settings" },
      { key: "team", label: "Team", href: "/settings/team" },
      { key: "api-keys", label: "BBC API keys", href: "/settings/api-keys" },
      { key: "keys", label: "Provider keys", href: "/settings/keys" },
    ],
  },
  {
    lab: "agents",
    items: [
      { key: "bindings", label: "Bindings", href: "/settings/bindings" },
      { key: "tools", label: "Tools", href: "/settings/tools" },
      { key: "skills", label: "Skills", href: "/settings/skills" },
    ],
  },
  {
    lab: "audit",
    items: [
      { key: "log", label: "Activity log", href: "/settings/log" },
    ],
  },
];

export function SettingsRail() {
  const pathname = usePathname() || "";
  const isActive = (href: string) => {
    if (href === "/settings") return pathname === "/settings";
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  return (
    <div className="rail">
      {GROUPS.map((g) => (
        <div key={g.lab}>
          <div className="rail-eyebrow">{g.lab}</div>
          {g.items.map((it) => (
            <Link
              key={it.key}
              href={it.href}
              className={`rail-item ${isActive(it.href) ? "is-active" : ""}`}
            >
              {it.label}
              {it.count && <span className="count">{it.count}</span>}
            </Link>
          ))}
        </div>
      ))}
    </div>
  );
}
