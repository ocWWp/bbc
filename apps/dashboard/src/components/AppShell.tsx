"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

/**
 * Wraps the in-app pages with the 5-route nav. Chromeless routes (landing +
 * auth) bypass the shell entirely.
 *
 * Nav is full-bleed sticky; page contents render in their own `.container` /
 * `.container-narrow`, so the shell does not impose a max-width wrapper.
 */
export function AppShell({ nav, children }: { nav: ReactNode; children: ReactNode }) {
  const pathname = usePathname() || "";
  const chromeless =
    pathname === "/landing" ||
    pathname.startsWith("/landing/") ||
    pathname.startsWith("/auth/") ||
    pathname === "/welcome";

  if (chromeless) {
    return <>{children}</>;
  }

  return (
    <>
      {nav}
      <main>{children}</main>
    </>
  );
}
