"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

type Mode = "signin" | "signup" | "reset";

export function SignInForm({ callbackUrl, hasError = false }: { callbackUrl: string; hasError?: boolean }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  useEffect(() => {
    const e = searchParams.get("email");
    if (e) setEmail(e);
    const source = searchParams.get("source");
    if (source === "invite") {
      setMode("signup");
      setMessage({
        kind: "ok",
        text: "Welcome — you've been invited. Set a password to create your account.",
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const supabase = getSupabaseBrowserClient();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    startTransition(async () => {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) {
          setMessage({ kind: "err", text: humanizeError(error.message) });
          return;
        }
        router.push(callbackUrl);
        router.refresh();
      } else if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email, password,
          options: {
            emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(callbackUrl)}`,
          },
        });
        if (error) {
          setMessage({ kind: "err", text: humanizeError(error.message) });
          return;
        }
        setMessage({
          kind: "ok",
          text: "Check your email to confirm your account, then sign in.",
        });
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(callbackUrl)}`,
        });
        if (error) {
          setMessage({ kind: "err", text: humanizeError(error.message) });
          return;
        }
        setMessage({ kind: "ok", text: "Reset link sent. Check your email." });
      }
    });
  }

  const ctaLabel =
    pending ? "…"
    : mode === "signin" ? "sign in"
    : mode === "signup" ? "create account"
    : "send reset link";

  return (
    <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div className="field">
        <label className="field-label">
          <span>email</span>
          {mode === "reset" && (
            <button type="button" className="helper-link" onClick={() => setMode("signin")}>back to sign in</button>
          )}
        </label>
        <input
          className={"field-input mono" + (hasError || message?.kind === "err" ? " is-error" : "")}
          type="email" required
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
        />
      </div>

      {mode !== "reset" && (
        <div className="field">
          <label className="field-label">
            <span>password</span>
            <button type="button" className="helper-link" onClick={() => setMode("reset")}>forgot?</button>
          </label>
          <input
            className={"field-input mono" + (hasError || message?.kind === "err" ? " is-error" : "")}
            type="password" required minLength={8}
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
          />
        </div>
      )}

      <button className="btn-submit" type="submit" disabled={pending}>
        {ctaLabel}
        {!pending && (
          <svg viewBox="0 0 14 14" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <line x1="2.5" y1="7" x2="11.5" y2="7" />
            <polyline points="8,3.5 11.5,7 8,10.5" />
          </svg>
        )}
      </button>

      {message && (
        <div className={`auth-banner ${message.kind === "ok" ? "is-ok" : "is-invalid-credentials"}`}>
          <span className="gap" />
          <div className="auth-banner-body">
            <span className="auth-banner-msg">{message.text}</span>
          </div>
        </div>
      )}

      {mode === "signin" && (
        <div style={{ fontFamily: "var(--font-geist-mono), monospace", fontSize: 11, color: "var(--paper-muted)", textAlign: "center" }}>
          new here?{" "}
          <button type="button" onClick={() => setMode("signup")} style={{ background: "none", border: "none", color: "var(--paper-ink)", cursor: "pointer", textDecoration: "underline", textUnderlineOffset: 2, font: "inherit" }}>
            create an account
          </button>
        </div>
      )}
    </form>
  );
}

function humanizeError(msg: string): string {
  const m = msg.toLowerCase();
  if (m.includes("not_invited")) {
    return "You haven't been invited to this dashboard. Ask the admin to send you an invitation.";
  }
  if (m.includes("invalid login credentials")) return "Wrong email or password.";
  if (m.includes("user already registered")) {
    return "An account with that email already exists. Try signing in.";
  }
  if (m.includes("email not confirmed")) {
    return "Confirm your email first — check your inbox.";
  }
  return msg;
}
