# Claude Design prompt — BBC Library

Paste this prompt into Claude Design as-is. It contains product requirements only — no visual/aesthetic direction. Let the design tool propose the visual language.

---

## The product

BBC is an open-source (AGPLv3) self-hostable "company brain" for startup founders and indie hackers. It stores typed memory (decisions, voice, products, vendors, team, etc.) and lets role-scoped AI agents ("Studios" — Marketing, Engineering, Founder, Designer, Support) use that memory to do work. Today it's invite-only or self-hosted; users bring their own LLM API keys (BYOK).

The product is being prepared for a public launch (HN/Twitter post). One of the launch pillars is **the Library** — a unified marketplace surface inside the app where users browse, install, and discover three kinds of extensibility:

1. **Skills** — agent role templates (think: "Marketing launch-post writer", "Engineering postmortem author", "Founder weekly recap"). Importable from the agentskills.io ecosystem (a markdown + YAML frontmatter format adopted by Anthropic, OpenAI Codex, Cursor, GitHub Copilot, Hermes).
2. **Connectors** — typed-aware data ingestion (Notion → typed memory, GitHub → typed memory, Linear → typed memory, generic webhook → typed memory). Each connector writes to specific supertag types.
3. **Providers** — LLM / database / email / hosting vendors (Anthropic, Supabase, Resend, Cloudflare). Already exists in the current marketplace UI; gets re-housed under the Library.

## The audience

Two personas, both technical-leaning:

- **Startup founders / CEOs** — 1–10 person teams. They want their company's knowledge structured. They install + dogfood it personally before involving the team. They care about: structured templates, the ability to import templates from public repos, demo URL holding up under scrutiny, integrations with Notion / GitHub / Linear.
- **Indie hackers / solo builders** — one-person companies. They love AGPL + self-host + BYOK aesthetic. They use BBC as a personal brain that talks to Claude. They care about: speed of install, MCP integration with Claude, GitHub repo connection, low-noise UI.

## The library route

Single route: `/library`

## Required information architecture

The Library has three categories: Skills, Connectors, Providers. These can be implemented as tabs at the top of `/library`, as a left sidebar, as separate sub-routes (`/library/skills`, `/library/connectors`, `/library/providers`), or any other pattern the designer judges best. The reference products below mostly use tabs OR a left sidebar.

