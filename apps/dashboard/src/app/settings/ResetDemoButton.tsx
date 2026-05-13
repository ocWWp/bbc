"use client";

import { useState, useTransition } from "react";
import { resetDemoTenant } from "./reset-demo-action";

type Props = { disabled?: boolean };

export default function ResetDemoButton({ disabled }: Props) {
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [output, setOutput] = useState<string | null>(null);

  const onReset = () => {
    startTransition(async () => {
      const res = await resetDemoTenant();
      setOutput(res.ok ? `✓ reset to ${res.newTenantId.slice(0, 8)}…` : `✗ ${res.error}`);
      setConfirming(false);
    });
  };

  if (!confirming) {
    return (
      <div>
        <button
          className="btn btn-ghost"
          onClick={() => setConfirming(true)}
          disabled={disabled || pending}
          title={disabled ? "Admin role required" : "Wipe and re-seed the demo fixture"}
        >
          reset to fixture
        </button>
        {output && (
          <pre style={{ marginTop: 8, fontSize: 12, color: "var(--paper-mute)" }}>{output}</pre>
        )}
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <span style={{ fontSize: 12, color: "var(--paper-mute)" }}>
          this deletes all memories, proposals, and connector state in the demo tenant.
        </span>
        <button className="btn danger" onClick={onReset} disabled={pending}>
          {pending ? "resetting…" : "confirm reset"}
        </button>
        <button
          className="btn btn-ghost"
          onClick={() => setConfirming(false)}
          disabled={pending}
        >
          cancel
        </button>
      </div>
      {output && (
        <pre style={{ marginTop: 8, fontSize: 12, color: "var(--paper-mute)" }}>{output}</pre>
      )}
    </div>
  );
}
