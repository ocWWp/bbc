# Phase H — Brain Editor + Relations Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Migrate `memory_files` to first-class typed objects (per §7 of the design doc), add the `memory_relations` table, build the Notion-style `/memory` editor with BlockNote + 7 typed supertag forms, ship CRUD + relation server actions, and migrate `examples/example-tenant/` content into the new schema.

**After this phase:** Founders can create/edit memory items in a Notion-like UI, link them with typed relations, and the data structure is ready for Phase J (Marketing Studio) to consume via type-filtered queries.

**Architecture summary:**
- DB: `memory_files` gains `type` (enum), `title`, `slug`, `status` (enum), `fields` (jsonb), `body_blocks` (jsonb[]). Existing `frontmatter` column kept for back-compat then dropped at end of phase.
- New table: `memory_relations(src_id, dst_id, kind, tenant_id, created_at, created_by)` with RLS.
- Editor: BlockNote (Mantine-based, React 19 + Next 16 compatible). Renders `body_blocks`. Typed sidebar form binds to `fields`.
- API: server actions only (matches existing dashboard convention). No REST endpoints.
- Migration: idempotent script reads `examples/example-tenant/memory/**/*.md`, parses frontmatter, classifies into one of 7 supertags, writes to DB.

**Tech stack additions (this phase):**
- `@blocknote/core` + `@blocknote/react` + `@blocknote/mantine`
- `@mantine/core` + `@mantine/hooks` (BlockNote peer deps)
- `zod` (already installed; used for per-supertag form schemas)
- `gray-matter` (frontmatter parser for migration script)

**Reference docs:**
- Design doc §7: `docs/plans/2026-05-10-bbc-user-facing-product-design.md` — data model, 7 supertags, why hybrid wins
- Phase G plan: `docs/plans/2026-05-10-phase-g-foundation.md` — primitive components this phase builds on
- Existing schema: `apps/dashboard/src/lib/supabase/database.types.ts`
- Existing actions style: `apps/dashboard/src/app/queue/actions.ts`
- Example content to migrate: `examples/example-tenant/memory/**/*.md`

**Working directory:** Run all commands from repo root unless noted. App-scoped commands use `pnpm --filter @bbc/dashboard`.

**Commit cadence:** One commit per task. Squash only at PR time.

**Branch:** Create `phase-h-brain-editor` from `main` via `git worktree add ../BB-C-phase-h phase-h-brain-editor` (mirrors Phase G workflow).

---

## Group 1 — Database migration (5 tasks)

### Task H.1: Add type/status enums + new columns to memory_files

**Files:**
- Create: `apps/dashboard/supabase/migrations/0017_memory_items_schema.sql`

**Step 1: Create migration file**

```sql
-- 0017_memory_items_schema.sql
-- Phase H: convert memory_files from generic markdown to typed memory items.

-- 1. Enums
do $$ begin
  create type memory_type as enum (
    'voice', 'decision', 'glossary', 'vendor', 'product', 'team', 'skill'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type memory_status as enum ('draft', 'active', 'archived');
exception when duplicate_object then null; end $$;

-- 2. New columns on memory_files (nullable for now; backfill in 0019)
alter table public.memory_files
  add column if not exists type        memory_type,
  add column if not exists title       text,
  add column if not exists slug        text,
  add column if not exists status      memory_status not null default 'draft',
  add column if not exists fields      jsonb         not null default '{}'::jsonb,
  add column if not exists body_blocks jsonb         not null default '[]'::jsonb;

-- 3. Slug uniqueness within (tenant_id, type)
create unique index if not exists memory_files_tenant_type_slug_uq
  on public.memory_files (tenant_id, type, slug)
  where slug is not null and type is not null;

-- 4. Backfill index for type-filtered queries (the agent's "what's our voice?" path)
create index if not exists memory_files_tenant_type_status_idx
  on public.memory_files (tenant_id, type, status);
```

**Step 2: Apply locally**

```bash
cd apps/dashboard
pnpm supabase db reset  # or `pnpm supabase migration up` if you want to preserve data
```

Expected: migration runs without error. Existing rows get `status='draft'`, type/title/slug NULL.

**Step 3: Verify**

```bash
pnpm supabase db diff --schema public | head -30
```

Expected: new columns + enums visible.

**Commit:** `Phase H.1: add memory_type/memory_status enums + typed columns on memory_files`

---

### Task H.2: Create memory_relations table

**Files:**
- Create: `apps/dashboard/supabase/migrations/0018_memory_relations.sql`

**Step 1: Migration**

