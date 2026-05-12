"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

export function SelfServeForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [tenantName, setTenantName] = useState("");
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    startTransition(async () => {
      const res = await fetch("/api/auth/self-serve-signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, tenant_name: tenantName }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string; message?: string };
      if (!res.ok || !json.ok) {
        setMessage({ kind: "err", text: json.error ?? "Signup failed." });
        return;
      }
      // Try to sign in immediately. Succeeds when BBC_SIGNUP_AUTOCONFIRM=true
      // (no email-confirm gate); fails harmlessly otherwise — surface the
      // "check your email" message in that case.
      const sb = getSupabaseBrowserClient();
      const { error: signInErr } = await sb.auth.signInWithPassword({ email, password });
      if (!signInErr) {
        router.push("/");
        return;
      }
      setMessage({
        kind: "ok",
        text: json.message ?? "Tenant created. Check your email to confirm, then sign in.",
      });
    });
  }

  return (
    <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div className="field">
        <label className="field-label"><span>workspace name</span></label>
        <input
          className="field-input"
          type="text" required minLength={2}
          placeholder="Acme Co"
          value={tenantName}
          onChange={(e) => setTenantName(e.target.value)}
        />
      </div>

      <div className="field">
        <label className="field-label"><span>email</span></label>
        <input
          className={"field-input mono" + (message?.kind === "err" ? " is-error" : "")}
          type="email" required
          placeholder="you@yourdomain.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
        />
      </div>

      <div className="field">
        <label className="field-label">
          <span>password</span>
          <span className="helper">8+ chars · we never log it</span>
        </label>
        <input
          className={"field-input mono" + (message?.kind === "err" ? " is-error" : "")}
          type="password" required minLength={8}
          placeholder="••••••••"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
        />
      </div>

      <button className="btn-submit" type="submit" disabled={pending}>
        {pending ? "creating tenant…" : "create workspace"}
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
    </form>
  );
}
