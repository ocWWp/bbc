"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

type Mode = "signin" | "signup" | "reset";

export function SignInForm({ callbackUrl }: { callbackUrl: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

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
          email,
          password,
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

  return (
    <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <input
        type="email"
        required
        placeholder="you@example.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        autoComplete="email"
      />
      {mode !== "reset" && (
        <input
          type="password"
          required
          minLength={8}
          placeholder="password (min 8)"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete={mode === "signup" ? "new-password" : "current-password"}
        />
      )}

      <button className="btn primary" type="submit" disabled={pending}>
        {pending
          ? "..."
          : mode === "signin"
            ? "Sign in"
            : mode === "signup"
              ? "Create account"
              : "Send reset link"}
      </button>

      {message && (
        <div
          className={message.kind === "ok" ? "banner ok" : "banner warn"}
          style={{ marginTop: 8 }}
        >
          {message.text}
        </div>
      )}

      <div className="mono-sm" style={{ display: "flex", justifyContent: "space-between", marginTop: 8 }}>
        {mode !== "signin" ? (
          <button type="button" className="link" onClick={() => setMode("signin")}>sign in</button>
        ) : <span />}
        {mode !== "signup" ? (
          <button type="button" className="link" onClick={() => setMode("signup")}>sign up</button>
        ) : <span />}
        {mode !== "reset" ? (
          <button type="button" className="link" onClick={() => setMode("reset")}>forgot password</button>
        ) : <span />}
      </div>
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