```sql
-- 0018_memory_relations.sql
-- Phase H: explicit typed edges between memory items (Tana-style).

do $$ begin
  create type memory_relation_kind as enum (
    'cites', 'supersedes', 'implements', 'exemplifies', 'owned_by'
  );
exception when duplicate_object then null; end $$;

create table if not exists public.memory_relations (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  src_id      uuid not null references public.memory_files(id) on delete cascade,
  dst_id      uuid not null references public.memory_files(id) on delete cascade,
  kind        memory_relation_kind not null,
  created_at  timestamptz not null default now(),
  created_by  uuid references auth.users(id) on delete set null,
  unique (tenant_id, src_id, dst_id, kind),
  check (src_id <> dst_id)
);

create index if not exists memory_relations_tenant_src_idx
  on public.memory_relations (tenant_id, src_id);
create index if not exists memory_relations_tenant_dst_idx
  on public.memory_relations (tenant_id, dst_id);

-- RLS: only members of the tenant can read/write
alter table public.memory_relations enable row level security;

create policy memory_relations_tenant_read on public.memory_relations
  for select using (public.is_member_of(tenant_id));

create policy memory_relations_tenant_insert on public.memory_relations
  for insert with check (public.is_member_of(tenant_id));

create policy memory_relations_tenant_delete on public.memory_relations
  for delete using (public.is_member_of(tenant_id));
```

**Step 2: Apply + verify**

```bash
pnpm supabase migration up
psql "$DATABASE_URL" -c "\d memory_relations"
```

Expected: table with FKs, indexes, RLS policies visible.

**Commit:** `Phase H.2: add memory_relations table with RLS + typed edge kinds`

---

### Task H.3: Backfill existing memory_files rows into typed schema

**Files:**
- Create: `apps/dashboard/supabase/migrations/0019_backfill_memory_types.sql`

**Step 1: Backfill migration**

```sql
-- 0019_backfill_memory_types.sql
-- Phase H: classify existing memory_files rows into typed supertags based on path.

update public.memory_files
set
  type   = case
    when path like 'memory/design/voice%'         then 'voice'::memory_type
    when path like 'memory/decisions/%'           then 'decision'::memory_type
    when path like 'memory/glossary/%'            then 'glossary'::memory_type
    when path like 'memory/ops/vendors%'
      or path like 'memory/ops/providers/%'       then 'vendor'::memory_type
    when path like 'memory/people/%'              then 'team'::memory_type
    when path like 'memory/skills/%'              then 'skill'::memory_type
    when path like 'memory/product/%'             then 'product'::memory_type
    else null
  end,
  title  = coalesce(frontmatter->>'title', regexp_replace(path, '^.*/', '')),
  slug   = lower(regexp_replace(regexp_replace(path, '^.*/', ''), '\.md$', '')),
  status = case
    when frontmatter->>'status' = 'active'   then 'active'::memory_status
    when frontmatter->>'status' = 'archived' then 'archived'::memory_status
    else 'draft'::memory_status
  end
where type is null;
```

**Step 2: Apply + verify**

```bash
pnpm supabase migration up
psql "$DATABASE_URL" -c "select type, count(*) from public.memory_files group by type order by 1"
```

Expected: counts grouped by type. Any NULL `type` rows are leftover non-classifiable files — flagged for manual triage.

**Commit:** `Phase H.3: backfill existing memory_files into typed supertag schema`

---

### Task H.4: Regenerate database.types.ts

**Files:**
- Modify: `apps/dashboard/src/lib/supabase/database.types.ts`

**Step 1: Regenerate**

```bash
cd apps/dashboard
pnpm supabase gen types typescript --local > src/lib/supabase/database.types.ts
```

**Step 2: Type-check**

```bash
pnpm --filter @bbc/dashboard type-check
```

Expected: passes. (No callsites use the new columns yet.)

**Step 3: Verify types present**

```bash
grep -E "memory_type|memory_status|memory_relations|memory_relation_kind" apps/dashboard/src/lib/supabase/database.types.ts | head
```

Expected: enum types and relation table types appear.

**Commit:** `Phase H.4: regenerate database.types.ts for typed memory schema`

---

### Task H.5: Verify migration round-trips

**Files:** none (verification only)

**Step 1: Reset + reapply**

```bash
cd apps/dashboard
pnpm supabase db reset
```

Expected: all 19 migrations run clean. Existing seed runs.

**Step 2: Insert + query a typed row**

```bash
psql "$DATABASE_URL" <<'SQL'
-- assumes tenant exists from seed
insert into public.memory_files (tenant_id, path, content, type, title, slug, status, fields, body_blocks)
select id, 'memory/design/voice-test.md', '# test', 'voice', 'Voice Test', 'voice-test', 'draft',
       '{"register":"casual"}'::jsonb,
       '[{"type":"paragraph","content":"hello"}]'::jsonb
from public.tenants limit 1;

select id, type, title, slug, status, fields->>'register' as register
from public.memory_files where slug = 'voice-test';
SQL
```

Expected: insert succeeds, select returns the row with `register='casual'`.

**Commit:** none (verification task).

---

## Group 2 — Type system + supertag schemas (7 tasks)

Each typed supertag gets a zod schema describing its `fields` shape and a TypeScript interface. Schemas live in `src/lib/memory/types/<supertag>.ts` and re-export from `src/lib/memory/types/index.ts`.

### Task H.6: Voice supertag schema

