"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export function SelfServeForm({ loggedIn, email: initialEmail }: { loggedIn: boolean; email: string }) {
  const router = useRouter();
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState("");
  const [tenantName, setTenantName] = useState("");
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    startTransition(async () => {
      const url = loggedIn ? "/api/auth/create-tenant" : "/api/auth/self-serve-signup";
      const body = loggedIn
        ? { tenant_name: tenantName }
        : { email, password, tenant_name: tenantName };
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string; message?: string };
      if (!res.ok || !json.ok) {
        setMessage({ kind: "err", text: json.error ?? "Operation failed." });
        return;
      }
      setMessage({ kind: "ok", text: json.message ?? "Done." });
      if (loggedIn) {
        // After creating an additional tenant, refresh to surface the new state.
        setTimeout(() => router.push("/team"), 800);
      }
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
      {!loggedIn && (
        <>
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
        </>
      )}
      <button className="btn primary" type="submit" disabled={pending}>
        {pending
          ? loggedIn
            ? "Creating tenant…"
            : "Creating tenant + signing up…"
          : loggedIn
            ? "Create tenant"
            : "Create tenant + sign up"}
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
