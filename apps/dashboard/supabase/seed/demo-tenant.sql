-- v1.5 D-W7-1: Demo tenant fixture
--
-- Bootstraps a fictional startup ("Acme") with enough memory + skills +
-- connector state + recommendations that the dashboard renders meaningfully
-- on first load. Designed for local dev + the hosted demo at bbc.tools.
--
-- The fictional company:
--   "Acme" — a B2B SaaS that turns whiteboard photos into searchable
--   transcripts + summaries for engineering teams. Founder: Ada Park.
--   Stage: seed-funded, 6 humans, paying pilot with two design-tool
--   companies. Voice: precise, plainspoken, technical but not jargon-y.
--
-- Counts (per launch plan acceptance):
--   - 5 product
--   - 12 decisions
--   - 8 voice
--   - 10 glossary
--   - 15 vendors
--   - 8 team
--   = 58 memory_files rows
--   - 2 installed skills (Launch-post writer, Postmortem author)
--   - 1 Notion connector with realistic sync state
--   - 3 pending recommendations
--
-- Usage (local dev):
--   1. Sign up + sign in locally so auth.users has a row for you.
--   2. In Supabase SQL editor:  select public.seed_demo_tenant(auth.uid());
--   3. Reload /library — populated dashboard.
--   4. To reset the fixture:    select public.reset_demo_tenant(auth.uid());
--
-- Idempotent: re-running seed_demo_tenant() returns the existing tenant id
-- if one already exists for the given owner; reset_demo_tenant() deletes
-- and re-seeds in one call.
--
-- Spec: docs/plans/2026-05-12-bbc-launch-plan.md §3 / Week 7

-- ---------------------------------------------------------------------------
-- reset_demo_tenant — wipe + re-seed
-- ---------------------------------------------------------------------------