**Files:**
- Create: `apps/dashboard/src/lib/memory/types/voice.ts`
- Create: `apps/dashboard/src/lib/memory/types/index.ts`

```ts
// voice.ts
import { z } from "zod";

export const voiceFieldsSchema = z.object({
  register: z.enum(["formal", "neutral", "casual"]).default("neutral"),
  audience: z.string().max(200).optional(),
  do_words: z.array(z.string()).default([]),
  dont_words: z.array(z.string()).default([]),
  example_phrases: z.array(z.string()).default([]),
});

export type VoiceFields = z.infer<typeof voiceFieldsSchema>;
```

```ts
// index.ts
export * from "./voice";

import { voiceFieldsSchema } from "./voice";
// ... other supertags imported below

export const supertagSchemas = {
  voice: voiceFieldsSchema,
  // decision, glossary, vendor, product, team, skill added by subsequent tasks
} as const;

export type Supertag = keyof typeof supertagSchemas;
```

**Verify:**
```bash
pnpm --filter @bbc/dashboard type-check
```

**Commit:** `Phase H.6: add voice supertag schema`

---

### Task H.7: Decision supertag schema

**Files:**
- Create: `apps/dashboard/src/lib/memory/types/decision.ts`
- Modify: `apps/dashboard/src/lib/memory/types/index.ts` (register)

```ts
// decision.ts
import { z } from "zod";

export const decisionFieldsSchema = z.object({
  number: z.number().int().positive().optional(),  // ADR-NNNN
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  status: z.enum(["proposed", "accepted", "superseded"]).default("proposed"),
  context: z.string().max(2000),
  decision: z.string().max(2000),
  consequences: z.string().max(2000),
  superseded_by: z.string().uuid().optional(),
});

export type DecisionFields = z.infer<typeof decisionFieldsSchema>;
```

Register in `index.ts`:
```ts
import { decisionFieldsSchema } from "./decision";
export * from "./decision";

export const supertagSchemas = {
  voice: voiceFieldsSchema,
  decision: decisionFieldsSchema,
} as const;
```

**Commit:** `Phase H.7: add decision supertag schema`

---

### Task H.8: Glossary supertag schema

**Files:** `apps/dashboard/src/lib/memory/types/glossary.ts`

```ts
import { z } from "zod";

export const glossaryFieldsSchema = z.object({
  term: z.string().min(1).max(200),
  pronunciation: z.string().max(200).optional(),
  definition: z.string().max(2000),
  aliases: z.array(z.string()).default([]),
  domain: z.string().max(100).optional(),
});

export type GlossaryFields = z.infer<typeof glossaryFieldsSchema>;
```

Register in index. **Commit:** `Phase H.8: add glossary supertag schema`

---

### Task H.9: Vendor supertag schema

```ts
// vendor.ts
import { z } from "zod";

export const vendorFieldsSchema = z.object({
  vendor_name: z.string().min(1).max(200),
  role: z.string().max(100),  // e.g. "llm-provider", "db-provider"
  status: z.enum(["candidate", "active", "deprecated"]).default("candidate"),
  homepage: z.string().url().optional(),
  pricing_url: z.string().url().optional(),
  notes: z.string().max(2000).optional(),
});

export type VendorFields = z.infer<typeof vendorFieldsSchema>;
```

**Commit:** `Phase H.9: add vendor supertag schema`

---

### Task H.10: Product supertag schema

```ts
// product.ts
import { z } from "zod";

export const productFieldsSchema = z.object({
  positioning: z.string().max(500),
  target_user: z.string().max(500),
  competitors: z.array(z.string()).default([]),
  differentiators: z.array(z.string()).default([]),
  launch_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export type ProductFields = z.infer<typeof productFieldsSchema>;
```

**Commit:** `Phase H.10: add product supertag schema`

---

### Task H.11: Team supertag schema

```ts
// team.ts
import { z } from "zod";

export const teamFieldsSchema = z.object({
  name: z.string().min(1).max(200),
  role: z.string().max(200),
  email: z.string().email().optional(),
  slack: z.string().max(100).optional(),
  github: z.string().max(100).optional(),
  bio: z.string().max(2000).optional(),
});

export type TeamFields = z.infer<typeof teamFieldsSchema>;
```

**Commit:** `Phase H.11: add team supertag schema`

---

### Task H.12: Skill supertag schema

```ts
// skill.ts
import { z } from "zod";

export const skillFieldsSchema = z.object({
  invocation: z.string().min(1).max(200),  // e.g. "/skill:run-research"
  extends: z.string().optional(),  // base skill ID
  when_to_use: z.string().max(2000),
  inputs: z.string().max(2000).optional(),
  outputs: z.string().max(2000).optional(),
  status: z.enum(["draft", "active", "deprecated"]).default("draft"),
});

export type SkillFields = z.infer<typeof skillFieldsSchema>;
```

**Commit:** `Phase H.12: add skill supertag schema + finalize supertagSchemas registry`

