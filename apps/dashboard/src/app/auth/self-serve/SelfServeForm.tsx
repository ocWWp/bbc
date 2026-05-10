"use client";

import { useState, useTransition } from "react";

export function SelfServeForm() {
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
      setMessage({
        kind: "ok",
        text: json.message ?? "Tenant created. Check your email to confirm, then sign in.",
      });
    });
  }

  return (
    <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <input
        type="text"
        required
        placeholder="Tenant name (e.g., Acme Co)"
        value={tenantName}
        onChange={(e) => setTenantName(e.target.value)}
        minLength={2}
      />
      <input
        type="email"
        required
        placeholder="you@yourdomain.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        autoComplete="email"
      />
      <input
        type="password"
        required
        minLength={8}
        placeholder="password (min 8)"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        autoComplete="new-password"
      />
      <button className="btn primary" type="submit" disabled={pending}>
        {pending ? "Creating tenant…" : "Create tenant + sign up"}
      </button>
      {message && (
        <div
          className={message.kind === "ok" ? "banner ok" : "banner warn"}
          style={{ marginTop: 8 }}
        >
          {message.text}
        </div>
      )}
    </form>
  );
}
