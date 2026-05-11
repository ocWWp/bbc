"use client";

import * as React from "react";
import posthog from "posthog-js";
import { PostHogProvider as PHProvider } from "posthog-js/react";
import { useCookieConsent } from "@/components/cookie-banner";

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  const consent = useCookieConsent();
  const [initialized, setInitialized] = React.useState(false);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    if (consent !== "accept") return;
    if (initialized) return;

    const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
    const host = process.env.NEXT_PUBLIC_POSTHOG_HOST;
    if (!key || !host) return;

    posthog.init(key, {
      api_host: host,
      capture_pageview: "history_change",
      autocapture: false,
      disable_session_recording: false,
      person_profiles: "identified_only",
    });
    setInitialized(true);
  }, [consent, initialized]);

  if (!initialized) return <>{children}</>;
  return <PHProvider client={posthog}>{children}</PHProvider>;
}
