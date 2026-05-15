"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { seedDemoBrain } from "../actions";

/**
 * Subtle escape hatch on the welcome dump-step. If the user isn't ready to
 * paste a real brain dump, one click seeds 11 demo memories (product, voice,
 * 4 decisions, 3 vendors, 2 team) so Studios + MCP have something to work
 * with immediately. Redirects to /studio on success.
 *
 * Server-side gate: refuses to seed if the tenant already has any memory.
 */
export function SeedDemoBrainButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const onClick = () => {
    setError(null);
    startTransition(async () => {
      const r = await seedDemoBrain();
      if (!r.ok) {
        setError(r.error);
        return;
      }
      router.push("/home");
    });
  };

  return (
    <div className="text-[13px] text-muted-foreground">
      <span>Not ready? </span>
      <button
        type="button"
        onClick={onClick}
        disabled={pending}
        className="text-foreground underline-offset-2 hover:underline disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {pending ? "Seeding demo brain…" : "Try the demo brain instead →"}
      </button>
      {error && (
        <p className="mt-1 text-[12px] text-red-500">{error}</p>
      )}
    </div>
  );
}