After this task, `supertagSchemas` registry contains all 7 entries. Verify with:
```bash
pnpm --filter @bbc/dashboard type-check
```

---

## Group 3 — BlockNote editor + UI shell (6 tasks)

### Task H.13: Install BlockNote + Mantine

**Step 1:**
```bash
pnpm --filter @bbc/dashboard add \
  @blocknote/core \
  @blocknote/react \
  @blocknote/mantine \
  @mantine/core \
  @mantine/hooks \
  gray-matter
```

Expected: 6 packages added.

**Step 2:** Add BlockNote CSS import to `apps/dashboard/src/app/layout.tsx`:
```tsx
import "@blocknote/mantine/style.css";
```

**Step 3:** Verify build still passes:
```bash
pnpm --filter @bbc/dashboard build
```

**Commit:** `Phase H.13: install BlockNote + Mantine + gray-matter deps`

---

### Task H.14: BlockNote editor primitive

**Files:**
- Create: `apps/dashboard/src/components/memory/block-editor.tsx`

```tsx
"use client";

import { useCreateBlockNote } from "@blocknote/react";
import { BlockNoteView } from "@blocknote/mantine";
import { useTheme } from "next-themes";
import type { PartialBlock } from "@blocknote/core";

type Props = {
  initialContent?: PartialBlock[];
  onChange?: (blocks: PartialBlock[]) => void;
  editable?: boolean;
};

export function BlockEditor({ initialContent, onChange, editable = true }: Props) {
  const { resolvedTheme } = useTheme();
  const editor = useCreateBlockNote({ initialContent });

  return (
    <BlockNoteView
      editor={editor}
      editable={editable}
      theme={resolvedTheme === "dark" ? "dark" : "light"}
      onChange={() => onChange?.(editor.document)}
    />
  );
}
```

**Verify:**
```bash
pnpm --filter @bbc/dashboard type-check
```

**Commit:** `Phase H.14: add BlockEditor primitive component (theme-aware)`

---

### Task H.15: `/memory` index page (list + filter by type)

**Files:**
- Create: `apps/dashboard/src/app/memory/page.tsx`
- Create: `apps/dashboard/src/app/memory/queries.ts`

```ts
// queries.ts
import { createClient } from "@/lib/supabase/server";
import type { Supertag } from "@/lib/memory/types";

export async function listMemoryItems(opts: { type?: Supertag; q?: string } = {}) {
  const supabase = await createClient();
  let query = supabase
    .from("memory_files")
    .select("id, type, title, slug, status, updated_at")
    .order("updated_at", { ascending: false });
  if (opts.type) query = query.eq("type", opts.type);
  if (opts.q) query = query.ilike("title", `%${opts.q}%`);
  const { data, error } = await query;
  if (error) throw error;
  return data;
}
```

```tsx
// page.tsx — server component
import Link from "next/link";
import { listMemoryItems } from "./queries";
import { Button } from "@/components/ui/button";

export default async function MemoryIndex({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; q?: string }>;
}) {
  const params = await searchParams;
  const items = await listMemoryItems({ type: params.type as never, q: params.q });
  return (
    <main className="container mx-auto py-8">
      <header className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">Memory</h1>
        <Button asChild><Link href="/memory/new">New item</Link></Button>
      </header>
      <ul className="space-y-1">
        {items.map((it) => (
          <li key={it.id}>
            <Link href={`/memory/${it.id}`} className="block py-2 px-3 rounded hover:bg-accent">
              <span className="inline-block w-20 text-xs uppercase tracking-wide text-muted-foreground">{it.type}</span>
              <span>{it.title}</span>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
```

**Commit:** `Phase H.15: add /memory index page (list + filter by type)`

---

### Task H.16: `/memory/new` page (type picker → blank editor)

**Files:**
- Create: `apps/dashboard/src/app/memory/new/page.tsx`

Two-step UI: pick supertag → redirect to `/memory/[new-id]` after server action creates blank record.

```tsx
import { createBlankItem } from "../actions";
import { Card } from "@/components/ui/card";
import { redirect } from "next/navigation";

const types = [
  { id: "voice", label: "Voice", hint: "How your product sounds" },
  { id: "decision", label: "Decision", hint: "An ADR" },
  { id: "glossary", label: "Glossary", hint: "A term + definition" },
  { id: "vendor", label: "Vendor", hint: "A tool or service" },
  { id: "product", label: "Product", hint: "Positioning + competitors" },
  { id: "team", label: "Team", hint: "A person on the team" },
  { id: "skill", label: "Skill", hint: "An agent skill" },
] as const;

export default function NewMemory() {
  async function pick(formData: FormData) {
    "use server";
    const type = formData.get("type") as never;
    const id = await createBlankItem(type);
    redirect(`/memory/${id}`);
  }
  return (
    <main className="container mx-auto py-8 max-w-3xl">
      <h1 className="text-2xl font-semibold mb-6">What are you creating?</h1>
      <form action={pick} className="grid grid-cols-2 gap-3">
        {types.map((t) => (
          <button key={t.id} name="type" value={t.id} type="submit">
            <Card className="p-4 text-left hover:border-accent transition">
              <div className="font-medium">{t.label}</div>
              <div className="text-sm text-muted-foreground">{t.hint}</div>
            </Card>
          </button>
        ))}
      </form>
    </main>
  );
}
```