create or replace function public.reset_demo_tenant(p_owner_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_tenant_id uuid;
begin
  if p_owner_user_id is null then
    raise exception 'invalid_input: owner user id required' using errcode = 'P0006';
  end if;
  -- Delete on cascade handles memory_files, tenant_members, tenant_skills,
  -- tenant_connectors, recommendations, queue_items, etc. — all FK'd to
  -- tenants.id with on delete cascade.
  delete from public.tenants where slug = 'demo-acme' returning id into v_tenant_id;
  return public.seed_demo_tenant(p_owner_user_id);
end
$$;

revoke execute on function public.reset_demo_tenant(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- seed_demo_tenant — create the fixture if absent, return its id
-- ---------------------------------------------------------------------------

create or replace function public.seed_demo_tenant(p_owner_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_tenant_id uuid;
  v_now       timestamptz := now();
  v_today     text := to_char(v_now at time zone 'utc', 'YYYY-MM-DD');
  v_existing  uuid;
begin
  if p_owner_user_id is null then
    raise exception 'invalid_input: owner user id required' using errcode = 'P0006';
  end if;
  if not exists(select 1 from auth.users where id = p_owner_user_id) then
    raise exception 'not_found: user does not exist' using errcode = 'P0004';
  end if;

  -- Idempotent fast path.
  select id into v_existing from public.tenants where slug = 'demo-acme';
  if v_existing is not null then
    -- Make sure the caller is a member; otherwise add them as admin so the
    -- dashboard can resolve a tenant for them.
    insert into public.tenant_members (tenant_id, user_id, role)
    values (v_existing, p_owner_user_id, 'admin')
    on conflict (tenant_id, user_id) do nothing;
    return v_existing;
  end if;

  -- 1. tenant + admin membership
  insert into public.tenants (slug, name, plan, created_by)
    values ('demo-acme', 'Acme (demo)', 'free', p_owner_user_id)
    returning id into v_tenant_id;

  insert into public.tenant_members (tenant_id, user_id, role)
    values (v_tenant_id, p_owner_user_id, 'admin');

  -- 2. Voice (8) — what Acme sounds like
  insert into public.memory_files (tenant_id, path, content, frontmatter, type, title, slug, status, fields) values
    (v_tenant_id, 'memory/voice/main.md',          'Main voice: plain, technical, no jargon. Address the reader directly. Verbs over nouns. Numbers over adjectives.', '{}'::jsonb, 'voice', 'Main voice',                   'main',                   'active', jsonb_build_object('register','neutral','audience','engineering managers','do_words', jsonb_build_array('precise','plainspoken','active'),'dont_words', jsonb_build_array('synergy','leverage','best-in-class','seamlessly'),'example_phrases', jsonb_build_array('Latency dropped from 1.4s to 220ms.','We removed the queue; here is why.'))),
    (v_tenant_id, 'memory/voice/customer-emails.md','Customer-facing emails: warmer than docs, still terse. Open with the answer, not the apology.',                  '{}'::jsonb, 'voice', 'Customer email voice',         'customer-emails',        'active', jsonb_build_object('register','casual','audience','paying customers','do_words', jsonb_build_array('here is the fix','rolling out tonight'),'dont_words', jsonb_build_array('rest assured','at this time'),'example_phrases', jsonb_build_array('Here is what changed and what to expect.','Rolling out 7pm PT tonight.'))),
    (v_tenant_id, 'memory/voice/release-notes.md',  'Release notes: changelog tone. Past tense, action-first. One bullet per change. No marketing claims.',           '{}'::jsonb, 'voice', 'Release-note voice',           'release-notes',          'active', jsonb_build_object('register','neutral','audience','users','do_words', jsonb_build_array('added','fixed','removed'),'dont_words', jsonb_build_array('thrilled','excited','game-changing'),'example_phrases', jsonb_build_array('Added: photo-to-doc batch import.','Fixed: OCR confidence stuck at 0.92.'))),
    (v_tenant_id, 'memory/voice/landing-page.md',   'Landing page: write for skimmers. Header is the thesis. Subhead is the proof. Body sentences max 12 words.',     '{}'::jsonb, 'voice', 'Landing-page voice',           'landing-page',           'active', jsonb_build_object('register','neutral','audience','engineering managers evaluating tools','do_words', jsonb_build_array('measurable','specific'),'dont_words', jsonb_build_array('AI-powered','revolutionary'),'example_phrases', jsonb_build_array('Whiteboards become searchable in 4 seconds.'))),
    (v_tenant_id, 'memory/voice/hn-comments.md',    'HN: defend the design choice with numbers, not adjectives. Concede the weak point in the first sentence.',       '{}'::jsonb, 'voice', 'Hacker News voice',            'hn-comments',            'active', jsonb_build_object('register','casual','audience','HN readers','do_words', jsonb_build_array('we tried','here is why'),'dont_words', jsonb_build_array('cope','skill issue'),'example_phrases', jsonb_build_array('Fair — our 7B model loses to GPT-4o on cursive. Here is what we did about it.'))),
    (v_tenant_id, 'memory/voice/postmortem.md',     'Postmortems: timeline first, blame nowhere. Five-whys with citations. End with the system change, not a vow.',     '{}'::jsonb, 'voice', 'Postmortem voice',             'postmortem',             'active', jsonb_build_object('register','formal','audience','team + customers','do_words', jsonb_build_array('timeline','impact','remediation'),'dont_words', jsonb_build_array('human error','sorry'),'example_phrases', jsonb_build_array('14:02 UTC — first failed OCR job. 14:11 — paging alerted.'))),
    (v_tenant_id, 'memory/voice/recruiting.md',     'Recruiting: be specific about the role, the stack, the company stage. No promises about growth or comp band.',    '{}'::jsonb, 'voice', 'Recruiting voice',             'recruiting',             'active', jsonb_build_object('register','neutral','audience','senior eng candidates','do_words', jsonb_build_array('honest','specific'),'dont_words', jsonb_build_array('rockstar','ninja','10x'),'example_phrases', jsonb_build_array('Six humans, $3M seed, 11 paying pilots.'))),
    (v_tenant_id, 'memory/voice/sales.md',          'Sales: lead with the customer problem, not the feature list. One ask per email. No follow-up "just checking in".','{}'::jsonb, 'voice', 'Sales voice',                  'sales',                  'active', jsonb_build_object('register','neutral','audience','engineering leadership at design tools','do_words', jsonb_build_array('quantify','show numbers'),'dont_words', jsonb_build_array('just checking in','circle back'),'example_phrases', jsonb_build_array('You mentioned your team loses ~3h/week re-typing whiteboard photos. Worth a 20-min look?')));

  -- 3. Decisions (12) — ADRs as typed memory
  insert into public.memory_files (tenant_id, path, content, frontmatter, type, title, slug, status, fields) values
    (v_tenant_id, 'memory/decisions/0001-stack.md',           'Adopt Next.js 16 on Cloudflare Workers via OpenNext for the dashboard. Reason: edge deploys + one codebase. Cost: less native Workers ergonomics.', '{}'::jsonb, 'decision', 'Stack: Next.js + Cloudflare via OpenNext',       'stack',                          'active', jsonb_build_object('number',1, 'date','2026-02-04','status','accepted','context','Need edge deploy + Vercel-class DX.','decision','Next.js 16 on CF Workers via OpenNext.','consequences','Some Worker APIs need shims; image optimization needs care.')),
    (v_tenant_id, 'memory/decisions/0002-db.md',              'Use Supabase Postgres + RLS as the system of record. Reason: builtin auth + RLS lets us multi-tenant cheaply.',                                  '{}'::jsonb, 'decision', 'Datastore: Supabase Postgres + RLS',              'db',                             'active', jsonb_build_object('number',2, 'date','2026-02-06','status','accepted','context','We need multi-tenant from day 1 without writing a tenancy framework.','decision','Supabase Postgres + RLS, auth via Supabase Auth.','consequences','Coupled to Supabase; mitigated by keeping schema portable.')),
    (v_tenant_id, 'memory/decisions/0003-ocr.md',             'Self-host TrOCR for handwriting; fall back to OpenAI vision when confidence < 0.85.',                                                              '{}'::jsonb, 'decision', 'OCR: TrOCR with vision fallback',                 'ocr',                            'active', jsonb_build_object('number',3, 'date','2026-02-19','status','accepted','context','Handwriting OCR quality varies wildly; vision-LLMs are accurate but slow + costly.','decision','TrOCR primary, OpenAI vision fallback on low confidence.','consequences','Two models to maintain; clear cost ceiling per page.')),
    (v_tenant_id, 'memory/decisions/0004-queue.md',           'Replace Redis-backed BullMQ with Postgres SKIP LOCKED queue. Reason: one fewer dep, throughput is enough at our scale.',                          '{}'::jsonb, 'decision', 'Queue: Postgres SKIP LOCKED',                     'queue',                          'active', jsonb_build_object('number',4, 'date','2026-03-02','status','accepted','context','We had 1 Redis incident in 2 weeks and our queue tops out at 50 jobs/sec.','decision','Postgres SKIP LOCKED queue inside the app DB.','consequences','Less observable than BullMQ UI; we accept that.')),
    (v_tenant_id, 'memory/decisions/0005-billing.md',         'Use Stripe Tax + invoiced billing for pilots; usage metering deferred until 50 paying tenants.',                                                  '{}'::jsonb, 'decision', 'Billing: Stripe Tax, no metering yet',            'billing',                        'active', jsonb_build_object('number',5, 'date','2026-03-09','status','accepted','context','Pilot revenue is invoice-based; we do not want to build a metering pipeline now.','decision','Stripe Tax + invoiced; revisit metering at 50 paying tenants.','consequences','Per-customer revenue is fully known; per-feature COGS is not.')),
    (v_tenant_id, 'memory/decisions/0006-pricing.md',         'Public pricing $29/mo per seat, with a 5-seat minimum. No free tier; 14-day trial.',                                                                '{}'::jsonb, 'decision', 'Pricing: $29/seat, 5-seat minimum',               'pricing',                        'active', jsonb_build_object('number',6, 'date','2026-03-21','status','accepted','context','Free tier on doc-extraction is a known abuse vector.','decision','Paid-only, 14-day trial, 5-seat minimum.','consequences','Higher friction; better conversion + lower COGS.')),
    (v_tenant_id, 'memory/decisions/0007-licence.md',         'License the agent-skill toolkit AGPLv3, the dashboard app source-available, the marketplace MIT.',                                                  '{}'::jsonb, 'decision', 'Licensing: AGPL + source-available + MIT',        'licence',                        'active', jsonb_build_object('number',7, 'date','2026-04-02','status','accepted','context','Three components, three audiences.','decision','AGPL for skills; source-available for dashboard; MIT for marketplace SDK.','consequences','Marketplace adoption is unblocked; dashboard fork-and-compete is gated.')),
    (v_tenant_id, 'memory/decisions/0008-eu-region.md',       'Deploy an EU Workers region + EU Postgres replica before our first EU customer goes live.',                                                          '{}'::jsonb, 'decision', 'EU deployment ahead of customers',                 'eu-region',                      'active', jsonb_build_object('number',8, 'date','2026-04-10','status','accepted','context','Two prospects asked for EU residency.','decision','EU Workers + read-replica before signing them.','consequences','Higher infra spend earlier; faster sales cycle.')),
    (v_tenant_id, 'memory/decisions/0009-hiring.md',          'Hire generalist eng (1) + design-engineer (1) before specializing. Defer ML hire until OCR is the bottleneck for >25% of customers.',              '{}'::jsonb, 'decision', 'Next 2 eng hires are generalists',                'hiring',                         'active', jsonb_build_object('number',9, 'date','2026-04-12','status','accepted','context','We have 2 ML PhDs + 1 fullstack; bottleneck is ship velocity.','decision','Hire 2 generalists; ML role on hold.','consequences','OCR roadmap slows; product velocity ~2x.')),
    (v_tenant_id, 'memory/decisions/0010-mobile.md',          'Build the iOS capture app in SwiftUI native, no React Native. Reason: camera + on-device OCR is the path.',                                       '{}'::jsonb, 'decision', 'iOS: SwiftUI native',                             'mobile',                         'active', jsonb_build_object('number',10,'date','2026-04-20','status','accepted','context','Camera + Vision framework + Core ML are the differentiator.','decision','Native SwiftUI app, shared GraphQL with web.','consequences','Two codebases for capture; iOS is the only mobile platform until 50 paying tenants.')),
    (v_tenant_id, 'memory/decisions/0011-llm-provider.md',    'Default to Anthropic Claude for summarization; allow per-tenant override to OpenAI.',                                                                '{}'::jsonb, 'decision', 'LLM: Claude default, per-tenant override',         'llm-provider',                   'active', jsonb_build_object('number',11,'date','2026-04-28','status','accepted','context','Both models perform well; Claude wins on tone for engineering docs.','decision','Claude default, OpenAI swappable per tenant.','consequences','Two SDKs to keep in step; configurability sells.')),
    (v_tenant_id, 'memory/decisions/0012-export-format.md',   'Markdown export is canonical; PDF is a rendered view. Reason: tools read markdown; PDFs are an output, not a source.',                              '{}'::jsonb, 'decision', 'Export: Markdown is canonical',                   'export-format',                  'active', jsonb_build_object('number',12,'date','2026-05-04','status','accepted','context','Customers asked for both; treating markdown as source keeps us interop-friendly.','decision','Markdown canonical; PDF rendered.','consequences','PDF is best-effort; markdown is contract.'));

  -- 4. Product (5) — what we are and how we describe it
  insert into public.memory_files (tenant_id, path, content, frontmatter, type, title, slug, status, fields) values
    (v_tenant_id, 'memory/product/positioning.md',  'Acme turns whiteboard photos into searchable docs in seconds. For engineering teams that work in person but document async.', '{}'::jsonb, 'product', 'Positioning',                'positioning',  'active', jsonb_build_object('positioning','Searchable docs from whiteboard photos. For eng teams who meet in person.','target_user','Eng managers at 10–200 person companies.','competitors', jsonb_build_array('Notion AI','Mem','Otter for video'),'differentiators', jsonb_build_array('Handwriting-first OCR','Native iOS capture','Per-org private models'))),
    (v_tenant_id, 'memory/product/feature-capture.md','iOS capture app: snap a photo of a whiteboard; transcript appears in the team workspace within 4 seconds.',                  '{}'::jsonb, 'product', 'Feature: iOS capture',       'feature-capture','active', jsonb_build_object('positioning','Capture in <10 taps, transcript in <4s.','target_user','Engineering managers who run in-person standups + design reviews.','competitors', jsonb_build_array('Otter.ai','Notion AI'),'differentiators', jsonb_build_array('On-device pre-OCR','Offline capture queue'))),
    (v_tenant_id, 'memory/product/feature-search.md', 'Full-text + semantic search across captured whiteboards, with per-photo permalink + bounding-box quotes.',                  '{}'::jsonb, 'product', 'Feature: cross-board search', 'feature-search','active', jsonb_build_object('positioning','Find anything anyone ever wrote on any whiteboard.','target_user','Senior eng + PMs writing roadmaps.','competitors', jsonb_build_array('Notion AI','Mem','GitHub code search'),'differentiators', jsonb_build_array('Bounding-box quote attribution','Per-author dedup'))),
    (v_tenant_id, 'memory/product/feature-export.md','Export captured docs to Markdown, Notion, Linear, or Confluence with one click.',                                            '{}'::jsonb, 'product', 'Feature: one-click export',  'feature-export','active', jsonb_build_object('positioning','Whiteboards land in whatever doc tool you already use.','target_user','Teams using Notion or Confluence as the source of truth.','competitors', jsonb_build_array('Notion AI'),'differentiators', jsonb_build_array('Bi-directional sync','Author preserved'))),
    (v_tenant_id, 'memory/product/launch.md',        'V1 GA launch: 2026-06-15. Headline: "Whiteboards, searchable." Channels: HN front-page Show, Product Hunt, eng-leader newsletters.','{}'::jsonb, 'product', 'V1 GA launch',                'launch',        'active', jsonb_build_object('positioning','Whiteboards, searchable.','target_user','Eng managers at 10–200 person startups.','competitors', jsonb_build_array('Notion AI','Mem'),'differentiators', jsonb_build_array('Handwriting-first','Native iOS','Per-org models'), 'launch_date','2026-06-15'));

  -- 5. Glossary (10) — terms Acme defines
  insert into public.memory_files (tenant_id, path, content, frontmatter, type, title, slug, status, fields) values
    (v_tenant_id, 'memory/glossary/board.md',         'Board: a single whiteboard capture, including all photos taken of it in one session.',                       '{}'::jsonb, 'glossary', 'Board',                  'board',         'active', jsonb_build_object('term','Board','definition','A single whiteboard capture, including all photos taken of it in one session.','aliases', jsonb_build_array('Capture','Session'),'domain','product')),
    (v_tenant_id, 'memory/glossary/transcript.md',    'Transcript: the searchable text + structured blocks extracted from a Board.',                                 '{}'::jsonb, 'glossary', 'Transcript',             'transcript',    'active', jsonb_build_object('term','Transcript','definition','The searchable text + structured blocks extracted from a Board.','aliases', jsonb_build_array('Doc'),'domain','product')),
    (v_tenant_id, 'memory/glossary/confidence.md',    'Confidence: per-token probability emitted by the OCR model. Threshold 0.85 triggers vision-LLM fallback.',     '{}'::jsonb, 'glossary', 'Confidence',             'confidence',    'active', jsonb_build_object('term','Confidence','definition','Per-token probability emitted by the OCR model.','aliases', jsonb_build_array('OCR confidence'),'domain','engineering')),
    (v_tenant_id, 'memory/glossary/org.md',           'Org: the tenant unit. One billing account; many workspaces.',                                                  '{}'::jsonb, 'glossary', 'Org',                    'org',           'active', jsonb_build_object('term','Org','definition','The tenant unit. One billing account; many workspaces.','aliases', jsonb_build_array('Tenant','Account'),'domain','product')),
    (v_tenant_id, 'memory/glossary/workspace.md',     'Workspace: a sub-org scope, usually mapped to a team. Members can be in multiple workspaces.',                  '{}'::jsonb, 'glossary', 'Workspace',              'workspace',     'active', jsonb_build_object('term','Workspace','definition','A sub-org scope, usually mapped to a team.','aliases', jsonb_build_array('Team'),'domain','product')),
    (v_tenant_id, 'memory/glossary/capture-fee.md',   'Capture fee: COGS per board, dominated by OCR + storage. Target: <$0.04.',                                     '{}'::jsonb, 'glossary', 'Capture fee',            'capture-fee',   'active', jsonb_build_object('term','Capture fee','definition','COGS per board, dominated by OCR + storage. Target: <$0.04.','aliases', jsonb_build_array('Per-board cost'),'domain','finance')),
    (v_tenant_id, 'memory/glossary/v1.md',            'V1: the first paid GA release, scoped to web + iOS capture + Notion/Linear/Confluence export.',                '{}'::jsonb, 'glossary', 'V1',                     'v1',            'active', jsonb_build_object('term','V1','definition','The first paid GA release.','aliases', jsonb_build_array('Launch','GA'),'domain','product')),
    (v_tenant_id, 'memory/glossary/byok.md',          'BYOK: bring-your-own-key. Tenants paste their own LLM API key in /settings/keys; we never proxy traffic.',     '{}'::jsonb, 'glossary', 'BYOK',                   'byok',          'active', jsonb_build_object('term','BYOK','definition','Bring-your-own-key. Tenants paste their own LLM API key.','aliases', jsonb_build_array(),'domain','engineering')),
    (v_tenant_id, 'memory/glossary/dlq.md',           'DLQ: dead-letter queue. Where webhook payloads that fail verification go to be debugged, never replayed.',     '{}'::jsonb, 'glossary', 'DLQ',                    'dlq',           'active', jsonb_build_object('term','DLQ','definition','Dead-letter queue.','aliases', jsonb_build_array('Dead letter'),'domain','engineering')),
    (v_tenant_id, 'memory/glossary/rls.md',           'RLS: row-level security. Every multi-tenant query is gated by an is_member_of(tenant_id) policy.',             '{}'::jsonb, 'glossary', 'RLS',                    'rls',           'active', jsonb_build_object('term','RLS','definition','Row-level security in Postgres.','aliases', jsonb_build_array(),'domain','engineering'));

  -- 6. Vendors (15)
  insert into public.memory_files (tenant_id, path, content, frontmatter, type, title, slug, status, fields) values
    (v_tenant_id, 'memory/vendors/anthropic.md',  'Anthropic — primary LLM for summarization + tone-following extraction.',                  '{}'::jsonb, 'vendor', 'Anthropic',   'anthropic',  'active', jsonb_build_object('vendor_name','Anthropic',  'role','llm-provider',           'status','active',    'homepage','https://anthropic.com',  'notes','Primary; Claude Sonnet.')),
    (v_tenant_id, 'memory/vendors/openai.md',     'OpenAI — fallback LLM + vision when TrOCR confidence < 0.85.',                            '{}'::jsonb, 'vendor', 'OpenAI',      'openai',     'active', jsonb_build_object('vendor_name','OpenAI',     'role','llm-provider-fallback',  'status','active',    'homepage','https://openai.com',     'notes','Vision fallback; per-tenant override.')),
    (v_tenant_id, 'memory/vendors/supabase.md',   'Supabase — Postgres + Auth + RLS. System of record.',                                     '{}'::jsonb, 'vendor', 'Supabase',    'supabase',   'active', jsonb_build_object('vendor_name','Supabase',   'role','db-provider',            'status','active',    'homepage','https://supabase.com',   'notes','Single-region for now; EU replica planned.')),
    (v_tenant_id, 'memory/vendors/cloudflare.md', 'Cloudflare — Workers + R2 + DNS. Edge compute for the dashboard.',                        '{}'::jsonb, 'vendor', 'Cloudflare',  'cloudflare', 'active', jsonb_build_object('vendor_name','Cloudflare', 'role','hosting',                'status','active',    'homepage','https://cloudflare.com', 'notes','Workers + R2 for board photos.')),
    (v_tenant_id, 'memory/vendors/stripe.md',     'Stripe — billing + tax. Invoiced today; metered usage deferred.',                          '{}'::jsonb, 'vendor', 'Stripe',      'stripe',     'active', jsonb_build_object('vendor_name','Stripe',     'role','billing',                'status','active',    'homepage','https://stripe.com',     'notes','Stripe Tax enabled.')),
    (v_tenant_id, 'memory/vendors/resend.md',     'Resend — transactional email. 100/day free tier covers us until pilot expansion.',         '{}'::jsonb, 'vendor', 'Resend',      'resend',     'active', jsonb_build_object('vendor_name','Resend',     'role','email-delivery',         'status','active',    'homepage','https://resend.com',     'notes','From bbc.local.')),
    (v_tenant_id, 'memory/vendors/posthog.md',    'PostHog — product analytics + session replay. Self-host once 50 paying tenants.',          '{}'::jsonb, 'vendor', 'PostHog',     'posthog',    'active', jsonb_build_object('vendor_name','PostHog',    'role','analytics',              'status','active',    'homepage','https://posthog.com',    'notes','Cloud for now; self-host at 50 tenants.')),
    (v_tenant_id, 'memory/vendors/sentry.md',     'Sentry — error tracking + perf monitoring for the dashboard + iOS apps.',                  '{}'::jsonb, 'vendor', 'Sentry',      'sentry',     'active', jsonb_build_object('vendor_name','Sentry',     'role','error-tracking',         'status','active',    'homepage','https://sentry.io',      'notes','Free tier OK at our error volume.')),
    (v_tenant_id, 'memory/vendors/linear.md',     'Linear — task tracking. Cycle-based; ADR-labeled issues are decisions.',                   '{}'::jsonb, 'vendor', 'Linear',      'linear',     'active', jsonb_build_object('vendor_name','Linear',     'role','task-tracking',          'status','active',    'homepage','https://linear.app',     'notes','Two teams: Engineering, Product.')),
    (v_tenant_id, 'memory/vendors/notion.md',     'Notion — docs + customer-facing knowledge base. Considering migration to BBC.',            '{}'::jsonb, 'vendor', 'Notion',      'notion',     'active', jsonb_build_object('vendor_name','Notion',     'role','docs',                   'status','active',    'homepage','https://notion.so',      'notes','Source of truth for the wiki.')),
    (v_tenant_id, 'memory/vendors/github.md',     'GitHub — source control + Actions CI.',                                                    '{}'::jsonb, 'vendor', 'GitHub',      'github',     'active', jsonb_build_object('vendor_name','GitHub',     'role','source-control',         'status','active',    'homepage','https://github.com',     'notes','Actions for CI; security scanning enabled.')),
    (v_tenant_id, 'memory/vendors/segment.md',    'Segment — event router (sunset planned). Routed to PostHog + warehouse.',                  '{}'::jsonb, 'vendor', 'Segment',     'segment',    'active', jsonb_build_object('vendor_name','Segment',    'role','event-router',           'status','deprecated','homepage','https://segment.com',    'notes','Sunset by 2026-07.')),
    (v_tenant_id, 'memory/vendors/snowflake.md',  'Snowflake — data warehouse. Replicates Postgres + event stream nightly.',                  '{}'::jsonb, 'vendor', 'Snowflake',   'snowflake',  'active', jsonb_build_object('vendor_name','Snowflake',  'role','warehouse',              'status','active',    'homepage','https://snowflake.com',  'notes','Nightly batch.')),
    (v_tenant_id, 'memory/vendors/algolia.md',    'Algolia — search infrastructure for transcripts. Considering pgvector instead.',           '{}'::jsonb, 'vendor', 'Algolia',     'algolia',    'active', jsonb_build_object('vendor_name','Algolia',    'role','search',                 'status','candidate', 'homepage','https://algolia.com',    'notes','Evaluating pgvector + Tantivy as alternatives.')),
    (v_tenant_id, 'memory/vendors/twilio.md',     'Twilio — SMS for 2FA. Optional; only for orgs that opt into phone-MFA.',                   '{}'::jsonb, 'vendor', 'Twilio',      'twilio',     'active', jsonb_build_object('vendor_name','Twilio',     'role','sms',                    'status','candidate', 'homepage','https://twilio.com',     'notes','Opt-in phone MFA only.'));

  -- 7. Team (8)
  insert into public.memory_files (tenant_id, path, content, frontmatter, type, title, slug, status, fields) values
    (v_tenant_id, 'memory/team/ada-park.md',     'Ada Park — founder + CEO. Owns vision, fundraising, customer development.',                   '{}'::jsonb, 'team', 'Ada Park',     'ada-park',     'active', jsonb_build_object('name','Ada Park',     'role','Founder/CEO',           'email','ada@acme.demo',     'github','ada-park',     'bio','Ex-Notion eng, ex-Y Combinator partner.')),
    (v_tenant_id, 'memory/team/ben-zhang.md',    'Ben Zhang — co-founder + CTO. Owns architecture, OCR pipeline, iOS.',                          '{}'::jsonb, 'team', 'Ben Zhang',    'ben-zhang',    'active', jsonb_build_object('name','Ben Zhang',    'role','Co-founder/CTO',        'email','ben@acme.demo',     'github','ben-zhang',    'bio','Ex-Apple Vision team; PhD CMU ML.')),
    (v_tenant_id, 'memory/team/cara-singh.md',   'Cara Singh — design eng. Owns dashboard, marketing site, brand.',                              '{}'::jsonb, 'team', 'Cara Singh',   'cara-singh',   'active', jsonb_build_object('name','Cara Singh',   'role','Design Engineer',       'email','cara@acme.demo',    'github','cara-s',       'bio','Ex-Linear; type design hobbyist.')),
    (v_tenant_id, 'memory/team/devi-okoro.md',   'Devi Okoro — ML eng. Owns TrOCR fine-tuning + vision-fallback router.',                        '{}'::jsonb, 'team', 'Devi Okoro',   'devi-okoro',   'active', jsonb_build_object('name','Devi Okoro',   'role','ML Engineer',           'email','devi@acme.demo',    'github','devi-o',       'bio','Ex-Hugging Face transformer team.')),
    (v_tenant_id, 'memory/team/eli-park.md',     'Eli Park — fullstack eng. Owns Cloudflare edge work + queue + integrations.',                  '{}'::jsonb, 'team', 'Eli Park',     'eli-park',     'active', jsonb_build_object('name','Eli Park',     'role','Fullstack Engineer',    'email','eli@acme.demo',     'github','eli-park',     'bio','Ex-Vercel platform team.')),
    (v_tenant_id, 'memory/team/farah-mehta.md',  'Farah Mehta — pilot success. Runs all 11 pilots + collects voice-of-customer.',                '{}'::jsonb, 'team', 'Farah Mehta',  'farah-mehta',  'active', jsonb_build_object('name','Farah Mehta',  'role','Pilot Success',         'email','farah@acme.demo',   'github','farahm',       'bio','Ex-Front CX lead.')),
    (v_tenant_id, 'memory/team/advisor-jules.md','Jules Tan — advisor. Founder of WhiteboardCo (acq. Miro 2022). Quarterly 1:1 with Ada.',         '{}'::jsonb, 'team', 'Jules Tan (advisor)','advisor-jules','active', jsonb_build_object('name','Jules Tan',    'role','Advisor',               'email','jules@whiteboard.co','github','jules-t',      'bio','Founder, WhiteboardCo (Miro acq).')),
    (v_tenant_id, 'memory/team/advisor-priya.md','Priya R. — advisor. GP at Foundation. Quarterly 1:1; on-call for fundraising prep.',           '{}'::jsonb, 'team', 'Priya R. (advisor)', 'advisor-priya','active', jsonb_build_object('name','Priya R.',     'role','Advisor / Investor',    'email','priya@foundation.vc','github','',            'bio','GP, Foundation Capital.'));

  -- 8. Installed skills (2) — match the two installed=true rows in catalog
  insert into public.tenant_skills (tenant_id, source_kind, skill_name, skill_role, manifest, body, body_hash, installed_by)
  values
    (v_tenant_id, 'builtin', 'Launch-post writer', 'marketing',
      jsonb_build_object('reads', jsonb_build_array('voice','decision','product'), 'writes', jsonb_build_array('note')),
      '# Launch-post writer\n\nDrafts an X/LinkedIn/Threads post for the given launch, citing decisions + product memory in the company voice.',
      'demo-hash-launch-post', p_owner_user_id),
    (v_tenant_id, 'builtin', 'Postmortem author', 'engineering',
      jsonb_build_object('reads', jsonb_build_array('decision','skill','product'), 'writes', jsonb_build_array('decision','skill')),
      '# Postmortem author\n\nTurns an incident timeline into a structured RCA — five whys, recommendations, follow-ups.',
      'demo-hash-postmortem', p_owner_user_id);

  -- 9. Installed Notion connector with realistic sync state
  insert into public.tenant_connectors (
    tenant_id, connector_id, mapping, sync_state, last_sync_at, last_sync_status, installed_by
  ) values (
    v_tenant_id,
    'notion',
    jsonb_build_object('type_property','type','page_size',200),
    jsonb_build_object('cursor','demo-cursor-page-3','pages_synced',147,'last_run_emitted',23),
    v_now - interval '47 minutes',
    'ok',
    p_owner_user_id
  );

  -- 10. Pending recommendations (3) — surfaces in /library "Recommended for you"
  insert into public.recommendations (tenant_id, target_kind, target_id, reason_code, reason_human, observed_signal)
  values
    (v_tenant_id, 'connector', 'github',
      'no_code_source',
      'You have 12 ADRs but no GitHub connector. Wire GitHub so PRs labeled `adr` land as proposals in /queue.',
      jsonb_build_object('decision_count',12,'has_github',false)),
    (v_tenant_id, 'skill', 'HN Show-post writer',
      'launch_in_plan',
      'A V1 launch is on the calendar (2026-06-15). The HN Show-post writer drafts the front-page-shaped Show-HN in your voice.',
      jsonb_build_object('launch_date','2026-06-15')),
    (v_tenant_id, 'connector', 'linear',
      'team_uses_linear',
      'Your vendor memory lists Linear as your task tracker but BBC is not synced. Cycles become product rows; ADR-labeled issues become decisions.',
      jsonb_build_object('vendor_linear','active'));

  return v_tenant_id;
end
$$;

revoke execute on function public.seed_demo_tenant(uuid) from public, anon, authenticated;
