"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

/**
 * Wraps page chrome (dashboard Nav, max-width container) and bails out on
 * routes that need full-bleed layouts of their own — currently the public
 * /landing marketing page. Add other "chromeless" routes here as they appear.
 */
export function AppShell({ nav, children }: { nav: ReactNode; children: ReactNode }) {
  const pathname = usePathname() || "";
  const chromeless = pathname === "/landing" || pathname.startsWith("/landing/");

  if (chromeless) {
    return <>{children}</>;
  }

  return (
    <div className="mx-auto max-w-7xl p-6">
      {nav}
      <main>{children}</main>
    </div>
  );
}