**Commit:** `Phase H.16: add /memory/new type picker page`

---

### Task H.17: `/memory/[id]` detail page with editor + typed form sidebar

**Files:**
- Create: `apps/dashboard/src/app/memory/[id]/page.tsx`
- Create: `apps/dashboard/src/app/memory/[id]/editor-shell.tsx` (client)
- Create: `apps/dashboard/src/components/memory/typed-form.tsx` (client; renders the appropriate zod-bound form per supertag)

The detail page is a server component that loads the row, the editor-shell is the client component that renders BlockEditor + TypedForm side-by-side, and TypedForm switches on `type` to render the right fields.

For brevity in this plan, only the page shell is shown — the TypedForm implementation is mechanical (`react-hook-form` + zodResolver per supertag schema).

```tsx
// page.tsx
import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { EditorShell } from "./editor-shell";

export default async function MemoryDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("memory_files")
    .select("*")
    .eq("id", id)
    .single();
  if (error || !data) notFound();
  return <EditorShell item={data} />;
}
```

```tsx
// editor-shell.tsx
"use client";
import { BlockEditor } from "@/components/memory/block-editor";
import { TypedForm } from "@/components/memory/typed-form";
import { updateMemoryItem } from "../actions";
import { useDebouncedCallback } from "@mantine/hooks";
import { useState, useTransition } from "react";

export function EditorShell({ item }: { item: any }) {
  const [, startTransition] = useTransition();
  const save = useDebouncedCallback((next: Partial<typeof item>) => {
    startTransition(() => updateMemoryItem(item.id, next));
  }, 600);
  return (
    <div className="grid grid-cols-[1fr_320px] gap-6 container mx-auto py-6">
      <BlockEditor
        initialContent={item.body_blocks ?? []}
        onChange={(body_blocks) => save({ body_blocks })}
      />
      <TypedForm
        type={item.type}
        fields={item.fields}
        title={item.title}
        onChange={(patch) => save(patch)}
      />
    </div>
  );
}
```

**Commit:** `Phase H.17: add /memory/[id] detail page with editor + typed form sidebar`

---

### Task H.18: TypedForm switcher + per-supertag form components

**Files:**
- Create: `apps/dashboard/src/components/memory/typed-form.tsx`
- Create: `apps/dashboard/src/components/memory/forms/voice-form.tsx`
- Create: `apps/dashboard/src/components/memory/forms/decision-form.tsx`
- ...one per supertag (7 total)

`typed-form.tsx` is a thin switch on `props.type` that renders the right `<XForm />`. Each form uses `useForm({ resolver: zodResolver(<schema>) })`, debounces changes, and calls `onChange` with `{ title, fields }`.

Pattern (voice-form.tsx shown; others follow the same shape):
```tsx
"use client";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { voiceFieldsSchema, type VoiceFields } from "@/lib/memory/types/voice";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useEffect } from "react";

export function VoiceForm({ title, fields, onChange }: { title: string; fields: VoiceFields; onChange: (p: any) => void }) {
  const { register, watch } = useForm<VoiceFields & { title: string }>({
    resolver: zodResolver(voiceFieldsSchema.extend({ title: voiceFieldsSchema.shape ? undefined : undefined } as never)),
    defaultValues: { title, ...fields },
  });
  useEffect(() => {
    const sub = watch((v) => onChange({ title: v.title, fields: { register: v.register, audience: v.audience, do_words: v.do_words, dont_words: v.dont_words, example_phrases: v.example_phrases } }));
    return () => sub.unsubscribe();
  }, [watch, onChange]);
  return (
    <div className="space-y-3">
      <div><Label>Title</Label><Input {...register("title")} /></div>
      <div><Label>Register</Label><select {...register("register")} className="w-full"><option>formal</option><option>neutral</option><option>casual</option></select></div>
      <div><Label>Audience</Label><Input {...register("audience")} /></div>
      {/* do_words / dont_words / example_phrases — chip inputs, simple textarea split by newline for v1 */}
    </div>
  );
}
```

This task creates all 7 forms + the switcher.

```bash
pnpm --filter @bbc/dashboard add @hookform/resolvers react-hook-form
```

**Commit:** `Phase H.18: add 7 supertag forms + TypedForm switcher`

---

## Group 4 — CRUD + relations server actions (5 tasks)

All actions live in `apps/dashboard/src/app/memory/actions.ts` and follow the existing `queue/actions.ts` pattern (server-action exports, no API routes).

### Task H.19: createBlankItem + createMemoryItem actions

**Files:**
- Create: `apps/dashboard/src/app/memory/actions.ts`

