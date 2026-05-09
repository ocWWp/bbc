"use client";

import { useState, useTransition } from "react";
import { acceptProposal, rejectProposal } from "@/app/queue/actions";

type Props = { id: string; canAccept: boolean };

export default function ActionButtons({ id, canAccept }: Props) {
  const [pending, startTransition] = useTransition();
  const [output, setOutput] = useState<string | null>(null);
  const [showRejectInput, setShowRejectInput] = useState(false);
  const [reason, setReason] = useState("");

  const onAccept = () => {
    startTransition(async () => {
      const fd = new FormData();
      fd.set("id", id);
      const res = await acceptProposal(fd);
      setOutput(`${res.ok ? "✓ accepted" : "✗ accept failed"}\n\n${res.output}`);
    });
  };

  const onReject = () => {
    if (!reason.trim()) {
      setOutput("✗ reason required");
      return;
    }
    startTransition(async () => {
      const fd = new FormData();
      fd.set("id", id);
      fd.set("reason", reason);
      const res = await rejectProposal(fd);
      setOutput(`${res.ok ? "✓ rejected" : "✗ reject failed"}\n\n${res.output}`);
      if (res.ok) {
        setShowRejectInput(false);
        setReason("");
      }
    });
  };

  return (
    <div>
      <div className="actions">
        <button
          className="btn primary"
          onClick={onAccept}
          disabled={!canAccept || pending}
          title={canAccept ? "" : "Manager review verdict must be 'approved' first"}
        >
          {pending ? "…" : "Accept"}
        </button>
        <button
          className="btn danger"
          onClick={() => setShowRejectInput((v) => !v)}
          disabled={pending}
        >
          Reject
        </button>
      </div>
      {showRejectInput && (
        <div className="actions" style={{ marginTop: 8 }}>
          <input
            type="text"
            placeholder="reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            disabled={pending}
          />
          <button className="btn danger" onClick={onReject} disabled={pending || !reason.trim()}>
            confirm reject
          </button>
        </div>
      )}
      {output && <pre style={{ marginTop: 8 }}>{output}</pre>}
    </div>
  );
}
