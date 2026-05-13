"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useTheme } from "next-themes";

const ROUTES = [
  { key: "studio",  label: "Studio",  href: "/studio",  match: (p: string) => p === "/studio"  || p.startsWith("/studio/") },
  { key: "memory",  label: "Memory",  href: "/memory",  match: (p: string) => p === "/memory"  || p.startsWith("/memory/") || p === "/sources" || p.startsWith("/sources/") },
  { key: "queue",   label: "Queue",   href: "/queue",   match: (p: string) => p === "/"        || p === "/queue"   || p.startsWith("/queue/") },
  { key: "library", label: "Library", href: "/library", match: (p: string) => p === "/library" || p.startsWith("/library/") || p === "/marketplace" || p.startsWith("/marketplace/") },
] as const;

type AppNavProps = {
  pendingCount: number;
  user: { label: string; avatar: string | null; initial: string } | null;
  workspace: { name: string; role: string; templateSlug: string | null } | null;
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
                href={r.href}
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
          {user ? (
            <AvatarMenu user={user} />
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

function AvatarMenu({ user }: { user: NonNullable<AppNavProps["user"]> }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const { theme, setTheme } = useTheme();

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="avatar-menu" ref={wrapRef}>
      <button
        type="button"
        className="app-avatar"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        title={user.label}
      >
        {user.avatar ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={user.avatar} alt="" />
        ) : (
          user.initial
        )}
      </button>
      {open && (
        <div className="avatar-menu-pop" role="menu">
          <div className="avatar-menu-id">
            <div className="nm">{user.label}</div>
          </div>
          <Link
            href="/settings"
            className="avatar-menu-item"
            role="menuitem"
            onClick={() => setOpen(false)}
          >
            <span>Settings</span>
            <span className="mono hint">/settings</span>
          </Link>
          <Link
            href="/settings/keys"
            className="avatar-menu-item"
            role="menuitem"
            onClick={() => setOpen(false)}
          >
            <span>API keys</span>
            <span className="mono hint">/settings/keys</span>
          </Link>
          <div className="avatar-menu-sep" role="separator" />
          <div className="avatar-menu-theme" role="group" aria-label="Theme">
            <span className="lab">Theme</span>
            <div className="theme-seg">
              {(["light", "dark", "system"] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  className={`theme-seg-btn ${theme === v ? "is-on" : ""}`}
                  onClick={() => setTheme(v)}
                  aria-pressed={theme === v}
                >
                  {v}
                </button>
              ))}
            </div>
          </div>
          <div className="avatar-menu-sep" role="separator" />
          <form action="/auth/signout" method="post">
            <button type="submit" className="avatar-menu-item is-danger" role="menuitem">
              <span>Sign out</span>
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