```ts
"use server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentTenantId } from "@/lib/auth/tenant";  // existing helper
import { supertagSchemas, type Supertag } from "@/lib/memory/types";
import { revalidatePath } from "next/cache";

export async function createBlankItem(type: Supertag): Promise<string> {
  const supabase = await createClient();
  const tenantId = await getCurrentTenantId();
  const schema = supertagSchemas[type];
  const defaultFields = schema.parse({});  // zod fills defaults
  const { data, error } = await supabase
    .from("memory_files")
    .insert({
      tenant_id: tenantId,
      type,
      title: "Untitled",
      slug: `untitled-${Date.now()}`,
      status: "draft",
      fields: defaultFields,
      body_blocks: [],
      path: `memory/${type}/untitled-${Date.now()}.md`,
      content: "",
    })
    .select("id")
    .single();
  if (error) throw error;
  revalidatePath("/memory");
  return data.id;
}
```

**Commit:** `Phase H.19: add createBlankItem server action`

---

### Task H.20: updateMemoryItem action

```ts
export async function updateMemoryItem(
  id: string,
  patch: { title?: string; fields?: any; body_blocks?: any; status?: "draft" | "active" | "archived" }
): Promise<void> {
  const supabase = await createClient();
  // Validate fields against the row's type
  if (patch.fields !== undefined) {
    const { data: row } = await supabase.from("memory_files").select("type").eq("id", id).single();
    if (row?.type) supertagSchemas[row.type as Supertag].parse(patch.fields);
  }
  const { error } = await supabase
    .from("memory_files")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
  revalidatePath(`/memory/${id}`);
  revalidatePath("/memory");
}
```

**Commit:** `Phase H.20: add updateMemoryItem action with zod field validation`

---

### Task H.21: archiveMemoryItem action (soft delete)

Soft-delete only — no hard deletes for v1. Sets `status='archived'`.

```ts
export async function archiveMemoryItem(id: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("memory_files")
    .update({ status: "archived" })
    .eq("id", id);
  if (error) throw error;
  revalidatePath("/memory");
}
```

**Commit:** `Phase H.21: add archiveMemoryItem soft-delete action`

---

### Task H.22: createRelation + deleteRelation actions

```ts
import type { Database } from "@/lib/supabase/database.types";
type RelationKind = Database["public"]["Enums"]["memory_relation_kind"];

export async function createRelation(src_id: string, dst_id: string, kind: RelationKind): Promise<void> {
  if (src_id === dst_id) throw new Error("Cannot relate item to itself");
  const supabase = await createClient();
  const tenantId = await getCurrentTenantId();
  const { error } = await supabase
    .from("memory_relations")
    .insert({ src_id, dst_id, kind, tenant_id: tenantId });
  if (error && !error.message.includes("duplicate")) throw error;
  revalidatePath(`/memory/${src_id}`);
  revalidatePath(`/memory/${dst_id}`);
}

export async function deleteRelation(id: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from("memory_relations").delete().eq("id", id);
  if (error) throw error;
}
```

**Commit:** `Phase H.22: add createRelation + deleteRelation actions`

---

### Task H.23: getRelated + getBacklinks query helpers

**Files:**
- Modify: `apps/dashboard/src/app/memory/queries.ts`

```ts
export async function getRelated(id: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("memory_relations")
    .select("id, kind, dst:dst_id(id, type, title, slug)")
    .eq("src_id", id);
  if (error) throw error;
  return data ?? [];
}

export async function getBacklinks(id: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("memory_relations")
    .select("id, kind, src:src_id(id, type, title, slug)")
    .eq("dst_id", id);
  if (error) throw error;
  return data ?? [];
}

// Multi-hop neighborhood — used by Studio (Phase J) later.
export async function getNeighborhood(id: string, depth = 2): Promise<{ nodes: any[]; edges: any[] }> {
  const supabase = await createClient();
  const visited = new Set<string>([id]);
  const edges: any[] = [];
  const nodes: any[] = [];
  let frontier = [id];
  for (let d = 0; d < depth && frontier.length > 0; d++) {
    const { data: outgoing } = await supabase
      .from("memory_relations")
      .select("id, kind, src_id, dst_id")
      .in("src_id", frontier);
    const { data: incoming } = await supabase
      .from("memory_relations")
      .select("id, kind, src_id, dst_id")
      .in("dst_id", frontier);
    const all = [...(outgoing ?? []), ...(incoming ?? [])];
    edges.push(...all);
    frontier = all
      .flatMap((e) => [e.src_id, e.dst_id])
      .filter((nid) => !visited.has(nid));
    frontier.forEach((nid) => visited.add(nid));
  }
  const { data: nodeRows } = await supabase
    .from("memory_files")
    .select("id, type, title, slug")
    .in("id", [...visited]);
  return { nodes: nodeRows ?? [], edges };
}
```

**Commit:** `Phase H.23: add getRelated/getBacklinks/getNeighborhood query helpers`

---

## Group 5 — Relation UI (3 tasks)

