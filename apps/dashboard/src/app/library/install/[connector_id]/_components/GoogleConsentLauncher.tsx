"use client";

/**
 * GoogleConsentLauncher — client component that wraps the startGoogleOAuth
 * server action (Task 13) in a single-button form. The action either:
 *
 *   - redirects to Google's consent screen on success (the server action
 *     throws NEXT_REDIRECT, which Next.js handles transparently — we never
 *     see an `{ok: true}` value here), or
 *   - returns `{ok: false, error}` if Google OAuth isn't configured or the
 *     caller isn't an admin; we render the error inline.
 *
 * `appVerified` is computed server-side (env access doesn't work in client
 * components) and passed as a prop. When false we surface a "beta —
 * unverified Google app" pill above the button so users know to expect the
 * "Google hasn't verified this app" warning on the consent screen.
 */

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import {
  startGoogleOAuth,
  type StartGoogleOAuthResult,
} from "../../_actions";

type FormState = StartGoogleOAuthResult | null;

async function action(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  // startGoogleOAuth either redirects (throws NEXT_REDIRECT) or returns
  // {ok: false, error}. The redirect throw is rethrown by Next.js to
  // perform navigation; we only ever observe the error case here.
  return await startGoogleOAuth(formData);
}

export function GoogleConsentLauncher({ appVerified }: { appVerified: boolean }) {
  const [state, formAction, isPending] = useActionState<FormState, FormData>(
    action,
    null,
  );

  const error = state && !state.ok ? state.error : null;

  return (
    <div className="container page" style={{ maxWidth: 640 }}>
      <header className="page-head" style={{ marginBottom: 24 }}>
        <h1 className="page-title">Install Google</h1>
        <p className="page-blurb">
          Connect your Google account so BBC can read Gmail and Drive on your
          behalf. BBC stores Google&apos;s refresh token encrypted per-tenant
          and never sees your password.
        </p>
      </header>

      <div className="card card-pad" style={{ display: "grid", gap: 16 }}>
        {!appVerified ? (
          <div
            role="status"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "8px 12px",
              borderRadius: 6,
              background: "var(--warning-bg, #fef3c7)",
              color: "var(--warning-fg, #92400e)",
              fontSize: 13,
              fontWeight: 500,
              alignSelf: "flex-start",
            }}
          >
            <span
              aria-hidden="true"
              style={{
                display: "inline-block",
                padding: "2px 6px",
                borderRadius: 4,
                background: "var(--warning-fg, #92400e)",
                color: "var(--warning-bg, #fef3c7)",
                fontSize: 11,
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: 0.5,
              }}
            >
              Beta
            </span>
            <span>
              Google hasn&apos;t verified this app yet — you&apos;ll see an
              &ldquo;unverified app&rdquo; warning on the next screen. Click{" "}
              <strong>Advanced</strong> &rarr; <strong>Go to BBC (unsafe)</strong>{" "}
              to continue.
            </span>
          </div>
        ) : null}

        <div>
          <p style={{ margin: "0 0 8px", fontSize: 13, fontWeight: 500 }}>
            BBC will request these scopes:
          </p>
          <ul
            style={{
              margin: 0,
              paddingLeft: 20,
              fontSize: 13,
              color: "var(--muted-fg, #525252)",
              display: "grid",
              gap: 4,
            }}
          >
            <li>
              <strong>Gmail</strong> — read-only access to messages and threads
            </li>
            <li>
              <strong>Drive</strong> — read-only access to file contents
            </li>
            <li>
              <strong>Drive metadata</strong> — read-only access to folder
              structure (needed to map folders to BBC ingest)
            </li>
          </ul>
        </div>

        <form action={formAction}>
          {error ? (
            <div
              role="alert"
              style={{
                fontSize: 14,
                color: "var(--destructive, #dc2626)",
                marginBottom: 12,
              }}
            >
              {error}
            </div>
          ) : null}

          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <Button type="submit" variant="default" disabled={isPending}>
              {isPending ? "Connecting…" : "Connect Google"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
