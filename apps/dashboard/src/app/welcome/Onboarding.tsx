"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { extractMemoryProposals, bulkAcceptProposals } from "./actions";
import type { Proposal } from "@/lib/memory/extractor/types";
import { DumpStep } from "./_steps/dump-step";
import { ExtractingStep } from "./_steps/extracting-step";
import { ReviewStep } from "./_steps/review-step";
import { DoneStep } from "./_steps/done-step";

const SKIP_KEY = "bbc.welcome.skipped";

type Phase = "dump" | "extracting" | "review" | "done";

const phaseOrder: Phase[] = ["dump", "extracting", "review", "done"];

export function Onboarding({ tenantSlug }: { tenantSlug: string }) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("dump");
  const [text, setText] = useState("");
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ count: number; firstId: string | null }>({ count: 0, firstId: null });
  const [, startTransition] = useTransition();

  function skip() {
    try {
      window.localStorage.setItem(SKIP_KEY, "1");
    } catch {/* noop */}
    router.push("/");
  }

  async function onSubmitDump() {
    setError(null);
    setPhase("extracting");
    startTransition(async () => {
      const res = await extractMemoryProposals(text);
      if (!res.ok) {
        setError(res.error);
        setPhase("dump");
        return;
      }
      if (res.proposals.length === 0) {
        setError("We couldn't find any structured items in that. Try adding specifics about your voice, team, or product.");
        setPhase("dump");
        return;
      }
      setProposals(res.proposals);
      setPhase("review");
    });
  }

  async function onAcceptAll(final: Proposal[]) {
    setError(null);
    const res = await bulkAcceptProposals(final);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setCreated({ count: res.created, firstId: res.firstId });
    setPhase("done");
  }

  const stepIndex = phase === "extracting" ? 0 : phaseOrder.indexOf(phase);
  const segments = stepIndex >= 2 ? 3 : phase === "extracting" ? 1.5 : stepIndex + 1;

  return (
    <main className="-mt-6 min-h-[calc(100vh-3rem)]">
      <div className="mx-auto max-w-2xl px-6 pb-16 pt-8">
        <header className="flex items-center justify-between gap-4 pb-10">
          <Link href="/" className="text-sm font-medium tracking-tight text-foreground">
            bbc
          </Link>
          <button
            type="button"
            onClick={skip}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Skip onboarding →
          </button>
        </header>

        <ProgressBar value={segments / 3} />

        <div className="mt-10 min-h-[28rem]">
          <AnimatePresence mode="wait">
            {phase === "dump" && (
              <motion.div
                key="dump"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.25, ease: [0.2, 0, 0, 1] }}
              >
                <DumpStep
                  value={text}
                  onChange={setText}
                  onSubmit={onSubmitDump}
                  error={error}
                />
              </motion.div>
            )}

            {phase === "extracting" && (
              <motion.div
                key="extracting"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
              >
                <ExtractingStep />
              </motion.div>
            )}

            {phase === "review" && (
              <motion.div
                key="review"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.3, ease: [0.2, 0, 0, 1] }}
              >
                <ReviewStep
                  proposals={proposals}
                  onAcceptAll={onAcceptAll}
                  onBack={() => setPhase("dump")}
                  error={error}
                />
              </motion.div>
            )}

            {phase === "done" && (
              <motion.div
                key="done"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, ease: [0.2, 0, 0, 1] }}
              >
                <DoneStep count={created.count} firstId={created.firstId} tenantSlug={tenantSlug} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </main>
  );
}

function ProgressBar({ value }: { value: number }) {
  const clamped = Math.max(0, Math.min(1, value));
  return (
    <div className="flex gap-1.5">
      {[0, 1, 2].map((i) => {
        const segmentProgress = Math.max(0, Math.min(1, clamped * 3 - i));
        return (
          <div key={i} className="h-1 flex-1 overflow-hidden rounded-full bg-muted">
            <motion.div
              initial={false}
              animate={{ width: `${segmentProgress * 100}%` }}
              transition={{ duration: 0.45, ease: [0.2, 0, 0, 1] }}
              className="h-full bg-brain-accent"
            />
          </div>
        );
      })}
    </div>
  );
}