### Task H.24: Relation chip picker in sidebar

**Files:**
- Create: `apps/dashboard/src/components/memory/relation-picker.tsx`

A combobox bound to `cmdk` (already installed in Phase G). User picks an existing memory item + a relation kind → calls `createRelation`. Pulses related nodes on save (UX from §8).

```tsx
"use client";
import { Command, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { createRelation } from "@/app/memory/actions";
import { useState } from "react";

const kinds = ["cites", "supersedes", "implements", "exemplifies", "owned_by"] as const;

export function RelationPicker({ srcId, allItems }: { srcId: string; allItems: { id: string; title: string; type: string }[] }) {
  const [kind, setKind] = useState<typeof kinds[number]>("cites");
  return (
    <div className="space-y-2">
      <select value={kind} onChange={(e) => setKind(e.target.value as never)} className="w-full">
        {kinds.map((k) => <option key={k} value={k}>{k}</option>)}
      </select>
      <Command>
        <CommandInput placeholder="Search items to link..." />
        <CommandList>
          {allItems.filter((i) => i.id !== srcId).map((i) => (
            <CommandItem key={i.id} onSelect={() => createRelation(srcId, i.id, kind)}>
              <span className="text-xs uppercase mr-2 text-muted-foreground">{i.type}</span>{i.title}
            </CommandItem>
          ))}
        </CommandList>
      </Command>
    </div>
  );
}
```

**Commit:** `Phase H.24: add relation chip picker component`

---

### Task H.25: Related + Backlinks panels on detail page

**Files:**
- Modify: `apps/dashboard/src/app/memory/[id]/page.tsx` (load relations + pass to shell)
- Modify: `apps/dashboard/src/app/memory/[id]/editor-shell.tsx` (render panels)

Shell now has 3 columns: editor | typed form + related panel | backlinks panel. Each related/backlink row links to the target item. Pulses on creation (CSS animation, 1s).

**Commit:** `Phase H.25: render related + backlinks panels on /memory/[id]`

---

### Task H.26: "Recent" + tenant-scoped search on /memory index

**Files:**
- Modify: `apps/dashboard/src/app/memory/page.tsx` (add search input)
- Modify: `apps/dashboard/src/app/memory/queries.ts` (already supports `q` param from H.15)

Adds a type filter (segmented control) + search input. Both update URL search params for shareable links.

**Commit:** `Phase H.26: add type filter + search on /memory index`

---

## Group 6 — Content migration (3 tasks)

### Task H.27: Migration script — parse example-tenant markdown

**Files:**
- Create: `apps/dashboard/scripts/seed-example-tenant.ts`

```ts
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import matter from "gray-matter";
import { createClient } from "@supabase/supabase-js";

const ROOT = "../../examples/example-tenant/memory";
const TENANT_ID = process.env.SEED_TENANT_ID!;
const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

function classify(relPath: string): string | null {
  if (relPath.startsWith("design/voice")) return "voice";
  if (relPath.startsWith("decisions/")) return "decision";
  if (relPath.startsWith("glossary/")) return "glossary";
  if (relPath.startsWith("ops/vendors") || relPath.startsWith("ops/providers/")) return "vendor";
  if (relPath.startsWith("people/")) return "team";
  if (relPath.startsWith("skills/")) return "skill";
  if (relPath.startsWith("product/")) return "product";
  return null;
}

async function main() {
  for (const file of walk(ROOT).filter((f) => f.endsWith(".md") || f.endsWith(".yaml"))) {
    const rel = relative(ROOT, file);
    const type = classify(rel);
    if (!type) { console.warn("skip:", rel); continue; }
    const raw = readFileSync(file, "utf8");
    const { data: fm, content } = file.endsWith(".md") ? matter(raw) : { data: {}, content: raw };
    const slug = rel.replace(/\.(md|yaml)$/, "").replace(/\//g, "-");
    const title = fm.title ?? fm.name ?? slug;
    await supabase.from("memory_files").upsert({
      tenant_id: TENANT_ID,
      type, title, slug, status: "active",
      path: `memory/${rel}`,
      content,
      fields: fm,  // raw frontmatter; manual cleanup in H.28
      body_blocks: [{ type: "paragraph", content }],  // placeholder; rich import in H.28
      frontmatter: fm,
    }, { onConflict: "tenant_id,type,slug" });
    console.log("seed:", type, slug);
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
```

Add to `package.json` scripts:
```json
"db:seed-example-tenant": "tsx scripts/seed-example-tenant.ts"
```

**Commit:** `Phase H.27: add seed-example-tenant migration script`

---

### Task H.28: Normalize fields per supertag during migration

Manual pass: for each migrated row, the raw frontmatter (`fields`) likely won't match the strict zod schema. Update the script to map known frontmatter keys → schema keys per supertag, dropping unknowns. For example:

- vendors (yaml): `vendor_name` ← `name`, `role` ← `role`, `homepage` ← `homepage`, `pricing_url` ← `pricing_url`
- decisions: `number` parsed from filename, `date` ← `date`, `status` ← `status`
- glossary: parse `term: definition` lines into individual rows? Or one row per file? Decision: one row per file for v1.

