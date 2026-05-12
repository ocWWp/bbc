"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ThemeToggle } from "./theme-toggle";

const ROUTES = [
  { key: "studio",   label: "Studio",   match: (p: string) => p === "/studio" || p.startsWith("/studio/") },
  { key: "memory",   label: "Memory",   match: (p: string) => p === "/memory" || p.startsWith("/memory/") || p === "/graph" },
  { key: "queue",    label: "Queue",    match: (p: string) => p === "/" || p === "/queue" || p.startsWith("/queue/") },
  { key: "sources",  label: "Sources",  match: (p: string) => p === "/sources" || p.startsWith("/sources/") || p === "/skills" || p === "/bindings" },
  { key: "settings", label: "Settings", match: (p: string) => p === "/settings" || p.startsWith("/settings/") || p === "/team" || p === "/api-keys" || p === "/tools" || p === "/log" },
] as const;

const HREFS: Record<string, string> = {
  studio: "/studio",
  memory: "/memory",
  queue: "/queue",
  sources: "/sources",
  settings: "/settings",
};

type AppNavProps = {
  pendingCount: number;
  user: { label: string; avatar: string | null; initial: string } | null;
  workspace: { name: string; role: string } | null;
};

export function AppNav({ pendingCount, user, workspace }: AppNavProps) {
  const pathname = usePathname() || "";

  return (
    <header className="app-nav">
      <div className="container app-nav-inner">
        <Link href="/queue" className="brand">
          <span className="brand-mark">bbc</span>
          <span className="brand-word">big brain company</span>
        </Link>

        {workspace && (
          <button className="app-workspace" type="button" aria-label="switch workspace">
            <span className="ws-dot" />
            <span className="ws-name">{workspace.name}</span>
            <span className="mono" style={{ color: "var(--paper-muted)" }}>/ {workspace.role}</span>
            <span className="ws-caret">▾</span>
          </button>
        )}

        <nav className="app-routes" aria-label="primary">
          {ROUTES.map((r) => {
            const active = r.match(pathname);
            return (
              <Link
                key={r.key}
                href={HREFS[r.key]}
                className={`app-route ${active ? "is-active" : ""}`}
              >
                {r.label}
                {r.key === "queue" && pendingCount > 0 ? (
                  <span className="badge">{pendingCount}</span>
                ) : null}
              </Link>
            );
          })}
        </nav>

        <div className="app-nav-right">
          <div className="app-search" aria-hidden>
            <span className="placeholder">search memory…</span>
            <span className="kbd">⌘K</span>
          </div>
          <ThemeToggle />
          {user ? (
            <>
              <Link href="/settings/keys" className="app-avatar" title={user.label}>
                {user.avatar ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={user.avatar} alt="" />
                ) : (
                  user.initial
                )}
              </Link>
              <form action="/auth/signout" method="post">
                <button type="submit" className="btn btn-ghost" style={{ height: 28, padding: "0 10px", fontSize: 12 }}>
                  sign out
                </button>
              </form>
            </>
          ) : (
            <Link href="/auth/signin" className="btn btn-ghost" style={{ height: 28, padding: "0 12px", fontSize: 12 }}>
              sign in
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
