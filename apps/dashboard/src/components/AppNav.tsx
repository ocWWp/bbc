"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useTheme } from "next-themes";
import { InboxBell } from "./InboxBell";
import { openCommandPalette } from "./command-palette";
import type { InboxItem } from "@/lib/inbox/read-inbox";

type Route = {
  key: string;
  label: string;
  href: string;
  match: (p: string) => boolean;
  badge?: "pending" | "unread";
};

const HOME_ROUTE: Route = {
  key: "home",
  label: "Home",
  href: "/home",
  match: (p) => p === "/home" || p.startsWith("/home/"),
};
const GALLERY_ROUTE: Route = {
  key: "gallery",
  label: "Gallery",
  href: "/gallery",
  match: (p) => p === "/gallery" || p.startsWith("/gallery/"),
};
const MEMORY_ROUTE: Route = {
  key: "memory",
  label: "Memory",
  href: "/memory",
  match: (p) =>
    p === "/memory" || p.startsWith("/memory/") || p === "/sources" || p.startsWith("/sources/"),
};
const QUEUE_ROUTE: Route = {
  key: "queue",
  label: "Queue",
  href: "/queue",
  match: (p) => p === "/" || p === "/queue" || p.startsWith("/queue/"),
  badge: "pending",
};
const LIBRARY_ROUTE: Route = {
  key: "library",
  label: "Library",
  href: "/library",
  match: (p) =>
    p === "/library" || p.startsWith("/library/") || p === "/marketplace" || p.startsWith("/marketplace/"),
};
const SETTINGS_ROUTE: Route = {
  key: "settings",
  label: "Settings",
  href: "/settings",
  match: (p) => p === "/settings" || p.startsWith("/settings/"),
};
const PRIMARY_ROUTES: ReadonlyArray<Route> = [
  HOME_ROUTE,
  GALLERY_ROUTE,
  MEMORY_ROUTE,
  QUEUE_ROUTE,
  LIBRARY_ROUTE,
  SETTINGS_ROUTE,
];
const VIEWER_ROUTES: ReadonlyArray<Route> = [
  HOME_ROUTE,
  GALLERY_ROUTE,
  MEMORY_ROUTE,
  LIBRARY_ROUTE,
];

function routesForRole(role: string | null): ReadonlyArray<Route> {
  return role === "viewer" ? VIEWER_ROUTES : PRIMARY_ROUTES;
}

type AppNavProps = {
  pendingCount: number;
  user: { label: string; avatar: string | null; initial: string } | null;
  workspace: { name: string; role: string; templateSlug: string | null } | null;
  /** Unread from_bbc count for the bell badge. Defaults to 0 when unset. */
  inboxUnread?: number;
  /** Top items for the bell slide-out. Defaults to empty when unset. */
  inboxPreview?: ReadonlyArray<InboxItem>;
};

export function AppNav({
  pendingCount,
  user,
  workspace,
  inboxUnread = 0,
  inboxPreview = [],
}: AppNavProps) {
  const pathname = usePathname() || "";
  const routes = routesForRole(workspace?.role ?? null);

  return (
    <header className="app-nav">
      <div className="container app-nav-inner">
        <Link href="/home" className="brand">
          <span className="brand-mark">bbc</span>
          <span className="brand-word">big brain company</span>
        </Link>

        {workspace && (
          <div className="app-workspace" aria-label="current workspace">
            <span className="ws-dot" />
            <span className="ws-name">{workspace.name}</span>
            <span className="mono" style={{ color: "var(--paper-muted)" }}>/ {workspace.role}</span>
          </div>
        )}

        <nav className="app-routes" aria-label="primary">
          {routes.map((r) => {
            const active = r.match(pathname);
            const showBadge = r.badge === "pending" && pendingCount > 0;
            return (
              <Link
                key={r.key}
                href={r.href}
                className={`app-route ${active ? "is-active" : ""}`}
              >
                {r.label}
                {showBadge ? <span className="badge">{pendingCount}</span> : null}
              </Link>
            );
          })}
        </nav>

        <div className="app-nav-right">
          <button
            type="button"
            className="app-search"
            onClick={openCommandPalette}
            aria-label="Open command palette"
          >
            <span className="placeholder">jump to…</span>
            <span className="kbd">⌘K</span>
          </button>
          {user ? (
            <>
              <InboxBell unreadCount={inboxUnread} preview={inboxPreview} />
              <AvatarMenu user={user} role={workspace?.role ?? null} />
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

function AvatarMenu({
  user,
  role,
}: {
  user: NonNullable<AppNavProps["user"]>;
  role: string | null;
}) {
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
          {role === "admin" && (
            <Link
              href="/dashboard"
              className="avatar-menu-item"
              role="menuitem"
              onClick={() => setOpen(false)}
            >
              <span>Dashboard</span>
              <span className="mono hint">/dashboard</span>
            </Link>
          )}
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