Above the three categories, there is a **"Recommended for you"** band (carousel or grid — designer's call) that auto-suggests 3–5 skills/connectors based on the tenant's existing role mix and detected gaps. Every recommendation has a "Why this?" explanation and an Install button. This band can be hidden or collapsed for users who don't want it.

Below the recommended band, the user can browse by category. Each category surface has:

- Search input
- Category filter (sidebar or chip row): for Skills — by role division (Marketing / Engineering / Founder / Designer / Support / Sales / Ops / etc.). For Connectors — by source type (Docs / Code / Chat / Tasks / Email / Files / Webhook). For Providers — by provider role (LLM / DB / Email / Hosting / Analytics / API).
- "Installed" pill that filters to only show currently-installed items
- A grid of cards

## Card requirements

Every card across all three categories has these elements (designer chooses arrangement):

- A small logo or visual badge. For skills without an explicit logo, use a color block derived from the skill's role (e.g., marketing = orange, engineering = blue).
- Name (one line, max ~40 chars)
- One-line description (max ~120 chars)
- "By {author}" line — required to surface trust. For built-in items: "By BBC".
- **Typed-schema mapping** — this is the killer differentiator. Each card surfaces which BBC memory types it reads from or writes to. Examples:
  - Skill card: "Reads: voice, product, decision"
  - Connector card: "Writes: decision, vendor, note"
  - Provider card: (no schema mapping needed; show "role: llm-provider")
- Install state: a button (when not installed) or a checkmark badge (when installed)
- An optional "Recommended" or "New" badge in a corner

## Detail surface

When a user clicks a card, a detail surface opens. Designer chooses: side drawer, modal, or full sub-page. The detail surface must include:

- Larger logo / visual
- Full description (paragraph-length)
- Source repo URL with a "View source" link (skills imported from github)
- License (AGPL / MIT / Apache 2.0 / Proprietary)
- Last updated date
- For skills: list of `firstUseInputs` (the inputs the skill will ask for at runtime — e.g., "Launch product name", "Target audience"). Show as a preview list.
- For connectors: OAuth scopes summary ("Will read: pages, page content. Will not access: comments, integrations"). Show as a permission preview.
- For providers: connection state, last test timestamp, configuration link.
- Install / Uninstall button (primary CTA)
- For installed items: link to that item's working surface (e.g., installed Marketing skill → "Open in Studio")

## "Import from URL" surface

On the Skills tab (or wherever Skills are housed), there is a secondary action: "Import from URL". This opens an input where the user pastes a github URL pointing at a SKILL.md file or a directory of SKILL.md files. BBC fetches, parses, and registers the skill. Show progress (fetching → parsing → registering → done) and surface any error inline.

This is critical to the launch story — it demonstrates the "open ecosystem" pillar. Treat it as a first-class action, not a buried secondary.

## States to design

- **Empty state for a fresh tenant** — first visit to `/library`. Show 5 built-in skills + 3 recommended starter packs ("Marketing-focused startup", "Engineering-focused startup", "Solo indie hacker"). Each starter pack is a bundle of skills + connectors.
- **Loaded state** — populated with cards. Default browsing.
- **Installing state** — card with install in progress (especially for connectors which OAuth + first-sync).
- **Installed state** — at least 1 of each category installed. Recommended band shows different items than already-installed.
- **Error state** — failed import, failed OAuth, failed first-sync.
- **Search results state** — query active, narrow card grid.
- **Detail open state** — drawer/modal/page open over the grid.

## Mobile

`/library` must work on mobile. Card grid collapses to 1 column on narrow viewports. Detail surface should be a full-screen sheet on mobile (not a drawer that hides behind nav). Recommended band scrolls horizontally on mobile.

## Accessibility

- Keyboard-navigable card grid (arrow keys move focus between cards)
- Detail surface dismissible with Escape
- Search input is the first focusable element on the page
- All install buttons have aria-labels including the item name

## Reference products to study

The designer should look at these products' marketplace/library/integration surfaces to inform decisions:

- **Glean Connectors Hub** — closest analog (typed enterprise search; "connector" is BBC's adopted noun)
- **Notion Integration Gallery** — clean card grid, category sidebar, "By {author}" trust signal
- **Cursor Directory / Cursor Plugins** — pattern for installable rules + plugins
- **Slack Marketplace** — install + scoped-permissions modal
- **Zapier App Directory** — search-first, category sidebar
- **Dust.tt Connections** — typed metadata-forward (similar typed-memory product)
- **Anthropic Skills marketplace** — SKILL.md install pattern

The Library should feel **legible** (not flashy), **fast** (keyboard-first), and **honest about provenance** (every card surfaces author, license, source). This is an OSS tool for technical users — over-designing it would read as inauthentic.

## Simplicity + user segmentation (critical)

The Library must feel **simple** above all. Two distinct users will land on this page and both need to feel at home:

- **Founders / curated path** (default surface): "What should I install today?" They want 3–5 curated recommendations visible without scrolling, starter packs they can install in one click, and category-filtered top picks. They should not see the "Import from URL" primitive first; they should encounter it only after they've scrolled / clicked into power-user mode.
- **Indie hackers / power-user path**: They want full control, fast scanning, all filters visible, the URL import primitive easy to reach, and minimal hand-holding. They prefer density to whitespace.

Implementation guidance for the designer: surface curated content first (founders' default), make power-user controls discoverable but not loud (indie hackers find them and stay). One UI, two effective experiences. Do not build two separate pages; do not build a beginner/advanced toggle as a primary UI. Solve via information density gradient: simple-by-default at the top, increasing density / more controls as the user scrolls or expands sections.

The Library should feel **legible** (not flashy), **fast** (keyboard-first), and **honest about provenance** (every card surfaces author, license, source). This is an OSS tool for technical users — over-designing it would read as inauthentic.

## Not in scope for this design pass

- Visual/aesthetic direction — designer chooses palette, type, density. BBC has a "paper palette" design system; the designer can either honor it or propose a fresh direction for the Library specifically.
- The Studio runtime surface (where installed skills actually execute). Already designed and shipped.
- The Settings surface for connector OAuth credentials. Already designed and shipped.
- The Queue surface where connector-emitted memory proposals are reviewed. Already designed and shipped.

## Deliverable

A complete design for the Library route covering:

1. The default `/library` page (with recommended band + 3 categories visible)
2. The Skills tab/category fully populated
3. The Connectors tab/category fully populated
4. The Providers tab/category fully populated
5. The Detail surface (one example per category — skill, connector, provider)
6. The Import-from-URL surface
7. The Empty state (fresh tenant)
8. The Installing / Error states
9. Mobile breakpoints for the default page and detail surface
