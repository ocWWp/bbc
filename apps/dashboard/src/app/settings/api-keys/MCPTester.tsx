"use client";

import { useState } from "react";

type Result =
  | { kind: "idle" }
  | { kind: "running" }
  | { kind: "ok"; tools: Array<{ name: string; description?: string }> }
  | { kind: "fail"; message: string };

export default function MCPTester({
  token,
  endpoint,
}: {
  token: string;
  endpoint: string;
}) {
  const [result, setResult] = useState<Result>({ kind: "idle" });

  const test = async () => {
    setResult({ kind: "running" });
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "tools/list",
        }),
      });
      const body = await res.json();
      if (body.error) {
        setResult({
          kind: "fail",
          message: `${body.error.code}: ${body.error.message}`,
        });
        return;
      }
      const tools = body.result?.tools ?? [];
      setResult({ kind: "ok", tools });
    } catch (e) {
      const m = e instanceof Error ? e.message : "unknown";
      setResult({ kind: "fail", message: m });
    }
  };

  return (
    <div style={{ marginTop: 12 }}>
      <button
        type="button"
        onClick={test}
        className="btn"
        disabled={result.kind === "running"}
      >
        {result.kind === "running" ? "Testing…" : "Test MCP connection"}
      </button>

      {result.kind === "ok" && (
        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 13, color: "#0a0", fontWeight: 600 }}>
            ✓ Authenticated. Server lists {result.tools.length} tools:
          </div>
          <ul style={{ margin: "8px 0 0 18px", fontSize: 12 }}>
            {result.tools.map((t) => (
              <li key={t.name}>
                <code>{t.name}</code>
                {t.description ? ` — ${t.description.split(".")[0]}.` : ""}
              </li>
            ))}
          </ul>
        </div>
      )}

      {result.kind === "fail" && (
        <div
          style={{
            marginTop: 12,
            padding: 8,
            background: "#fee",
            border: "1px solid #c00",
            fontSize: 13,
          }}
        >
          Failed: {result.message}
        </div>
      )}
    </div>
  );
}
