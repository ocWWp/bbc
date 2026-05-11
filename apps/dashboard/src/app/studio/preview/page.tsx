// Visual gallery for the Phase J preview cards. Renders every card kind
// against hand-crafted fixture content so the cards can be design-reviewed
// without needing Supabase, auth, or the LLM stack up. Linked memory hrefs
// will 404 in stub mode -- that's fine for visual review.
//
// Reachable at /studio/preview. Excluded from the production sitemap; intended
// for local dev + design review only.

import type { Metadata } from "next";
import "@/lib/studio/templates";
import { OutputBlocks, type CitedMemory } from "@/components/studio/OutputBlocks";
import type { OutputBlock } from "@/lib/studio/output-blocks";

export const metadata: Metadata = {
  title: "Studio preview · BBC",
};

// Stable fixture uuids -- chosen so the citation chips look believable.
const MEM_VOICE = "11111111-1111-4111-8111-111111111111";
const MEM_PRODUCT = "22222222-2222-4222-8222-222222222222";
const MEM_DECISION = "33333333-3333-4333-8333-333333333333";
const MEM_TEAM = "44444444-4444-4444-8444-444444444444";

const citedMemories: CitedMemory[] = [
  { id: MEM_VOICE, title: "BBC voice register", type: "voice" },
  { id: MEM_PRODUCT, title: "Big Brain Company positioning", type: "product" },
  { id: MEM_DECISION, title: "Self-host first, SaaS later", type: "decision" },
  { id: MEM_TEAM, title: "Oscar Chow", type: "team" },
];

const authorHint = {
  name: "Big Brain Company",
  handle: "bigbrainco",
  role: "Founder · BBC",
};

type Section = { title: string; subtitle: string; blocks: OutputBlock[] };

