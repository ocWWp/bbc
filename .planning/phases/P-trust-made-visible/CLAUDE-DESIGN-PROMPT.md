# Claude Design prompt — Phase P Step 1 screens

> Paste the block below into Claude Design to generate mockups for the two new
> Step 1 screens. Design-system/aesthetic is intentionally omitted — that's
> already embedded in Claude Design. This prompt is UX + product-requirements only.
> The PLAN.md is written design-agnostic, so implementation does not block on these.

```
CONTEXT — what we're building

BBC ("Big Brain Company") is a "company brain" for small businesses. A team
feeds in its company knowledge — decisions, voice, vendors, people, glossary —
and BBC turns it into a typed, reviewable "memory." Role-based "Studios"
(Finance, Legal, HR, Marketing, Engineering, Founder, Designer, Support) then
generate real work documents — board memos, NDAs, job descriptions, launch
posts — grounded in that memory, with every claim traceable to a specific
memory entry. Nothing is saved or sent until a human approves it.

This task designs two screens for the v1.6 release. The product problem: BBC
already has all this machinery but buries it. Users can't easily discover what
BBC can do, and they can't see what BBC is about to do before it does it. These
two screens fix both. Audience: small technical teams (think a 4-person
startup), but the interface must be simple enough for a non-technical teammate
to use without help — plain language, no jargon.

THE END-TO-END FLOW (design screens 1 and 2; screens 3–4 already exist, listed
for context):
  1. User logs in → lands on the GALLERY (screen 1), the new home screen.
  2. Searches/filters, clicks a template card → drops into that template.
  3. CONFIGURE (exists): a short form of template-specific inputs.
  4. PLAN-CONFIRM (screen 2): before anything generates, BBC shows what it's
     about to do and what memory it will use. User confirms or goes back.
  5. GENERATE → REVIEW (exists): the finished document with Approve / Reject.

────────────────────────────────────────────────────────────
SCREEN 1 — THE GALLERY (home screen)

PRODUCT REQUIREMENT
The gallery is the front door. A first-time user landing here must immediately
understand "BBC can produce real, finished work for my company, and there's a
lot it can do." It replaces an older flow that forced users to pick a department
before seeing anything. It must feel full and capable on first load — a sparse
gallery kills confidence. Templates are cross-listed: one template (e.g.
"Contract review") can appear under multiple departments (Legal, Finance,
Founder), because users shouldn't have to guess which department owns it.

UX
- Layout: a search field at the top; a horizontal row of filter chips below it
  (an "All" chip plus one per department); then a grid of template cards.
- Each card shows: template name in plain language ("Board financials memo",
  not an id); a one-sentence description of what it produces; the output type
  ("Document", "X thread", "Email"); the department it belongs to; and a small
  trust signal — "Reads from: your decisions, voice" — naming which kinds of
  company memory this template draws on.
- Search: typing filters the grid live, matching name and description. No
  submit button.
- Filter chips: clicking a department chip narrows the grid to that department
  (including cross-listed templates); the active chip is visibly selected;
  clicking it again or clicking "All" clears it. Search and chip combine (AND).
- Empty state: when nothing matches, a calm "No templates match that" — never a
  blank void.
- Clicking a card navigates into that template, landing on the Configure step
  with the template pre-selected.
- The first-load state matters most: design it as if every department has 5+
  templates and the grid is rich.

────────────────────────────────────────────────────────────
SCREEN 2 — PLAN-CONFIRM ("here's what I'll do")

PRODUCT REQUIREMENT
This is the trust moment and the single most important new screen. Before BBC
generates anything, it shows the user exactly what it's about to do and which
pieces of their company memory it will draw on. The user explicitly confirms
before any generation happens. This is what lets a small team trust BBC with
their company — they see the plan first.
Two hard rules:
- This is NOT the review of finished work. It comes BEFORE generation. (The
  review/approve step comes after, and already exists.)
- It shows CANDIDATE memory — what's in scope and available — NOT citations.
  Citations only exist after the document is generated. Don't label these as
  "sources used"; they are "what this can draw on."

UX
- Appears as a distinct step in the flow: after the user fills the Configure
  form and submits, before the generating/loading state. It's a checkpoint, not
  a modal afterthought — give it real space.
- It shows:
  1. A plain-language summary line, e.g. "Generate a board financials memo using
     the 'Board financials' template, grounded in 6 pieces of your company
     memory. Nothing is saved or sent until you approve it."
  2. A "What this draws on" section: candidate memory listed as items, each
     tagged by kind (Decision, Voice, Vendor, Team member, Glossary term) with a
     short label. Design for both a handful of items and a couple dozen.
  3. If no memory matched: an honest, non-alarming empty state — "No company
     memory matched this task. The draft will be based only on what you typed."
- Two actions, clearly weighted: a secondary "Back" (returns to the Configure
  form to edit inputs) and a primary "Confirm & generate" (proceeds to
  generation).
- After "Confirm & generate", the existing generating → review flow takes over.
- Tone: calm and legible. A non-technical user should read this screen and feel
  "I understand exactly what's about to happen."

────────────────────────────────────────────────────────────
Design screens 1 and 2, light and dark. Screen 1 (the gallery) is the
centerpiece — invest the most there.
```
