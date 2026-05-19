"use client";

import * as React from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

const STORAGE_KEY = "bbc-cookie-consent";

export function CookieBanner() {
  const [visible, setVisible] = React.useState(false);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) setVisible(true);
  }, []);

  const decide = (value: "accept" | "reject") => {
    localStorage.setItem(STORAGE_KEY, value);
    window.dispatchEvent(new CustomEvent("bbc-cookie-consent", { detail: value }));
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-label="Cookie preferences"
      // Top-anchored toast positioned below the app nav (~56px tall).
      // Bottom placement covered the /home composer (z-50 banner over z-10
      // composer); top lets the banner stay visible without blocking the
      // composer OR the nav.
      className="fixed inset-x-4 top-16 z-50 mx-auto max-w-2xl rounded-lg border border-border bg-card p-4 shadow-lg"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-foreground">
          We use a session cookie to keep you signed in and an optional analytics cookie to improve BBC.{" "}
          <Link href="/privacy" className="underline">Privacy policy</Link>.
        </p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => decide("reject")}>Reject</Button>
          <Button variant="default" size="sm" onClick={() => decide("accept")}>Accept</Button>
        </div>
      </div>
    </div>
  );
}

export function useCookieConsent() {
  const [consent, setConsent] = React.useState<"accept" | "reject" | null>(null);
  React.useEffect(() => {
    if (typeof window === "undefined") return;
    setConsent(localStorage.getItem(STORAGE_KEY) as "accept" | "reject" | null);
    const handler = (e: Event) => setConsent((e as CustomEvent).detail);
    window.addEventListener("bbc-cookie-consent", handler);
    return () => window.removeEventListener("bbc-cookie-consent", handler);
  }, []);
  return consent;
}
