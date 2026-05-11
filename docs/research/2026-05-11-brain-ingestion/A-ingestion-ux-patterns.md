# A — Ingestion UX Patterns

Date: 2026-05-11
Author: research agent
Status: research, not a plan

## Why this exists

BBC onboarding is one textarea. A user just said: "it's the brain — file drop, URL paste, GitHub connect, all of it should be in there." Before redesigning, this document surveys how leading memory / knowledge / agent products handle plural-input ingestion, then recommends a specific shape for BBC v1.20.

## Survey

### AI memory / personal knowledge

**Mem0** — API-first. The hosted dashboard accepts text strings and key/value pairs scoped to a user_id; multi-source ingestion (tweets, web pages, documents) is described in their 2026 state-of-memory writeup but happens via SDK calls in the host app, not a polished UI. Takeaway: Mem0 punts ingestion UX to the integrator.

**Letta (MemGPT)** — Memory blocks are typed (`human`, `persona`, custom labels). The Agent Development Environment (ADE) lets you edit blocks in a side panel, and Letta Code has a `/remember` slash command for ad-hoc capture plus `/init` to re-analyze a project. No "drop a folder" UI; ingestion is per-block, per-message.

**Reflect** — Onboarding is bare (calendar permission + create your first note). Imports live in Settings → Import Notes (Apple Notes, Evernote, Markdown, Roam, Workflowy). Readwise and Google Calendar are unlocked as ongoing trickle-feed integrations after first-run. Reflect treats ingestion as a settings concern, not an onboarding moment.

**Mymind** — The capture surface IS the product. Browser extension + drag-and-drop onto the dock icon are the primary affordances; the app itself is a stream. There is no onboarding "give us your stuff" step — Mymind teaches the gesture and lets the corpus accrete.

**Heptabase** — Most aggressive ingestion UX of the bunch. "Research a topic" opens a multi-input drop zone accepting PDFs, YouTube links, .docx/.txt/.md, and images; the system parses everything, transcribes YT, and lays cards onto a new whiteboard. Drag-and-drop into the card library is also first-class. This is the closest pattern to what BBC wants.

**Granola** — Aggressively minimal: mic permission, optionally join a team workspace, done. No corpus import. Historical-notes export is CSV-only. Integrations (Slack, Notion, Attio, HubSpot, Zapier, MCP) are outbound, not inbound.

### Enterprise knowledge layers

**Notion AI Connectors** — Configured in an admin console after workspace setup, not during personal onboarding. OAuth flow per connector (Slack, Google Drive, Jira, Teams/SharePoint, GitHub, Linear, with Gmail/Salesforce/Zendesk/Box coming). Initial crawl takes up to 72 hours. Backfill window is 1 year from connect date. Sources are explicitly a *settings* surface owned by workspace owners with admin rights in the source app.

**Glean** — 100+ connectors managed in `Admin Console → Platform → Data sources`. Pure OAuth-or-marketplace flow per source. Initial crawl 3–10 days. Setup is resumable mid-flow. This is the gold standard for "lots of sources, all permissioned, all background" — but the experience is days, not minutes, and explicitly admin-only.

**Guru** — Browser extension is the hero ingestion path: one-click capture from Gmail, Salesforce, Zendesk, Docs, LinkedIn into "cards." Onboarding emphasizes the gesture (install extension) rather than a corpus import.

### AI coding / product tools

**Cursor** — Open the workspace, indexing starts automatically; no UI prompt. Status panel sits in `Settings → Features → Codebase Indexing`. `.cursorignore` for opt-out. New users can reuse a teammate's index via Merkle similarity hashes. Zero-config is the design — ingestion is a side effect of opening a project.

**v0** — Multi-modal prompt input: paste a Figma share link, attach an image, or type. The attachment icon next to the prompt is where files and links go; there is no separate "sources" panel. Ingestion is co-located with intent.

**Lovable** — Paste a Figma link as the prompt, upload a screenshot, or connect GitHub from settings for round-trip sync. Same pattern as v0: ingestion is collapsed into the prompt surface.

**Bolt** — StackBlitz-backed; "Import from GitHub" is a top-level action on the new-project screen alongside "Start from scratch."

### Chatbot / agent builders

**Chatbase** — "New Chatbot" lands you on a Sources page with left-rail tabs: Files (PDF/text upload), Text (paste), Website (full crawl, sitemap, or individual URLs), Q&A pairs, plus Notion connection. Sources is THE first screen — there is no separate dump step. Each source type retrains the bot.

**Dust** — Admin separates Connections (OAuth: Drive, Notion, Slack with channel/folder picking) from Folders (manual upload up to 30MB per file, 10MB inline). Conversations can attach files inline. Connections are a workspace-level concern; Folders are project-level.

**ChatGPT Custom GPTs** — Builder is split-screen: conversational creation on the left, configuration on the right with "Upload files" (20 files, 512MB each) and "Add actions" (OAuth-style API connectors). Knowledge upload is one section of a longer config, not a primary moment.

### Common patterns across the survey

