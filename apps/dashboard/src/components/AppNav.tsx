"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useTheme } from "next-themes";

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
const STUDIO_ROUTE: Route = {
  key: "studio",
  label: "Studio",
  href: "/studio",
  match: (p) => p === "/studio" || p.startsWith("/studio/"),
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
const BRAIN_ROUTE: Route = {
  key: "brain",
  label: "Brain",
  href: "/brain",
  match: (p) => p === "/brain" || p.startsWith("/brain/"),
};
const INBOX_ROUTE: Route = {
  key: "inbox",
  label: "Inbox",
  href: "/inbox",
  match: (p) => p === "/inbox" || p.startsWith("/inbox/"),
  badge: "unread",
};

const ADMIN_ROUTES: ReadonlyArray<Route> = [
  HOME_ROUTE,
  STUDIO_ROUTE,
  MEMORY_ROUTE,
  QUEUE_ROUTE,
  LIBRARY_ROUTE,
  SETTINGS_ROUTE,
];
const OPERATOR_ROUTES: ReadonlyArray<Route> = [
  STUDIO_ROUTE,
  MEMORY_ROUTE,
  QUEUE_ROUTE,
  LIBRARY_ROUTE,
  SETTINGS_ROUTE,
];

function memberRoutes(templateSlug: string | null): ReadonlyArray<Route> {
  const slug = (templateSlug ?? "marketing").toLowerCase();
  const studio: Route = {
    ...STUDIO_ROUTE,
    href: `/studio/${slug}`,
    match: (p) => p === `/studio/${slug}` || p.startsWith(`/studio/${slug}/`),
  };
  return [studio, BRAIN_ROUTE, INBOX_ROUTE];
}

function routesForRole(role: string | null, templateSlug: string | null): ReadonlyArray<Route> {
  switch (role) {
    case "admin":
      return ADMIN_ROUTES;
    case "operator":
      return OPERATOR_ROUTES;
    case "member":
    case "viewer":
      return memberRoutes(templateSlug);
    default:
      // Unauth (workspace null). Real users get redirected by middleware
      // before clicking — show the admin shape so the sign-in path stays
      // accessible from the brand link / search.
      return ADMIN_ROUTES;
  }
}

type AppNavProps = {
  pendingCount: number;
  user: { label: string; avatar: string | null; initial: string } | null;
  workspace: { name: string; role: string; templateSlug: string | null } | null;
};

export function AppNav({ pendingCount, user, workspace }: AppNavProps) {
  const pathname = usePathname() || "";
  const routes = routesForRole(workspace?.role ?? null, workspace?.templateSlug ?? null);

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
