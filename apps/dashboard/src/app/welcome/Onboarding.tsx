"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { extractMemoryProposals, bulkAcceptProposals, ingestSource } from "./actions";
import type { Proposal } from "@/lib/memory/extractor/types";
import { DumpStep } from "./_steps/dump-step";
import { ExtractingStep } from "./_steps/extracting-step";
import { ReviewStep } from "./_steps/review-step";
import { DoneStep } from "./_steps/done-step";
import type { SourceItem, ProposalWithOrigin } from "./_steps/source-types";

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

function labelForUrl(url: string): string {
  try {
    const u = new URL(url);
    return `${u.hostname}${u.pathname === "/" ? "" : u.pathname}`.replace(/\/$/, "");
  } catch {
    return url;
  }
}

export function Onboarding({ tenantSlug, previewMode = false }: { tenantSlug: string; previewMode?: boolean }) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("dump");
  const [text, setText] = useState("");
  const [sources, setSources] = useState<SourceItem[]>([]);
  const [proposals, setProposals] = useState<ProposalWithOrigin[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ count: number; firstId: string | null }>({ count: 0, firstId: null });
  const [, startTransition] = useTransition();

  function skip() {
    try {
      window.localStorage.setItem(SKIP_KEY, "1");
    } catch {/* noop */}
    router.push("/");
  }

  async function addUrlSource(url: string): Promise<{ ok: true } | { ok: false; error: string }> {
    if (previewMode) {
      const fakeId = `preview-url-${Date.now()}`;
      setSources((s) => [
        ...s,
        {
          sourceId: fakeId,
          kind: "url",
          label: labelForUrl(url),
          rawText: `Preview content fetched from ${url}.`,
          locator: { kind: "url", href: url },
        },
      ]);
      return { ok: true };
    }
    const res = await ingestSource({ kind: "url", url });
    if (!res.ok) return { ok: false, error: res.error };
    setSources((s) => [
      ...s,
      {
        sourceId: res.sourceId,
        kind: "url",
        label: labelForUrl(url),
        rawText: res.rawText,
        locator: res.locator,
        redactions: res.redactions,
        reused: res.reused,
      },
    ]);
    return { ok: true };
  }

  async function addFileSource(file: File): Promise<{ ok: true } | { ok: false; error: string }> {
    if (previewMode) {
      const fakeId = `preview-file-${Date.now()}`;
      setSources((s) => [
        ...s,
        {
          sourceId: fakeId,
          kind: "file",
          label: file.name,
          rawText: `Preview content from file ${file.name}.`,
          locator: { kind: "file", filename: file.name },
        },
      ]);
      return { ok: true };
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    const res = await ingestSource({ kind: "file", name: file.name, bytes });
    if (!res.ok) return { ok: false, error: res.error };
    setSources((s) => [
      ...s,
      {
        sourceId: res.sourceId,
        kind: "file",
        label: file.name,
        rawText: res.rawText,
        locator: res.locator,
        redactions: res.redactions,
        reused: res.reused,
      },
    ]);
    return { ok: true };
  }

  function removeSource(sourceId: string) {
    setSources((s) => s.filter((x) => x.sourceId !== sourceId));
  }

  async function onSubmitDump() {
    setError(null);
    setPhase("extracting");
    startTransition(async () => {
      const collected: ProposalWithOrigin[] = [];

      // Textarea content (if any) becomes its own batch with no sourceId --
      // the text adapter's source row is created lazily on accept by passing
      // sourceId only for the explicit URL/file sources. The textarea path
      // already worked pre-I.20; we keep it provenance-less for now to avoid
      // churning every existing test.
      if (text.trim().length >= 80) {
        const res = previewMode ? await mockExtract() : await extractMemoryProposals(text);
        if (!res.ok) {
          setError(res.error);
          setPhase("dump");
          return;
        }
        for (const p of res.proposals) collected.push({ ...p });
      }

      // Each attached source runs its own extract. Origin is stamped so the
      // review step can attribute and bulk-accept can group by sourceId.
      for (const src of sources) {
        const res = previewMode
          ? await mockExtract()
          : await extractMemoryProposals(src.rawText, {
              sourceId: src.sourceId,
              kind: src.kind,
              locator: src.locator,
            });
        if (!res.ok) {
          setError(`Source ${src.label}: ${res.error}`);
          setPhase("dump");
          return;
        }
        for (const p of res.proposals) {
          collected.push({
            ...p,
            _sourceId: src.sourceId,
            _sourceKind: src.kind,
            _sourceLabel: src.label,
          });
        }
      }

      if (collected.length === 0) {
        setError("We couldn't find any structured items. Try adding specifics about your voice, team, or product.");
        setPhase("dump");
        return;
      }
      setProposals(collected);
      setPhase("review");
    });
  }

  async function onAcceptAll(final: ProposalWithOrigin[]) {
    setError(null);
    // Group by source so each call to bulkAcceptProposals can link the right
    // memory_file_sources rows. Proposals with no _sourceId (the textarea
    // batch) go through with sourceId undefined -- same path as pre-I.20.
    const groups = new Map<string | undefined, ProposalWithOrigin[]>();
    for (const p of final) {
      const key = p._sourceId;
      const arr = groups.get(key) ?? [];
      arr.push(p);
      groups.set(key, arr);
    }

    let totalCreated = 0;
    let firstId: string | null = null;
    for (const [sourceId, batch] of groups) {
      // Strip _ fields before sending to the server action -- it expects plain Proposals.
      const plain: Proposal[] = batch.map(({ _sourceId, _sourceKind, _sourceLabel, ...p }) => {
        void _sourceId; void _sourceKind; void _sourceLabel;
        return p;
      });
      const res = previewMode
        ? await mockBulkAccept(plain)
        : await bulkAcceptProposals(plain, sourceId);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      totalCreated += res.created;
      firstId = firstId ?? res.firstId;
    }

    setProposals(final);
    setCreated({ count: totalCreated, firstId });
    setPhase("done");
  }

  const stepIndex = phase === "extracting" ? 0 : phaseOrder.indexOf(phase);
  const segments = stepIndex >= 2 ? 3 : phase === "extracting" ? 1.5 : stepIndex + 1;
  const wide = phase === "dump" || phase === "review";

  return (
    <main className="ambient-bg -mx-6 -mt-6 min-h-[calc(100vh-3rem)]">
      <div className={`mx-auto px-6 pb-16 pt-10 ${wide ? "max-w-5xl" : "max-w-2xl"}`}>
        <header className="flex items-center justify-between gap-4 pb-10">
          <Link href="/" className="text-sm font-semibold tracking-[-0.01em] text-foreground/90 hover:text-foreground transition-colors">
            bbc
          </Link>
          <div className="flex items-center gap-4 text-xs text-muted-foreground/80">
            <StepLabel phase={phase} />
            <button
              type="button"
              onClick={skip}
              className="hover:text-foreground transition-colors"
            >
              Skip →
            </button>
          </div>
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
                  sources={sources}
                  onAddUrl={addUrlSource}
                  onAddFile={addFileSource}
                  onRemoveSource={removeSource}
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
                <DoneStep
                  count={created.count}
                  firstId={created.firstId}
                  tenantSlug={tenantSlug}
                  proposals={proposals}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </main>
  );
}