1. **Big-bang import is rare.** Only Heptabase's "Research a topic" and Chatbase's first screen treat ingestion as the onboarding event. Most products defer non-text sources to Settings (Reflect, Notion, Glean, Dust, Cursor) or co-locate them in the prompt (v0, Lovable, ChatGPT).
2. **OAuth integrations live in admin/settings, not onboarding.** Notion, Glean, Dust all gate connector config behind admin roles and crawl times measured in days. None of them put OAuth in the first-run flow.
3. **Drop-anywhere is the strongest "feels right" gesture.** Mymind, Heptabase, v0 attachment icon, Cursor's open-the-folder — all collapse "tell us about your stuff" into a single physical action.
4. **Preview-before-commit is the exception.** Most products ingest first and let you delete later. BBC's proposal-queue model (extract → review → bulk accept) is actually unusual and is a real differentiator — closest cousin is the Chatbase "training preview" or ChatGPT GPT-builder split screen.
5. **Paste-detection auto-transform is a Tiptap-class pattern.** Editors (Tiptap, Notion, Linear) detect pasted URLs and turn them into rich chips/embeds inline. None of the surveyed memory products do this at the ingestion surface — opportunity gap.

## Recommended ingestion UX shape for BBC v1.20

### Shape

**Keep the textarea as primary. Add a focused row of secondary affordances directly underneath it. Defer OAuth integrations to a post-first-run "Sources" page.**

Rationale, in order of weight:

1. **The textarea is BBC's differentiator.** No other product in the survey treats unstructured brain dump as the canonical first input. Reflect, Notion, Glean all assume you arrive with structured sources. BBC's bet — "tell me everything in your own words and I'll type it" — is novel and worth defending. Moving to a multi-input grid would dilute that bet into Chatbase-shaped commodity.
2. **Heptabase's "Research a topic" is the right reference for v2, not v1.20.** It works because Heptabase has a parsing pipeline for 6+ media types. BBC's extractor today is text-only (Claude Sonnet, tool use). Shipping file/URL inputs without parsers behind them is theater.
3. **OAuth integrations are a days-long crawl problem, not a minutes-long onboarding problem.** Every enterprise-grade example (Notion, Glean, Dust) treats them as admin surfaces with multi-day initial crawls. Putting "Connect GitHub" in onboarding would either lie about timing or block the proposal-review moment the user is actually here for.
4. **The proposal queue is the bottleneck.** Whatever ingestion form we add, every byte still funnels through `accept.sh`-equivalent review. Multiplying input modes 5× before we've stress-tested the review UX with 100 typed proposals from a real dump is premature.

### Layout sketch — onboarding (Phase I, v1.20)

```
+--------------------------------------------------------------+
|  Step 1 of 3 — Dump everything you can think of              |
|                                                              |
|  [ Big textarea, ~40 lines, autofocus                     ]  |
|  [                                                        ]  |
|  [                                                        ]  |
|  [                                                        ]  |
|                                                              |
|  Or drop in:                                                 |
|  +------------+  +------------+  +------------+              |
|  | Drop files |  | Paste URL  |  | More       |              |
|  | .md .txt   |  | (we fetch) |  | sources -> |              |
|  | .pdf       |  |            |  |            |              |
|  +------------+  +------------+  +------------+              |
|                                                              |
|  We'll extract typed proposals you can review next.          |
|                                                              |
|                                              [ Extract ->  ] |
+--------------------------------------------------------------+
```

The "More sources →" tile routes to the post-first-run **Sources** page rather than expanding inline; this prevents the onboarding screen from sprawling and signals that connectors exist without making them load-bearing for completion.

### Layout sketch — paste-detection in the textarea

When the user pastes a URL or a file path *inside* the dump, detect it and offer an inline transform — Tiptap paste-rule style:

```
+--------------------------------------------------------------+
|  ...we use Linear for tickets, here's our handbook:          |
|  https://notion.so/acme/handbook-9f2a1...                    |
|  +---------------------------------------------------------+ |
|  | Looks like a URL. Fetch and ingest separately?          | |
|  |                          [ Keep as text ]  [ Fetch it ] | |
|  +---------------------------------------------------------+ |
|  ...and our brand voice is...                                |
+--------------------------------------------------------------+
```

If the user clicks "Fetch it," the URL is lifted out into a chip above the textarea and queued as its own source; if not, it stays as inline text and gets extracted normally. This is the single most copy-able pattern from the survey (Tiptap, Linear, Notion) and it directly answers the user's frustration without adding new top-level UI.

### Layout sketch — post-first-run Sources page (v1.x, gated)

```
+--------------------------------------------------------------+
|  Sources                                                     |
|                                                              |
|  Direct                                                      |
|    [+ Dump more text]   [+ Upload files]   [+ Paste URL]     |
|                                                              |
|  Connected (background sync, proposals land in your queue)   |
|    [ Connect GitHub  ]   coming v1.21                        |
|    [ Connect Notion  ]   coming v1.22                        |
|    [ Connect Slack   ]   coming v1.23                        |
|    [ Connect Drive   ]   coming v1.x                         |
|                                                              |
|  Recent ingests                                              |
|    - dump-2026-05-11.txt          47 proposals  accepted     |
|    - handbook.notion.so/...       12 proposals  3 pending    |
+--------------------------------------------------------------+
```

