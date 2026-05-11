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

const MOCK_PROPOSALS: Proposal[] = [
  {
    type: "product",
    title: "Developer tools for AI-native founders",
    fields: { positioning: "Memory layer for AI agents", target_user: "Early-stage AI founders", competitors: ["Mem0", "Letta"], differentiators: ["Typed supertags", "Auditable proposal queue"] },
    body: "We're building a shared brain for founders and the AI agents working on their product.",
  },
  {
    type: "voice",
    title: "Direct, lowercase, no jargon",
    fields: { register: "casual", do_words: ["ship", "compound", "durable"], dont_words: ["leverage", "synergy", "seamless"], example_phrases: ["this is the shape", "what would 10x feel like"] },
    body: "Our voice is direct and lowercase. We never use the word 'leverage' or 'synergy'.",
  },
  {
    type: "decision",
    title: "SaaS-only, no on-prem",
    fields: { status: "accepted", date: "2026-05-01", context: "Repeated asks for self-hosted on-prem from enterprise prospects.", decision: "Stay SaaS-only for v1.0. Revisit at $1M ARR.", consequences: "Easier to ship, lose 2-3 enterprise leads. Acceptable cost for speed." },
    body: "We decided to stay SaaS-only for v1.0 — easier to ship, acceptable cost on lost enterprise leads.",
  },
  {
    type: "team",
    title: "Sarah",
    fields: { name: "Sarah", role: "Product", email: "" },
    body: "Sarah owns the product roadmap and the design system.",
  },
  {
    type: "vendor",
    title: "Supabase",
    fields: { vendor_name: "Supabase", role: "db-provider", status: "active", homepage: "https://supabase.com" },
    body: "Supabase is our database. Picked it for Row-Level Security + auth in one product.",
  },
];

async function mockExtract(): Promise<{ ok: true; proposals: Proposal[] } | { ok: false; error: string }> {
  await new Promise((r) => setTimeout(r, 5800));
  return { ok: true, proposals: MOCK_PROPOSALS };
}

async function mockBulkAccept(proposals: Proposal[]): Promise<{ ok: true; created: number; firstId: string | null } | { ok: false; error: string }> {
  await new Promise((r) => setTimeout(r, 600));
  return { ok: true, created: proposals.length, firstId: null };
}

export function Onboarding({ tenantSlug, previewMode = false }: { tenantSlug: string; previewMode?: boolean }) {
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
      const res = previewMode ? await mockExtract() : await extractMemoryProposals(text);
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
    const res = previewMode ? await mockBulkAccept(final) : await bulkAcceptProposals(final);
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