Re-run script after fix.

**Commit:** `Phase H.28: normalize migrated frontmatter into typed supertag fields`

---

### Task H.29: Verify migration → all rows pass zod validation

**Files:**
- Create: `apps/dashboard/scripts/verify-memory-types.ts`

```ts
import { createClient } from "@supabase/supabase-js";
import { supertagSchemas, type Supertag } from "../src/lib/memory/types";

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function main() {
  const { data: rows } = await supabase.from("memory_files").select("id, type, title, fields").not("type", "is", null);
  let pass = 0, fail = 0;
  for (const row of rows ?? []) {
    try {
      supertagSchemas[row.type as Supertag].parse(row.fields);
      pass++;
    } catch (e: any) {
      console.warn(`FAIL ${row.type}/${row.title}: ${e.errors?.[0]?.message ?? e.message}`);
      fail++;
    }
  }
  console.log(`pass=${pass} fail=${fail}`);
  process.exit(fail > 0 ? 1 : 0);
}
main();
```

Run:
```bash
pnpm --filter @bbc/dashboard exec tsx scripts/verify-memory-types.ts
```

Expected: all migrated rows validate. Any failures → either fix the zod schema (real gap) or fix the data (migration script bug).

**Commit:** `Phase H.29: add memory-type verification script`

---

## Group 7 — Verification (2 tasks)

### Task H.30: End-to-end smoke test

**Manual checklist:**
- [ ] Visit `/memory` → see migrated items, type filter works, search works.
- [ ] Click "New item" → pick "Voice" → land on `/memory/[id]` with blank editor + voice form.
- [ ] Type in the editor → autosave debounces, refresh page → content persisted.
- [ ] Fill `register` + `audience` → save → refresh → fields persisted.
- [ ] In the relation picker, link the new voice to an existing decision via `cites`.
- [ ] Open the decision → backlinks panel shows the voice item.
- [ ] Archive the voice item → it disappears from `/memory` index (status filter defaults to draft+active).
- [ ] Theme toggle still works in editor (light/dark BlockNote themes).
- [ ] ⌘K palette still works (Phase G primitive).

If all pass: Phase H is shippable.

**Commit:** none (verification only).

---

### Task H.31: Drop `content` + `frontmatter` columns (post-migration cleanup)

**Files:**
- Create: `apps/dashboard/supabase/migrations/0020_drop_legacy_memory_columns.sql`

```sql
-- 0020_drop_legacy_memory_columns.sql
-- Phase H cleanup: all callers now use fields + body_blocks. Drop legacy.

alter table public.memory_files
  drop column if exists content,
  drop column if exists frontmatter;
```

**Apply only after H.30 passes.** If anything still reads `content`/`frontmatter`, this will fail loudly at type-check time after regen.

```bash
pnpm supabase migration up
pnpm supabase gen types typescript --local > apps/dashboard/src/lib/supabase/database.types.ts
pnpm --filter @bbc/dashboard type-check
```

**Commit:** `Phase H.31: drop legacy content + frontmatter columns from memory_files`

---

## Summary

| Group | Tasks | What ships |
|---|---|---|
| 1. DB migration | H.1–H.5 | Typed columns, enums, `memory_relations` table, backfill, regenerated types |
| 2. Supertag schemas | H.6–H.12 | 7 zod schemas + central `supertagSchemas` registry |
| 3. Editor + UI shell | H.13–H.18 | BlockNote installed, BlockEditor primitive, `/memory` index + new + detail pages, 7 typed forms + switcher |
| 4. Server actions | H.19–H.23 | createBlank, update, archive, relation create/delete, query helpers (incl. multi-hop) |
| 5. Relation UI | H.24–H.26 | Relation picker, related + backlinks panels, type filter + search on index |
| 6. Migration | H.27–H.29 | Seed script, field normalization, type-validation verifier |
| 7. Verification + cleanup | H.30–H.31 | E2E smoke test, drop legacy columns |

**Total: 31 tasks, ~1.5 weeks.**

**Risks:**
- BlockNote v0.x is still pre-1.0 — version-pin to a specific minor. If breaking changes hit, swap to Tiptap (~2 day cost).
- Migration may surface frontmatter quirks per supertag that need schema relaxation; iterate H.28 ↔ H.29 until clean.
- `getNeighborhood` is N+1-ish at depth 2 — fine for v1, will need a CTE or postgres function if it gets called from hot paths.

**Phase H is complete when:**
1. All 31 tasks committed atomically.
2. `pnpm --filter @bbc/dashboard build` passes.
3. `pnpm --filter @bbc/dashboard exec tsx scripts/verify-memory-types.ts` exits 0.
4. Manual smoke test in H.30 passes.
5. Old `content`/`frontmatter` columns dropped (H.31).

Ready for executing-plans / subagent-driven-development in a fresh session.