This page mirrors Dust's split (manual Folders vs OAuth Connections) but with BBC's proposal-queue framing as the unifier — every source produces typed proposals that land in the same review surface. That's the right architectural story: ingestion is plural, review is singular.

### v1.20 vs v1.x scope, one sentence each

- **Textarea dump (existing)** — v1.20, hero.
- **File drop (.md, .txt, .pdf)** — v1.20, secondary tile; PDFs parsed via Claude file input or pdfjs server-side.
- **URL paste (single page fetch + readability)** — v1.20, secondary tile; same pipeline as inline paste-detection.
- **Inline paste-detection chip** — v1.20, this is the single best ROI item in the whole survey.
- **Sources page (post-first-run, manual sources only)** — v1.20, lives at `/sources`, no connectors yet.
- **GitHub connector** — v1.21, README + top-level docs only, OAuth scoped to `repo:read`.
- **Notion connector** — v1.22, page-pick on connect (mirror Dust's channel-picker pattern).
- **Slack connector** — v1.23, channel-scoped only, requires per-message proposal generation policy.
- **Google Drive connector** — v1.x, deferred until file-storage decision in CLAUDE.md is settled.
- **Browser extension (Mymind/Guru style)** — v1.x, only if usage data shows recurring "I wish I could save this" friction.
- **Heptabase-style multi-modal drop zone** — v2, when we have a real parser pipeline.

## Sources and References

1. [Mem0 docs — open source overview](https://docs.mem0.ai/open-source/overview)
2. [Mem0 — State of AI Agent Memory 2026](https://mem0.ai/blog/state-of-ai-agent-memory-2026)
3. [Letta — Memory Blocks: The Key to Agentic Context Management](https://www.letta.com/blog/memory-blocks)
4. [Letta Code — Memory docs](https://docs.letta.com/letta-code/memory/)
5. [Reflect Academy — Getting started](https://reflect.academy/getting-started-with-reflect)
6. [Reflect Academy — Integrations](https://reflect.academy/integrations)
7. [Mymind — How it works](https://mymind.com/how)
8. [Mymind — Add images or bookmarks](https://mymind.helpscoutdocs.com/article/37-how-to-add-images-or-bookmarks-using-the-mymind-app)
9. [Heptabase Wiki — PDF annotation & research](https://wiki.heptabase.com/pdf-annotation)
10. [Heptabase Wiki — Changelog](https://wiki.heptabase.com/changelog)
11. [Granola — Integrations guide](https://www.granola.ai/blog/granola-integrations-complete-guide-connecting-meeting-tools)
12. [Notion — AI Connectors help center](https://www.notion.com/help/notion-ai-connectors)
13. [Notion — Use AI connectors guide](https://www.notion.com/help/guides/use-ai-connectors-to-access-more-of-your-teams-knowledge)
14. [Glean docs — About connectors](https://docs.glean.com/connectors/about)
15. [Glean docs — Connect data sources](https://docs.glean.com/get-started/setup/connect-data-sources)
16. [Guru — Browser extension](https://www.getguru.com/features/browser-extension)
17. [Cursor docs — Codebase indexing](https://cursor.com/docs/context/codebase-indexing)
18. [Cursor — Securely indexing large codebases](https://cursor.com/blog/secure-codebase-indexing)
19. [v0 docs — Figma](https://v0.app/docs/figma)
20. [Vercel blog — Working with Figma and custom design systems in v0](https://vercel.com/blog/working-with-figma-and-custom-design-systems-in-v0)
21. [Lovable FAQ — Figma](https://lovable.dev/faq/design/figma)
22. [Chatbase docs — Sources](https://www.chatbase.co/docs/user-guides/chatbot/sources)
23. [Dust docs — Connections](https://docs.dust.tt/docs/connections)
24. [Dust docs — Folders](https://docs.dust.tt/docs/dust-folders)
25. [Sourcegraph docs — Cody context](https://sourcegraph.com/docs/cody/core-concepts/context)
26. [OpenAI Help — Knowledge in GPTs](https://help.openai.com/en/articles/8843948-knowledge-in-gpts)
27. [OpenAI Help — Creating and editing GPTs](https://help.openai.com/en/articles/8554397-creating-and-editing-gpts)
28. [Tiptap docs — Paste rules](https://tiptap.dev/docs/editor/api/paste-rules)
29. [Mobbin glossary — Chip UI](https://mobbin.com/glossary/chip)
30. [Mobbin glossary — Text Area](https://mobbin.com/glossary/text-area)
31. [UXPin — Progressive disclosure](https://www.uxpin.com/studio/blog/what-is-progressive-disclosure/)
32. [Einar Egilsson — Multi-input paste UX](https://einaregilsson.com/multi-input-paste/)