const sections: Section[] = [
  {
    title: "Single X post",
    subtitle: "kind: x_post · prompt: launch tweet for v1.0",
    blocks: [
      {
        kind: "x_post",
        props: {
          text: `BBC v1.0 is out. one textarea. it asks for the things it needs, generates content in your voice<cite mem_id="${MEM_VOICE}"/>, and cites the memories that shaped it. self-hosted by default<cite mem_id="${MEM_DECISION}"/>. https://bbc.do`,
        },
      },
    ],
  },
  {
    title: "Tweet thread",
    subtitle: "kind: x_thread · 4 posts",
    blocks: [
      {
        kind: "x_thread",
        props: {
          posts: [
            {
              text: `we shipped v1.0 of BBC tonight. it's the marketing studio i wanted but couldn't find: one textarea, it picks the right workflow, generates in your voice<cite mem_id="${MEM_VOICE}"/>, cites your memories.`,
            },
            {
              text: `the trick: we don't ship templates as prompts you edit. we ship code. ten hand-authored workflow files, each one a tiny program that knows how to use your brain.`,
            },
            {
              text: `every output is grounded. every claim points back to a memory you typed. no hallucinated launch dates, no invented metrics. just your brain, structured.`,
            },
            {
              text: `self-host today. SaaS soon<cite mem_id="${MEM_DECISION}"/>. it's open-source. go: https://bbc.do`,
            },
          ],
        },
      },
    ],
  },
  {
    title: "Threads post",
    subtitle: "kind: threads_post",
    blocks: [
      {
        kind: "threads_post",
        props: {
          text: `the marketing studio nobody asked for. or actually: the one i kept asking for and nobody built.\n\nyou type a task. it picks 2-4 workflows that fit. you pick one. it asks for what it needs. it generates in your voice<cite mem_id="${MEM_VOICE}"/> and cites the memories that shaped it.\n\nbig brain company v1.0 ships tonight.`,
        },
      },
    ],
  },
  {
    title: "LinkedIn announcement",
    subtitle: "kind: linkedin_post",
    blocks: [
      {
        kind: "linkedin_post",
        props: {
          headline: "Announcing Big Brain Company v1.0",
          body: `Today we're releasing Big Brain Company — a brain for your startup that turns scattered context into structured, AI-ready memory.\n\nOur target user is the founder doing every job at once<cite mem_id="${MEM_PRODUCT}"/>. The pitch is simple: stop re-explaining your company to every AI tool. Put it in your brain once. Use it everywhere.\n\nWe're starting self-hosted<cite mem_id="${MEM_DECISION}"/> because trust matters and your context belongs to you.\n\nGet started: https://bbc.do`,
          hashtags: ["startups", "AI", "founders", "opensource"],
        },
      },
    ],
  },
  {
    title: "Cross-platform campaign",
    subtitle: "multi-output · X + Threads + LinkedIn from one task",
    blocks: [
      {
        kind: "x_post",
        props: {
          text: `BBC v1.0 is out. give your AI tools a brain that actually knows your company. self-hosted, open-source, generates in your voice<cite mem_id="${MEM_VOICE}"/>.`,
        },
      },
      {
        kind: "threads_post",
        props: {
          text: `we shipped v1.0. one brain → every AI tool finally knows your company. starts self-hosted, your context stays yours<cite mem_id="${MEM_DECISION}"/>.`,
        },
      },
      {
        kind: "linkedin_post",
        props: {
          body: `BBC v1.0 ships today. The brain for your startup that every AI tool can use. Open-source, self-hosted by default<cite mem_id="${MEM_DECISION}"/>, designed for founders doing every job at once<cite mem_id="${MEM_PRODUCT}"/>.`,
          hashtags: ["AI", "startups"],
        },
      },
    ],
  },
  {
    title: "Reel / TikTok script",
    subtitle: "kind: script · 30s",
    blocks: [
      {
        kind: "script",
        props: {
          hook: "Your AI tools don't know your company. Yet you spend hours re-explaining it to them every week.",
          beats: [
            { time: "0:03", line: "Open ChatGPT. Re-paste your positioning. Again." },
            { time: "0:08", line: `Founders do every job at once<cite mem_id="${MEM_PRODUCT}"/>. The AI tools weren't built for that.` },
            { time: "0:14", line: "Big Brain Company gives you one brain that every tool can use." },
            { time: "0:20", line: `Self-host it. Your context stays yours<cite mem_id="${MEM_DECISION}"/>.` },
            { time: "0:26", line: `Voice<cite mem_id="${MEM_VOICE}"/>, product, decisions — all structured, all citeable.` },
          ],
          cta: "Try it free at bbc.do. Open-source, runs on your laptop today.",
        },
      },
    ],
  },
  {
    title: "Blog post draft",
    subtitle: "kind: blog_draft · ~450 words",
    blocks: [
      {
        kind: "blog_draft",
        props: {
          title: "We built a brain so every AI tool knows our company",
          subtitle:
            "The pitch is simple: stop re-explaining your startup. Put it once in a place every tool can read.",
          body_markdown: `Every founder I know has the same problem. You spend half a day explaining your company to a new tool — your positioning, your voice, the decisions you've already made — and the next morning you do it again somewhere else.\n\nBig Brain Company is the brain that solves this. One source of truth, every AI tool reads from it.\n\n## What goes in\n\nYour positioning<cite mem_id="${MEM_PRODUCT}"/>. Your voice<cite mem_id="${MEM_VOICE}"/>. The decisions you keep re-deriving on every call<cite mem_id="${MEM_DECISION}"/>. Your team. Your vendors.\n\nNot a vector database. Structured supertags with typed fields, so the AI gets answers, not approximate similar paragraphs.\n\n## What comes out\n\nThe Marketing Studio is the first place you'll feel it. Type "draft a launch tweet" — it picks the right workflow from a library, asks you for the one thing it needs, and generates content grounded in your actual brain. Every claim cites the memory it came from.\n\nNo hallucinated launch dates. No invented metrics. No "as an AI language model" hedging.\n\n## How we ship\n\nSelf-hosted today<cite mem_id="${MEM_DECISION}"/>. SaaS soon. Open-source so you can audit what we do with your context.\n\nIf you've been waiting for the AI tooling that actually knows you — we built it.`,
        },
      },
    ],
  },
  {
    title: "Plain output (voice check / hashtags / custom)",
    subtitle: "kind: plain",
    blocks: [
      {
        kind: "plain",
        props: {
          text: `Voice consistency check:\n\nFLAGS:\n- "leveraged" appears in paragraph 2. Voice memory<cite mem_id="${MEM_VOICE}"/> lists "leverage" in dont_words. Replace with "used" or "applied".\n- "Excited to announce" opens the LinkedIn draft. Voice rejects opener clichés; lead with the news itself.\n\nAPPROVED:\n- lowercase opening matches brand register.\n- direct CTA aligns with example phrases.`,
        },
      },
    ],
  },
];

export default function StudioPreviewPage() {
  return (
    <main className="mx-auto max-w-5xl px-4 sm:px-6 py-8 sm:py-12">
      <header className="mb-10">
        <div className="text-[11px] font-semibold tracking-[0.18em] uppercase text-muted-foreground">
          Phase J · Visual preview
        </div>
        <h1 className="mt-2 text-3xl sm:text-4xl font-bold tracking-tight">
          Marketing Studio preview cards
        </h1>
        <p className="mt-2 text-muted-foreground text-base sm:text-lg max-w-2xl">
          Every preview-card kind with fixture content. Citation superscripts
          link to <code className="text-xs">/memory/[id]</code> and the strip
          below each section lists the memories the fixtures cite. Toggle the
          theme in the nav to verify light + dark.
        </p>
      </header>

      <div className="space-y-14">
        {sections.map((s) => (
          <section key={s.title}>
            <div className="mb-4">
              <div className="text-[11px] font-medium tracking-[0.16em] uppercase text-muted-foreground">
                {s.subtitle}
              </div>
              <h2 className="mt-0.5 text-xl font-semibold tracking-tight">{s.title}</h2>
            </div>
            <OutputBlocks
              blocks={s.blocks}
              authorHint={authorHint}
              citedMemories={citedMemories}
            />
          </section>
        ))}
      </div>

      <footer className="mt-16 pt-6 border-t text-xs text-muted-foreground">
        Fixtures only — no LLM, no DB, no auth required. Real app lives at{" "}
        <a href="/studio/marketing" className="underline">
          /studio/marketing
        </a>
        .
      </footer>
    </main>
  );
}
