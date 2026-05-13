"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { extractMemoryProposals, bulkAcceptProposals, ingestSource } from "./actions";
import type { Proposal } from "@/lib/memory/extractor/types";
import { FlowBar } from "./_steps/flow-bar";
import { DumpStep } from "./_steps/dump-step";
import { ByokBanner } from "./_steps/byok-banner";
import { ExtractingStep } from "./_steps/extracting-step";
import { ReviewStep } from "./_steps/review-step";
import { DoneStep } from "./_steps/done-step";
import type { SourceItem, ProposalWithOrigin } from "./_steps/source-types";

const SKIP_KEY = "bbc.welcome.skipped";

type Phase = "dump" | "extracting" | "review" | "done";

const MOCK_PROPOSALS: Proposal[] = [
  {
    type: "product",
    title: "Developer tools for AI-native founders",
    fields: { positioning: "Memory layer for AI agents", target_user: "Early-stage AI founders", competitors: ["Mem0", "Letta"] },
    body: "We're building a shared brain for founders and the AI agents working on their product.",
  },
  {
    type: "voice",
    title: "Direct, lowercase, no jargon",
    fields: { register: "casual", do_words: ["ship", "compound", "durable"], dont_words: ["leverage", "synergy", "seamless"] },
    body: "Our voice is direct and lowercase. We never use the word 'leverage' or 'synergy'.",
  },
  {
    type: "decision",
    title: "SaaS-only, no on-prem",
    fields: { status: "accepted", date: "2026-05-01", context: "Repeated asks for self-hosted on-prem from enterprise prospects.", decision: "Stay SaaS-only for v1.0. Revisit at $1M ARR." },
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
  await new Promise((r) => setTimeout(r, 5200));
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

export type ByokState = {
  hasAnthropicKey: boolean;
  isHostedDemo: boolean;
};

export function Onboarding({
  tenantSlug,
  previewMode = false,
  byokState,
}: {
  tenantSlug: string;
  previewMode?: boolean;
  byokState?: ByokState;
}) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("dump");
  const [text, setText] = useState("");
  const [sources, setSources] = useState<SourceItem[]>([]);
  const [proposals, setProposals] = useState<ProposalWithOrigin[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ count: number; firstId: string | null }>({ count: 0, firstId: null });
  const [, startTransition] = useTransition();

  function skip() {
    try { window.localStorage.setItem(SKIP_KEY, "1"); } catch { /* noop */ }
    router.push("/");
  }

  async function addUrlSource(url: string): Promise<{ ok: true } | { ok: false; error: string }> {
    if (previewMode) {
      const fakeId = `preview-url-${Date.now()}`;
      setSources((s) => [...s, {
        sourceId: fakeId, kind: "url",
        label: labelForUrl(url),
        rawText: `Preview content fetched from ${url}.`,
        locator: { kind: "url", href: url },
      }]);
      return { ok: true };
    }
    const res = await ingestSource({ kind: "url", url });
    if (!res.ok) return { ok: false, error: res.error };
    setSources((s) => [...s, {
      sourceId: res.sourceId, kind: "url",
      label: labelForUrl(url), rawText: res.rawText,
      locator: res.locator, redactions: res.redactions, reused: res.reused,
    }]);
    return { ok: true };
  }

  async function addFileSource(file: File): Promise<{ ok: true } | { ok: false; error: string }> {
    if (previewMode) {
      const fakeId = `preview-file-${Date.now()}`;
      setSources((s) => [...s, {
        sourceId: fakeId, kind: "file",
        label: file.name,
        rawText: `Preview content from file ${file.name}.`,
        locator: { kind: "file", filename: file.name },
      }]);
      return { ok: true };
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    const res = await ingestSource({ kind: "file", name: file.name, bytes });
    if (!res.ok) return { ok: false, error: res.error };
    setSources((s) => [...s, {
      sourceId: res.sourceId, kind: "file",
      label: file.name, rawText: res.rawText,
      locator: res.locator, redactions: res.redactions, reused: res.reused,
    }]);
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

      if (text.trim().length >= 80) {
        const res = previewMode ? await mockExtract() : await extractMemoryProposals(text);
        if (!res.ok) {
          setError(res.error);
          setPhase("dump");
          return;
        }
        for (const p of res.proposals) collected.push({ ...p });
      }

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
      const plain: Proposal[] = batch.map(({ _sourceId, _sourceKind, _sourceLabel, ...p }) => {
        void _sourceId; void _sourceKind; void _sourceLabel;
        return p;
      });
      const res = previewMode ? await mockBulkAccept(plain) : await bulkAcceptProposals(plain, sourceId);
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

  const stepIndex =
    phase === "dump" ? 0
    : phase === "extracting" ? 1
    : phase === "review" ? 2
    : 3;

  const rightSlot =
    phase === "dump" ? (
      <button type="button" className="flow-bar-link" onClick={skip}>
        <span className="pill-pre">esc</span>
        <span>skip — try the demo brain</span>
      </button>
    ) : phase === "extracting" ? (
      <span className="flow-bar-link" style={{ cursor: "default" }}>
        <span className="pill-pre">···</span>
        <span>structuring your dump</span>
      </span>
    ) : phase === "review" ? (
      <button type="button" className="flow-bar-link" onClick={skip}>
        <span className="pill-pre">esc</span>
        <span>skip review</span>
      </button>
    ) : (
      <span className="flow-bar-link" style={{ color: "var(--ok)", cursor: "default" }}>
        <span
          style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--ok)", display: "inline-block" }}
        />
        <span>brain initialised</span>
      </span>
    );

  return (
    <div className="flow">
      <FlowBar step={stepIndex} total={phase === "done" ? 4 : 3} crumb="/welcome" right={rightSlot} />
      <main className="flow-main">
        {phase === "dump" && (
          <>
            {byokState && !byokState.hasAnthropicKey && (
              <div style={{ maxWidth: 1180, margin: "0 auto 24px", width: "100%" }}>
                <ByokBanner isHostedDemo={byokState.isHostedDemo} />
              </div>
            )}
            <DumpStep
              value={text}
              onChange={setText}
              onSubmit={onSubmitDump}
              error={error}
              sources={sources}
              onAddUrl={addUrlSource}
              onAddFile={addFileSource}
              onRemoveSource={removeSource}
              tenantSlug={tenantSlug}
            />
          </>
        )}
        {phase === "extracting" && <ExtractingStep />}
        {phase === "review" && (
          <ReviewStep
            proposals={proposals}
            onAcceptAll={onAcceptAll}
            onBack={() => setPhase("dump")}
            error={error}
          />
        )}
        {phase === "done" && (
          <DoneStep
            count={created.count}
            firstId={created.firstId}
            tenantSlug={tenantSlug}
            proposals={proposals}
          />
        )}
      </main>
    </div>
  );
}