function StepLabel({ phase }: { phase: Phase }) {
  const label =
    phase === "dump" ? "Step 1 of 3"
    : phase === "extracting" ? "Step 2 of 3"
    : phase === "review" ? "Step 3 of 3"
    : "Done";
  return (
    <span className="font-mono uppercase tracking-[0.18em] text-[10px]">{label}</span>
  );
}

function ProgressBar({ value }: { value: number }) {
  const clamped = Math.max(0, Math.min(1, value));
  return (
    <div className="flex gap-2">
      {[0, 1, 2].map((i) => {
        const segmentProgress = Math.max(0, Math.min(1, clamped * 3 - i));
        const isActive = segmentProgress > 0 && segmentProgress < 1;
        return (
          <div key={i} className="h-[3px] flex-1 overflow-hidden rounded-full bg-muted/60">
            <motion.div
              initial={false}
              animate={{ width: `${segmentProgress * 100}%` }}
              transition={{ duration: 0.5, ease: [0.2, 0, 0, 1] }}
              className="h-full bg-brain-accent"
              style={{
                boxShadow: isActive
                  ? "0 0 10px color-mix(in oklch, var(--brain-accent) 70%, transparent)"
                  : "none",
              }}
            />
          </div>
        );
      })}
    </div>
  );
}
