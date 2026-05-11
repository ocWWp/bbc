# Phase G — Foundation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Install Tailwind v4 + shadcn/ui, define the dark/light design token system with Brain/Studio personality variants, build the locked component library, ship legal pages + cookie banner, wire Sentry + PostHog observability, and wire Resend transactional email with the four launch templates. After this phase, every subsequent phase (H–L) builds on top of this foundation.

**Architecture:** Phase G is parallel-friendly because nothing in it depends on the others except (a) Tailwind/shadcn must be installed before component primitives, (b) tokens must be defined before primitives use them. Five logical groups: Foundation install → Tokens + theme → Component primitives → Legal + observability → Email templates. Each task is one focused action, committed atomically.

**Tech Stack:** Next.js 16 (App Router, Turbopack), React 19, Tailwind v4 (CSS-first config), shadcn/ui (React 19 + Tailwind 4 compatible), next-themes, cmdk, sonner, @sentry/nextjs, posthog-js + posthog-node, Resend (already installed at v4), React Email for templates.

**Reference docs:**
- Design doc: `docs/plans/2026-05-10-bbc-user-facing-product-design.md` (§4 theme model, §10 pricing, §11 dynamic tools)
- Existing dashboard styles: `apps/dashboard/src/app/globals.css` (will be replaced by Tailwind tokens)
- Existing Resend wiring: `apps/dashboard/src/lib/email.ts`

**Working directory:** Run all commands from `apps/dashboard/` unless noted.

**Commit cadence:** One commit per task. Squash only at PR time.

---

## Group 1 — Foundation install

### Task 1: Install Tailwind v4 + PostCSS

**Files:**
- Modify: `apps/dashboard/package.json` (deps)
- Create: `apps/dashboard/postcss.config.mjs`

**Step 1: Install deps**

Run from repo root:
```bash
pnpm --filter @bbc/dashboard add -D tailwindcss@^4 @tailwindcss/postcss postcss
```

Expected: 3 packages added, no errors.

**Step 2: Create PostCSS config**

Create `apps/dashboard/postcss.config.mjs`:
```js
const config = {
  plugins: {
    "@tailwindcss/postcss": {},
  },
};

export default config;
```

**Step 3: Verify**

Run from `apps/dashboard/`:
```bash
pnpm type-check
```

Expected: PASS — type-check still clean.

**Step 4: Commit**

```bash
git add apps/dashboard/package.json apps/dashboard/postcss.config.mjs pnpm-lock.yaml
git commit -m "Phase G.1: install Tailwind v4 + PostCSS"
```

---

### Task 2: Init shadcn/ui with React 19 + Tailwind 4

**Files:**
- Create: `apps/dashboard/components.json`
- Modify: `apps/dashboard/src/app/globals.css` (Tailwind + shadcn directives)
- Modify: `apps/dashboard/tsconfig.json` (path alias `@/components/ui/*`)

**Step 1: Replace globals.css with Tailwind base**

Replace entire contents of `apps/dashboard/src/app/globals.css` with:
```css
@import "tailwindcss";
@import "tw-animate-css";

@custom-variant dark (&:is(.dark *));

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-card: var(--card);
  --color-card-foreground: var(--card-foreground);
  --color-popover: var(--popover);
  --color-popover-foreground: var(--popover-foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-secondary: var(--secondary);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-accent: var(--accent);
  --color-accent-foreground: var(--accent-foreground);
  --color-destructive: var(--destructive);
  --color-destructive-foreground: var(--destructive-foreground);
  --color-border: var(--border);
  --color-input: var(--input);
  --color-ring: var(--ring);
  --radius-sm: calc(var(--radius) - 4px);
  --radius-md: calc(var(--radius) - 2px);
  --radius-lg: var(--radius);
  --radius-xl: calc(var(--radius) + 4px);
}
```

(Tokens will be filled in Task 4 — this is just the Tailwind scaffold.)

**Step 2: Install tw-animate-css**

```bash
pnpm --filter @bbc/dashboard add tw-animate-css
```

**Step 3: Create components.json**

Create `apps/dashboard/components.json`:
```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "new-york",
  "rsc": true,
  "tsx": true,
  "tailwind": {
    "config": "",
    "css": "src/app/globals.css",
    "baseColor": "neutral",
    "cssVariables": true,
    "prefix": ""
  },
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils",
    "ui": "@/components/ui",
    "lib": "@/lib",
    "hooks": "@/hooks"
  },
  "iconLibrary": "lucide"
}
```

**Step 4: Add path aliases to tsconfig.json**

Verify `apps/dashboard/tsconfig.json` `compilerOptions.paths` includes:
```json
"paths": {
  "@/*": ["./src/*"]
}
```

If missing, add it.

**Step 5: Install required deps**

```bash
pnpm --filter @bbc/dashboard add lucide-react class-variance-authority clsx tailwind-merge
```

**Step 6: Create utils helper**

Create `apps/dashboard/src/lib/utils.ts`:
```ts
import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

**Step 7: Verify**

```bash
pnpm --filter @bbc/dashboard type-check
```

Expected: PASS.

**Step 8: Commit**

```bash
git add apps/dashboard/components.json apps/dashboard/src/app/globals.css apps/dashboard/src/lib/utils.ts apps/dashboard/tsconfig.json apps/dashboard/package.json pnpm-lock.yaml
git commit -m "Phase G.2: init shadcn/ui scaffold + utils"
```

---

## Group 2 — Design tokens + theme provider

### Task 3: Define BBC color tokens (dark + light)

**Files:**
- Modify: `apps/dashboard/src/app/globals.css`

Refer to design doc §4 for the theme model. Brain surfaces use **lime** accent; Studio surfaces use **coral**.

**Step 1: Add token blocks**

Append to `apps/dashboard/src/app/globals.css`:
```css
:root {
  /* Neutral base (zinc) */
  --background: oklch(0.985 0 0);
  --foreground: oklch(0.145 0 0);
  --card: oklch(1 0 0);
  --card-foreground: oklch(0.145 0 0);
  --popover: oklch(1 0 0);
  --popover-foreground: oklch(0.145 0 0);
  --primary: oklch(0.205 0 0);
  --primary-foreground: oklch(0.985 0 0);
  --secondary: oklch(0.97 0 0);
  --secondary-foreground: oklch(0.205 0 0);
  --muted: oklch(0.97 0 0);
  --muted-foreground: oklch(0.556 0 0);
  --accent: oklch(0.97 0 0);
  --accent-foreground: oklch(0.205 0 0);
  --destructive: oklch(0.577 0.245 27.325);
  --destructive-foreground: oklch(0.985 0 0);
  --border: oklch(0.922 0 0);
  --input: oklch(0.922 0 0);
  --ring: oklch(0.708 0 0);
  --radius: 0.5rem;

  /* BBC personality accents — work in both modes */
  --brain-accent: oklch(0.78 0.22 130);   /* lime-400 vibe */
  --brain-accent-foreground: oklch(0.205 0 0);
  --studio-accent: oklch(0.7 0.21 20);    /* coral / rose-400 vibe */
  --studio-accent-foreground: oklch(0.985 0 0);
}

.dark {
  --background: oklch(0.145 0 0);
  --foreground: oklch(0.985 0 0);
  --card: oklch(0.205 0 0);
  --card-foreground: oklch(0.985 0 0);
  --popover: oklch(0.205 0 0);
  --popover-foreground: oklch(0.985 0 0);
  --primary: oklch(0.922 0 0);
  --primary-foreground: oklch(0.205 0 0);
  --secondary: oklch(0.269 0 0);
  --secondary-foreground: oklch(0.985 0 0);
  --muted: oklch(0.269 0 0);
  --muted-foreground: oklch(0.708 0 0);
  --accent: oklch(0.269 0 0);
  --accent-foreground: oklch(0.985 0 0);
  --destructive: oklch(0.704 0.191 22.216);
  --destructive-foreground: oklch(0.985 0 0);
  --border: oklch(1 0 0 / 10%);
  --input: oklch(1 0 0 / 15%);
  --ring: oklch(0.556 0 0);

  /* BBC personality accents — slightly shifted for dark mode */
  --brain-accent: oklch(0.82 0.22 130);
  --brain-accent-foreground: oklch(0.145 0 0);
  --studio-accent: oklch(0.75 0.21 20);
  --studio-accent-foreground: oklch(0.145 0 0);
}

@layer base {
  * {
    @apply border-border outline-ring/50;
  }
  body {
    @apply bg-background text-foreground antialiased;
    font-feature-settings: "rlig" 1, "calt" 1;
  }
}
```

**Step 2: Extend `@theme inline` for personality accents**

In the `@theme inline` block at the top of globals.css, add:
```css
--color-brain-accent: var(--brain-accent);
--color-brain-accent-foreground: var(--brain-accent-foreground);
--color-studio-accent: var(--studio-accent);
--color-studio-accent-foreground: var(--studio-accent-foreground);
```

**Step 3: Smoke test in dev server**

```bash
pnpm --filter @bbc/dashboard dev
```

Visit `http://localhost:3000`. Expected: page renders, no console errors. Existing UI may look broken (we're mid-migration) — that's OK.

Kill the dev server.

**Step 4: Commit**

```bash
git add apps/dashboard/src/app/globals.css
git commit -m "Phase G.3: define BBC design tokens (dark + light + Brain/Studio accents)"
```

---

### Task 4: Install next-themes + theme provider

**Files:**
- Modify: `apps/dashboard/package.json`
- Create: `apps/dashboard/src/components/theme-provider.tsx`
- Modify: `apps/dashboard/src/app/layout.tsx`

**Step 1: Install**

```bash
pnpm --filter @bbc/dashboard add next-themes
```

**Step 2: Create theme provider**

Create `apps/dashboard/src/components/theme-provider.tsx`:
```tsx
"use client";

import * as React from "react";
import { ThemeProvider as NextThemesProvider } from "next-themes";

export function ThemeProvider({
  children,
  ...props
}: React.ComponentProps<typeof NextThemesProvider>) {
  return <NextThemesProvider {...props}>{children}</NextThemesProvider>;
}
```

**Step 3: Wire into root layout**

Modify `apps/dashboard/src/app/layout.tsx` — replace contents with:
```tsx
import type { Metadata } from "next";
import { ThemeProvider } from "@/components/theme-provider";
import Nav from "@/components/Nav";
import "./globals.css";

export const metadata: Metadata = {
  title: "BBC — Big Brain Company",
  description: "The shared brain for your team and your AI agents.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          <div className="mx-auto max-w-7xl p-6">
            <Nav />
            <main>{children}</main>
          </div>
        </ThemeProvider>
      </body>
    </html>
  );
}
```

**Step 4: Verify**

```bash
pnpm --filter @bbc/dashboard type-check
pnpm --filter @bbc/dashboard dev
```

Visit `http://localhost:3000`. Open dev tools, run in console:
```js
document.documentElement.classList.toggle('dark')
```
Expected: page switches between light and dark.

Kill the dev server.

**Step 5: Commit**

```bash
git add apps/dashboard/package.json apps/dashboard/src/components/theme-provider.tsx apps/dashboard/src/app/layout.tsx pnpm-lock.yaml
git commit -m "Phase G.4: add next-themes provider + dark/light/system support"
```

---

### Task 5: Theme switcher component

**Files:**
- Create: `apps/dashboard/src/components/theme-toggle.tsx`

**Step 1: Create**

Create `apps/dashboard/src/components/theme-toggle.tsx`:
```tsx
"use client";

import * as React from "react";
import { Moon, Sun, Monitor } from "lucide-react";
import { useTheme } from "next-themes";

const OPTIONS = [
  { value: "light", icon: Sun, label: "Light" },
  { value: "dark", icon: Moon, label: "Dark" },
  { value: "system", icon: Monitor, label: "System" },
] as const;

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);

  if (!mounted) return <div className="h-8 w-24" aria-hidden />;

  return (
    <div className="inline-flex rounded-md border border-border bg-card p-0.5" role="radiogroup" aria-label="Theme">
      {OPTIONS.map(({ value, icon: Icon, label }) => (
        <button
          key={value}
          role="radio"
          aria-checked={theme === value}
          aria-label={label}
          onClick={() => setTheme(value)}
          className={`flex h-7 w-7 items-center justify-center rounded-sm transition-colors ${
            theme === value ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Icon className="h-3.5 w-3.5" />
        </button>
      ))}
    </div>
  );
}
```

**Step 2: Mount it in Nav**

Modify `apps/dashboard/src/components/Nav.tsx` — add `<ThemeToggle />` to the nav-user section (next to signout). Import: `import { ThemeToggle } from "./theme-toggle";`.

**Step 3: Visual verification**

```bash
pnpm --filter @bbc/dashboard dev
```

Expected: 3-segment toggle in nav. Click each — page background switches. Refresh — preference persists. System mode tracks OS preference.

Kill dev server.

**Step 4: Commit**

```bash
git add apps/dashboard/src/components/theme-toggle.tsx apps/dashboard/src/components/Nav.tsx
git commit -m "Phase G.5: add light/dark/system theme toggle"
```

---

## Group 3 — Component primitives

These are shadcn/ui components installed via the shadcn CLI. Each is one task: install → smoke test in an isolated demo page → commit.

### Task 6: Button (+ Brain/Studio variants)

**Files:**
- Created by shadcn: `apps/dashboard/src/components/ui/button.tsx`
- Modify (post-install): add `brain` and `studio` variants

**Step 1: Install via shadcn CLI**

```bash
cd apps/dashboard
pnpm dlx shadcn@latest add button
```

Expected: Creates `src/components/ui/button.tsx`. Accept any prompts (overwrite OK, but should be a fresh install).

**Step 2: Add Brain/Studio variants**

Open `apps/dashboard/src/components/ui/button.tsx`. The file uses `cva` for variants. Inside `buttonVariants`, in the `variants.variant` object, add two new variants:

```ts
brain: "bg-brain-accent text-brain-accent-foreground shadow-xs hover:bg-brain-accent/90",
studio: "bg-studio-accent text-studio-accent-foreground shadow-xs hover:bg-studio-accent/90",
```

**Step 3: Smoke test in scratch page**

Create `apps/dashboard/src/app/_scratch/page.tsx` (note the underscore prefix — will not route in production):
```tsx
import { Button } from "@/components/ui/button";

export default function Scratch() {
  return (
    <div className="space-y-4 p-8">
      <h2 className="text-2xl font-bold">Button</h2>
      <div className="flex flex-wrap gap-2">
        <Button variant="default">Default</Button>
        <Button variant="brain">Brain (lime)</Button>
        <Button variant="studio">Studio (coral)</Button>
        <Button variant="destructive">Destructive</Button>
        <Button variant="outline">Outline</Button>
        <Button variant="secondary">Secondary</Button>
        <Button variant="ghost">Ghost</Button>
        <Button variant="link">Link</Button>
        <Button disabled>Disabled</Button>
      </div>
    </div>
  );
}
```

**Step 4: Verify**

```bash
pnpm --filter @bbc/dashboard dev
```

Visit `http://localhost:3000/_scratch`. Expected: all 9 button variants render. Brain is lime, Studio is coral. Toggle theme — both still readable in dark mode.

Kill dev server.

**Step 5: Commit**

```bash
git add apps/dashboard/src/components/ui/button.tsx apps/dashboard/src/app/_scratch/page.tsx
git commit -m "Phase G.6: add Button primitive with Brain/Studio variants"
```

---

### Task 7: Input + Label

**Files:**
- Created by shadcn: `src/components/ui/input.tsx`, `src/components/ui/label.tsx`

**Step 1: Install**

```bash
cd apps/dashboard
pnpm dlx shadcn@latest add input label
```

**Step 2: Add to scratch page**

Append to `apps/dashboard/src/app/_scratch/page.tsx` (inside the main `div`):
```tsx
<h2 className="text-2xl font-bold mt-8">Input</h2>
<div className="max-w-sm space-y-4">
  <div className="space-y-1.5">
    <Label htmlFor="brain-dump">Brain dump</Label>
    <Input id="brain-dump" placeholder="Tell us about your company..." />
  </div>
  <div className="space-y-1.5">
    <Label htmlFor="email">Email</Label>
    <Input id="email" type="email" placeholder="founder@startup.com" />
  </div>
  <div className="space-y-1.5">
    <Label htmlFor="disabled-input">Disabled</Label>
    <Input id="disabled-input" disabled value="Can't edit this" />
  </div>
</div>
```

Add imports at top of file:
```tsx
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
```

**Step 3: Verify**

```bash
pnpm --filter @bbc/dashboard dev
```

Visit `/_scratch`. Expected: 3 input fields with labels, focus rings visible, disabled state has reduced opacity. Switch theme — borders + bg adapt.

Kill dev server.

**Step 4: Commit**

```bash
git add apps/dashboard/src/components/ui/input.tsx apps/dashboard/src/components/ui/label.tsx apps/dashboard/src/app/_scratch/page.tsx
git commit -m "Phase G.7: add Input + Label primitives"
```

---

### Task 8: Card

**Files:**
- Created by shadcn: `src/components/ui/card.tsx`

**Step 1: Install**

```bash
cd apps/dashboard
pnpm dlx shadcn@latest add card
```

**Step 2: Add to scratch**

Append to scratch page:
```tsx
<h2 className="text-2xl font-bold mt-8">Card</h2>
<div className="grid gap-4 md:grid-cols-2">
  <Card>
    <CardHeader>
      <CardTitle>Brain item</CardTitle>
      <CardDescription>Type: Decision · Updated 2 days ago</CardDescription>
    </CardHeader>
    <CardContent>
      <p className="text-sm">Use Postgres for primary database.</p>
    </CardContent>
    <CardFooter>
      <Button variant="brain" size="sm">Open</Button>
    </CardFooter>
  </Card>
  <Card>
    <CardHeader>
      <CardTitle>Workflow proposal</CardTitle>
      <CardDescription>Cross-platform campaign</CardDescription>
    </CardHeader>
    <CardContent>
      <p className="text-sm">3 X posts + 1 LinkedIn + 1 Threads</p>
    </CardContent>
    <CardFooter>
      <Button variant="studio" size="sm">Run →</Button>
    </CardFooter>
  </Card>
</div>
```

Add to imports:
```tsx
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
```

**Step 3: Verify**

Visit `/_scratch`. Expected: two cards side-by-side, distinct accents.

**Step 4: Commit**

```bash
git add apps/dashboard/src/components/ui/card.tsx apps/dashboard/src/app/_scratch/page.tsx
git commit -m "Phase G.8: add Card primitive"
```

---

### Task 9: Dialog

**Files:**
- Created by shadcn: `src/components/ui/dialog.tsx`

**Step 1: Install**

```bash
cd apps/dashboard
pnpm dlx shadcn@latest add dialog
```

**Step 2: Add to scratch**

Append:
```tsx
<h2 className="text-2xl font-bold mt-8">Dialog</h2>
<Dialog>
  <DialogTrigger asChild><Button>Open dialog</Button></DialogTrigger>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>Review proposal</DialogTitle>
      <DialogDescription>The marketing agent drafted this post using your voice.</DialogDescription>
    </DialogHeader>
    <p className="text-sm">Just shipped MCP write tools. Agents can now propose changes through BBC's queue. Approve or reject — your call.</p>
    <DialogFooter>
      <Button variant="outline">Reject</Button>
      <Button variant="brain">Accept</Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

Add to imports:
```tsx
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
```

**Step 3: Verify**

Click "Open dialog". Expected: modal opens with overlay, ESC dismisses, click outside dismisses. Focus traps inside.

**Step 4: Commit**

```bash
git add apps/dashboard/src/components/ui/dialog.tsx apps/dashboard/src/app/_scratch/page.tsx
git commit -m "Phase G.9: add Dialog primitive"
```

---

### Task 10: Toast (Sonner)

**Files:**
- Created by shadcn: `src/components/ui/sonner.tsx`
- Modify: `src/app/layout.tsx`

**Step 1: Install**

```bash
cd apps/dashboard
pnpm dlx shadcn@latest add sonner
```

**Step 2: Mount Toaster in root layout**

Modify `apps/dashboard/src/app/layout.tsx`. Inside `<ThemeProvider>`, after the closing `</div>` of the shell, add:
```tsx
<Toaster />
```

Import at top: `import { Toaster } from "@/components/ui/sonner";`

**Step 3: Add scratch trigger**

Append to scratch:
```tsx
<h2 className="text-2xl font-bold mt-8">Toast</h2>
<div className="flex gap-2">
  <Button onClick={() => toast.success("Proposal accepted")} variant="brain">Success</Button>
  <Button onClick={() => toast.error("Couldn't reach Higgsfield")} variant="destructive">Error</Button>
  <Button onClick={() => toast.info("Agent drafted 3 variants")} variant="outline">Info</Button>
</div>
```

Add `"use client";` at the top of `scratch/page.tsx`, and import `import { toast } from "sonner";`.

**Step 4: Verify**

Click each. Expected: toast slides in bottom-right, auto-dismisses ~4s, screen-reader announces.

**Step 5: Commit**

```bash
git add apps/dashboard/src/components/ui/sonner.tsx apps/dashboard/src/app/layout.tsx apps/dashboard/src/app/_scratch/page.tsx
git commit -m "Phase G.10: add Toast (Sonner) primitive"
```

---

### Task 11: Command palette (Cmd+K)

**Files:**
- Created by shadcn: `src/components/ui/command.tsx`
- Create: `apps/dashboard/src/components/command-palette.tsx`
- Modify: `apps/dashboard/src/app/layout.tsx`

**Step 1: Install command + cmdk**

```bash
cd apps/dashboard
pnpm dlx shadcn@latest add command
```

**Step 2: Build the global palette**

Create `apps/dashboard/src/components/command-palette.tsx`:
```tsx
"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";

const ROUTES = [
  { label: "Dashboard", href: "/dashboard", group: "Navigate" },
  { label: "Queue", href: "/queue", group: "Navigate" },
  { label: "Memory", href: "/memory", group: "Navigate" },
  { label: "Marketing Studio", href: "/studio/marketing", group: "Navigate" },
  { label: "Team", href: "/team", group: "Navigate" },
  { label: "Settings", href: "/settings", group: "Navigate" },
  { label: "Marketplace", href: "/marketplace", group: "Navigate" },
];

export function CommandPalette() {
  const [open, setOpen] = React.useState(false);
  const router = useRouter();

  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Search or jump to..." />
      <CommandList>
        <CommandEmpty>No results.</CommandEmpty>
        <CommandGroup heading="Navigate">
          {ROUTES.map((r) => (
            <CommandItem
              key={r.href}
              onSelect={() => {
                router.push(r.href);
                setOpen(false);
              }}
            >
              {r.label}
              <CommandShortcut>→</CommandShortcut>
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
```

**Step 3: Mount in root layout**

Add `<CommandPalette />` inside `<ThemeProvider>`, alongside `<Toaster />`.

Import: `import { CommandPalette } from "@/components/command-palette";`

**Step 4: Verify**

```bash
pnpm --filter @bbc/dashboard dev
```

From any page, press ⌘K (or Ctrl+K). Expected: palette opens, type to filter, Enter navigates, ESC dismisses.

**Step 5: Commit**

```bash
git add apps/dashboard/src/components/ui/command.tsx apps/dashboard/src/components/command-palette.tsx apps/dashboard/src/app/layout.tsx
git commit -m "Phase G.11: add Cmd+K command palette with route nav"
```

---

## Group 4 — Legal pages + cookie banner

### Task 12: Terms of Service page

**Files:**
- Create: `apps/dashboard/src/app/terms/page.tsx`

**Step 1: Create**

Create `apps/dashboard/src/app/terms/page.tsx`:
```tsx
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service — BBC",
};

export default function TermsPage() {
  return (
    <article className="prose prose-neutral dark:prose-invert mx-auto max-w-3xl py-12">
      <h1>Terms of Service</h1>
      <p className="text-sm text-muted-foreground">Last updated: 2026-05-10</p>

      <p>By using BBC (Big Brain Company), you agree to these terms. If you don't agree, don't use the service.</p>

      <h2>1. Your account</h2>
      <p>You are responsible for your account credentials and any activity under your account. Notify us immediately if you suspect unauthorized access.</p>

      <h2>2. Your content and data</h2>
      <p>You own your tenant's content — decisions, voice rules, vendor records, glossary terms, audit logs. We do not train models on your content. You can export or delete your tenant data at any time from Settings.</p>

      <h2>3. AI agent outputs</h2>
      <p>BBC's agents produce drafts you approve through the queue. You are responsible for content you publish or share, including drafts you accept from agents. We don't guarantee agent outputs are accurate, lawful, or fit for any specific purpose.</p>

      <h2>4. Acceptable use</h2>
      <p>Don't use BBC to violate laws, infringe rights, harm others, or run abusive AI workloads. We may suspend accounts that violate this section.</p>

      <h2>5. Subscriptions and credits</h2>
      <p>Paid plans renew automatically until canceled. Credits reset monthly and don't roll over. Refunds for unused credits are not offered except where required by law.</p>

      <h2>6. Third-party tools</h2>
      <p>BBC integrates with third-party providers (e.g., LLM, image generation, automation). You may use BBC's account (charged as credits) or bring your own keys. We are not responsible for third-party outages, pricing changes, or data practices.</p>

      <h2>7. Termination</h2>
      <p>Either party may terminate at any time. After termination, we retain your tenant data for 30 days before permanent deletion.</p>

      <h2>8. Liability</h2>
      <p>BBC is provided "as is" without warranties. Our liability is capped at fees paid in the prior 12 months.</p>

      <h2>9. Changes</h2>
      <p>We may update these terms. Material changes will be notified by email at least 30 days in advance.</p>

      <h2>10. Contact</h2>
      <p>Questions: <a href="mailto:hello@bbc.tools">hello@bbc.tools</a></p>
    </article>
  );
}
```

**Step 2: Verify**

```bash
pnpm --filter @bbc/dashboard dev
```

Visit `/terms`. Expected: readable page, prose styling applies. Note: `prose` requires `@tailwindcss/typography` — install if missing in next task.

**Step 3: Install typography plugin if needed**

```bash
pnpm --filter @bbc/dashboard add -D @tailwindcss/typography
```

Add to globals.css (after `@import "tailwindcss";`):
```css
@plugin "@tailwindcss/typography";
```

Re-verify `/terms`.

**Step 4: Commit**

```bash
git add apps/dashboard/src/app/terms/page.tsx apps/dashboard/src/app/globals.css apps/dashboard/package.json pnpm-lock.yaml
git commit -m "Phase G.12: add /terms page + @tailwindcss/typography"
```

---

### Task 13: Privacy Policy page

**Files:**
- Create: `apps/dashboard/src/app/privacy/page.tsx`

**Step 1: Create**

Create `apps/dashboard/src/app/privacy/page.tsx`:
```tsx
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy — BBC",
};

export default function PrivacyPage() {
  return (
    <article className="prose prose-neutral dark:prose-invert mx-auto max-w-3xl py-12">
      <h1>Privacy Policy</h1>
      <p className="text-sm text-muted-foreground">Last updated: 2026-05-10</p>

      <h2>What we collect</h2>
      <ul>
        <li><strong>Account:</strong> email, name, company name, role.</li>
        <li><strong>Tenant content:</strong> memory items, queue proposals, audit logs, drafts — owned by you.</li>
        <li><strong>Usage:</strong> page views, feature interactions, agent run telemetry (via PostHog).</li>
        <li><strong>Errors:</strong> exception traces (via Sentry), anonymized where possible.</li>
        <li><strong>Cookies:</strong> session cookie (required for login). Optional analytics cookie if you accept the banner.</li>
      </ul>

      <h2>What we don't do</h2>
      <ul>
        <li>We <strong>do not</strong> train AI models on your tenant content.</li>
        <li>We <strong>do not</strong> sell your data.</li>
        <li>We <strong>do not</strong> share your tenant content with other tenants.</li>
      </ul>

      <h2>Third parties we use</h2>
      <ul>
        <li><strong>Supabase</strong> — auth + Postgres database + RLS isolation.</li>
        <li><strong>Anthropic / OpenAI</strong> — LLM inference for agent runs. Per their policies, content sent for inference is not used to train.</li>
        <li><strong>Resend</strong> — transactional email (invitations, digests).</li>
        <li><strong>Stripe</strong> — payment processing.</li>
        <li><strong>PostHog</strong> — product analytics (self-hosted EU instance).</li>
        <li><strong>Sentry</strong> — error monitoring.</li>
        <li><strong>Vercel</strong> — hosting.</li>
      </ul>
      <p>When you connect third-party tools (Higgsfield, n8n, etc.), data flows directly between BBC and those providers per their own policies.</p>

      <h2>Your rights</h2>
      <p>You can export, edit, or delete your tenant data at any time from Settings. EU/UK users have additional rights under GDPR — contact <a href="mailto:privacy@bbc.tools">privacy@bbc.tools</a>.</p>

      <h2>Data retention</h2>
      <p>Active tenant data: retained while your account is active. Deleted accounts: 30-day grace period, then permanent deletion. Audit logs follow your plan's retention (30 days / 1 year / forever).</p>

      <h2>Changes</h2>
      <p>Material changes notified by email at least 30 days in advance.</p>

      <h2>Contact</h2>
      <p>Privacy questions: <a href="mailto:privacy@bbc.tools">privacy@bbc.tools</a></p>
    </article>
  );
}
```

**Step 2: Verify**

Visit `/privacy`. Expected: readable, well-styled.

**Step 3: Commit**

```bash
git add apps/dashboard/src/app/privacy/page.tsx
git commit -m "Phase G.13: add /privacy page"
```

---

### Task 14: Cookie banner

**Files:**
- Create: `apps/dashboard/src/components/cookie-banner.tsx`
- Modify: `apps/dashboard/src/app/layout.tsx`

**Step 1: Create banner**

Create `apps/dashboard/src/components/cookie-banner.tsx`:
```tsx
"use client";

import * as React from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

const STORAGE_KEY = "bbc-cookie-consent";

export function CookieBanner() {
  const [visible, setVisible] = React.useState(false);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) setVisible(true);
  }, []);

  const decide = (value: "accept" | "reject") => {
    localStorage.setItem(STORAGE_KEY, value);
    window.dispatchEvent(new CustomEvent("bbc-cookie-consent", { detail: value }));
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-label="Cookie preferences"
      className="fixed inset-x-4 bottom-4 z-50 mx-auto max-w-2xl rounded-lg border border-border bg-card p-4 shadow-lg"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-foreground">
          We use a session cookie to keep you signed in and an optional analytics cookie to improve BBC.{" "}
          <Link href="/privacy" className="underline">Privacy policy</Link>.
        </p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => decide("reject")}>Reject</Button>
          <Button variant="brain" size="sm" onClick={() => decide("accept")}>Accept</Button>
        </div>
      </div>
    </div>
  );
}

export function useCookieConsent() {
  const [consent, setConsent] = React.useState<"accept" | "reject" | null>(null);
  React.useEffect(() => {
    if (typeof window === "undefined") return;
    setConsent(localStorage.getItem(STORAGE_KEY) as "accept" | "reject" | null);
    const handler = (e: Event) => setConsent((e as CustomEvent).detail);
    window.addEventListener("bbc-cookie-consent", handler);
    return () => window.removeEventListener("bbc-cookie-consent", handler);
  }, []);
  return consent;
}
```

**Step 2: Mount in root layout**

Add `<CookieBanner />` inside `<ThemeProvider>` (alongside other globals).

Import: `import { CookieBanner } from "@/components/cookie-banner";`

**Step 3: Verify**

```bash
pnpm --filter @bbc/dashboard dev
```

In a new incognito window, visit `/`. Expected: banner appears bottom. Click Accept — banner dismisses, `localStorage.getItem("bbc-cookie-consent") === "accept"`. Refresh — banner does not reappear.

Clear localStorage, click Reject — same flow, value is "reject".

**Step 4: Commit**

```bash
git add apps/dashboard/src/components/cookie-banner.tsx apps/dashboard/src/app/layout.tsx
git commit -m "Phase G.14: add cookie banner with accept/reject persistence"
```

---

## Group 5 — Observability

### Task 15: Install + wire Sentry

**Files:**
- Modify: `apps/dashboard/package.json`
- Create: `apps/dashboard/sentry.client.config.ts`
- Create: `apps/dashboard/sentry.server.config.ts`
- Create: `apps/dashboard/sentry.edge.config.ts`
- Modify: `apps/dashboard/next.config.ts`
- Modify: `apps/dashboard/.env.example`

**Step 1: Install**

```bash
pnpm --filter @bbc/dashboard add @sentry/nextjs
```

**Step 2: Create client config**

Create `apps/dashboard/sentry.client.config.ts`:
```ts
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: process.env.NODE_ENV === "production",
  tracesSampleRate: 0.1,
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 1.0,
  integrations: [Sentry.replayIntegration({ maskAllText: true, blockAllMedia: true })],
});
```

**Step 3: Create server config**

Create `apps/dashboard/sentry.server.config.ts`:
```ts
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: process.env.NODE_ENV === "production",
  tracesSampleRate: 0.1,
});
```

**Step 4: Create edge config**

Create `apps/dashboard/sentry.edge.config.ts`:
```ts
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: process.env.NODE_ENV === "production",
  tracesSampleRate: 0.1,
});
```

**Step 5: Wrap next config**

Modify `apps/dashboard/next.config.ts`:
```ts
import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  // existing config preserved
};

export default withSentryConfig(nextConfig, {
  silent: true,
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  hideSourceMaps: true,
  disableLogger: true,
});
```

(Preserve any existing `nextConfig` keys; only add the wrapping.)

**Step 6: Add to .env.example**

Append to `apps/dashboard/.env.example`:
```
# Sentry — leave blank in dev; populate in production
NEXT_PUBLIC_SENTRY_DSN=
SENTRY_ORG=
SENTRY_PROJECT=
SENTRY_AUTH_TOKEN=
```

**Step 7: Smoke test**

```bash
pnpm --filter @bbc/dashboard build
```

Expected: build completes without errors. Sentry init runs but is disabled in dev (no DSN).

**Step 8: Commit**

```bash
git add apps/dashboard/package.json apps/dashboard/sentry.*.config.ts apps/dashboard/next.config.ts apps/dashboard/.env.example pnpm-lock.yaml
git commit -m "Phase G.15: install + wire Sentry (production-only, disabled in dev)"
```

---

### Task 16: Install + wire PostHog

**Files:**
- Modify: `apps/dashboard/package.json`
- Create: `apps/dashboard/src/components/posthog-provider.tsx`
- Create: `apps/dashboard/src/lib/posthog.ts` (server-side helper)
- Modify: `apps/dashboard/src/app/layout.tsx`
- Modify: `apps/dashboard/.env.example`

**Step 1: Install**

```bash
pnpm --filter @bbc/dashboard add posthog-js posthog-node
```

**Step 2: Client provider with consent gate**

Create `apps/dashboard/src/components/posthog-provider.tsx`:
```tsx
"use client";

import * as React from "react";
import posthog from "posthog-js";
import { PostHogProvider as PHProvider } from "posthog-js/react";
import { useCookieConsent } from "@/components/cookie-banner";

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  const consent = useCookieConsent();
  const [initialized, setInitialized] = React.useState(false);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    if (consent !== "accept") return;
    if (initialized) return;

    const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
    const host = process.env.NEXT_PUBLIC_POSTHOG_HOST;
    if (!key || !host) return;

    posthog.init(key, {
      api_host: host,
      capture_pageview: "history_change",
      autocapture: false,
      disable_session_recording: false,
      person_profiles: "identified_only",
    });
    setInitialized(true);
  }, [consent, initialized]);

  if (!initialized) return <>{children}</>;
  return <PHProvider client={posthog}>{children}</PHProvider>;
}
```

**Step 3: Server helper**

Create `apps/dashboard/src/lib/posthog.ts`:
```ts
import { PostHog } from "posthog-node";

let client: PostHog | null = null;

export function getPostHogServer() {
  if (typeof window !== "undefined") {
    throw new Error("getPostHogServer must only be called from the server");
  }
  if (!client) {
    const key = process.env.POSTHOG_API_KEY;
    const host = process.env.NEXT_PUBLIC_POSTHOG_HOST;
    if (!key || !host) return null;
    client = new PostHog(key, { host, flushAt: 1, flushInterval: 0 });
  }
  return client;
}
```

**Step 4: Mount provider in layout**

Modify `apps/dashboard/src/app/layout.tsx` — wrap children inside `<ThemeProvider>` with `<PostHogProvider>`:
```tsx
<ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
  <PostHogProvider>
    <div className="mx-auto max-w-7xl p-6">
      <Nav />
      <main>{children}</main>
    </div>
    <Toaster />
    <CommandPalette />
    <CookieBanner />
  </PostHogProvider>
</ThemeProvider>
```

Import: `import { PostHogProvider } from "@/components/posthog-provider";`

**Step 5: Add env vars**

Append to `apps/dashboard/.env.example`:
```
# PostHog — leave blank in dev
NEXT_PUBLIC_POSTHOG_KEY=
NEXT_PUBLIC_POSTHOG_HOST=https://eu.i.posthog.com
POSTHOG_API_KEY=
```

**Step 6: Verify**

```bash
pnpm --filter @bbc/dashboard build
```

Expected: build succeeds. In dev without env vars, PostHog does not initialize. With consent flow: accepting the cookie banner triggers PostHog init only if env vars are set.

**Step 7: Commit**

```bash
git add apps/dashboard/package.json apps/dashboard/src/components/posthog-provider.tsx apps/dashboard/src/lib/posthog.ts apps/dashboard/src/app/layout.tsx apps/dashboard/.env.example pnpm-lock.yaml
git commit -m "Phase G.16: install + wire PostHog (consent-gated, EU instance)"
```

---

## Group 6 — Transactional email

Resend is already installed. We need React Email for templates + four launch templates + a send helper.

### Task 17: Install React Email + templates dir

**Files:**
- Modify: `apps/dashboard/package.json`
- Create: `apps/dashboard/src/emails/_components.tsx` (shared header/footer)

**Step 1: Install**

```bash
pnpm --filter @bbc/dashboard add @react-email/components @react-email/render
pnpm --filter @bbc/dashboard add -D react-email
```

**Step 2: Create shared components**

Create `apps/dashboard/src/emails/_components.tsx`:
```tsx
import { Body, Container, Head, Hr, Html, Img, Link, Preview, Section, Text } from "@react-email/components";
import * as React from "react";

const styles = {
  body: { backgroundColor: "#f6f6f7", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" },
  container: { backgroundColor: "#ffffff", margin: "40px auto", padding: "32px", maxWidth: "560px", borderRadius: "12px", border: "1px solid #e7e7e9" },
  brand: { fontSize: "14px", fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase" as const, color: "#444", marginBottom: "16px" },
  h1: { fontSize: "22px", fontWeight: 600, margin: "0 0 8px", color: "#0a0a0b" },
  text: { fontSize: "14px", lineHeight: 1.6, color: "#0a0a0b" },
  cta: { backgroundColor: "#0a0a0b", color: "#ffffff", padding: "10px 18px", borderRadius: "8px", fontSize: "14px", fontWeight: 500, textDecoration: "none", display: "inline-block" },
  footer: { fontSize: "12px", color: "#6b6b6f", marginTop: "32px" },
};

export function EmailShell({ preview, children }: { preview: string; children: React.ReactNode }) {
  return (
    <Html>
      <Head />
      <Preview>{preview}</Preview>
      <Body style={styles.body}>
        <Container style={styles.container}>
          <Text style={styles.brand}>BBC · Big Brain Company</Text>
          {children}
          <Hr style={{ borderColor: "#e7e7e9", margin: "24px 0" }} />
          <Text style={styles.footer}>
            BBC, bbc.tools · <Link href="https://bbc.tools/privacy" style={{ color: "#6b6b6f" }}>Privacy</Link> · <Link href="https://bbc.tools/terms" style={{ color: "#6b6b6f" }}>Terms</Link>
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

export { styles };
```

**Step 3: Verify**

```bash
pnpm --filter @bbc/dashboard type-check
```

Expected: PASS.

**Step 4: Commit**

```bash
git add apps/dashboard/package.json apps/dashboard/src/emails/_components.tsx pnpm-lock.yaml
git commit -m "Phase G.17: install React Email + shared email shell"
```

---

### Task 18: Signup welcome email template

**Files:**
- Create: `apps/dashboard/src/emails/welcome.tsx`

**Step 1: Create**

Create `apps/dashboard/src/emails/welcome.tsx`:
```tsx
import { Link, Text } from "@react-email/components";
import { EmailShell, styles } from "./_components";

interface WelcomeEmailProps {
  founderName?: string;
  dashboardUrl: string;
}

export function WelcomeEmail({ founderName, dashboardUrl }: WelcomeEmailProps) {
  return (
    <EmailShell preview="Welcome to BBC — let's build your brain">
      <Text style={styles.h1}>Welcome to BBC{founderName ? `, ${founderName}` : ""}.</Text>
      <Text style={styles.text}>
        You just signed up for BBC — the shared brain for your team and your AI agents.
      </Text>
      <Text style={styles.text}>
        Your next step is the brain dump. Tell BBC about your company in 5 minutes, and it'll structure
        your voice, decisions, vendors, and glossary into a queryable knowledge layer your AI agents can read from.
      </Text>
      <Link href={dashboardUrl} style={styles.cta}>Start the brain dump →</Link>
      <Text style={{ ...styles.text, marginTop: 24 }}>
        Questions? Just reply to this email.
      </Text>
    </EmailShell>
  );
}

export default WelcomeEmail;
```

**Step 2: Render-test**

Create a quick render check. Append to a test file or run inline:
```bash
cd apps/dashboard
pnpm dlx react-email dev --dir src/emails --port 3001
```

Visit `http://localhost:3001`. Expected: WelcomeEmail renders in a browser preview. Kill server.

**Step 3: Commit**

```bash
git add apps/dashboard/src/emails/welcome.tsx
git commit -m "Phase G.18: add welcome email template"
```

---

### Task 19: Invite email template

**Files:**
- Create: `apps/dashboard/src/emails/invite.tsx`

**Step 1: Create**

Create `apps/dashboard/src/emails/invite.tsx`:
```tsx
import { Link, Text } from "@react-email/components";
import { EmailShell, styles } from "./_components";

interface InviteEmailProps {
  inviterName: string;
  tenantName: string;
  role: string;
  acceptUrl: string;
}

export function InviteEmail({ inviterName, tenantName, role, acceptUrl }: InviteEmailProps) {
  return (
    <EmailShell preview={`${inviterName} invited you to ${tenantName} on BBC`}>
      <Text style={styles.h1}>You're invited.</Text>
      <Text style={styles.text}>
        <strong>{inviterName}</strong> invited you to <strong>{tenantName}</strong> on BBC as <strong>{role}</strong>.
      </Text>
      <Text style={styles.text}>
        BBC is the shared brain your team and AI agents read from. Click below to accept and sign in.
      </Text>
      <Link href={acceptUrl} style={styles.cta}>Accept invite →</Link>
      <Text style={{ ...styles.text, marginTop: 24, fontSize: 12, color: "#6b6b6f" }}>
        This invite expires in 7 days. If you weren't expecting this, you can ignore the email.
      </Text>
    </EmailShell>
  );
}

export default InviteEmail;
```

**Step 2: Commit**

```bash
git add apps/dashboard/src/emails/invite.tsx
git commit -m "Phase G.19: add invite email template"
```

---

### Task 20: Queue digest email template

**Files:**
- Create: `apps/dashboard/src/emails/queue-digest.tsx`

**Step 1: Create**

Create `apps/dashboard/src/emails/queue-digest.tsx`:
```tsx
import { Link, Text } from "@react-email/components";
import { EmailShell, styles } from "./_components";

interface QueueDigestEmailProps {
  founderName?: string;
  pendingCount: number;
  topItems: Array<{ title: string; type: string }>;
  dashboardUrl: string;
}

export function QueueDigestEmail({ founderName, pendingCount, topItems, dashboardUrl }: QueueDigestEmailProps) {
  return (
    <EmailShell preview={`${pendingCount} proposals waiting for your review`}>
      <Text style={styles.h1}>
        {pendingCount} {pendingCount === 1 ? "proposal" : "proposals"} waiting{founderName ? `, ${founderName}` : ""}.
      </Text>
      <Text style={styles.text}>
        Your AI agents drafted these for you. Open BBC to review and approve.
      </Text>
      <ul style={{ paddingLeft: 16, margin: "16px 0" }}>
        {topItems.slice(0, 5).map((item, i) => (
          <li key={i} style={{ ...styles.text, marginBottom: 4 }}>
            <strong>{item.type}:</strong> {item.title}
          </li>
        ))}
      </ul>
      <Link href={dashboardUrl} style={styles.cta}>Open queue →</Link>
    </EmailShell>
  );
}

export default QueueDigestEmail;
```

**Step 2: Commit**

```bash
git add apps/dashboard/src/emails/queue-digest.tsx
git commit -m "Phase G.20: add queue digest email template"
```

---

### Task 21: Paywall email template

**Files:**
- Create: `apps/dashboard/src/emails/paywall.tsx`

**Step 1: Create**

Create `apps/dashboard/src/emails/paywall.tsx`:
```tsx
import { Link, Text } from "@react-email/components";
import { EmailShell, styles } from "./_components";

interface PaywallEmailProps {
  founderName?: string;
  reason: "credits_exhausted" | "brain_items_limit" | "mcp_write_needed" | "invite_needed";
  upgradeUrl: string;
}

const REASON_COPY: Record<PaywallEmailProps["reason"], { h1: string; body: string; cta: string }> = {
  credits_exhausted: {
    h1: "You're out of credits this month.",
    body: "Your AI agents ran out of credits. Upgrade to Solo Founder ($29/mo) for 3,500 credits, or wait until your free tier resets.",
    cta: "Upgrade to Solo Founder",
  },
  brain_items_limit: {
    h1: "Your brain is filling up.",
    body: "You've reached the 500-item limit on the Free plan. Upgrade to Solo Founder to capture decisions, vendors, and voice rules without a cap.",
    cta: "Upgrade for unlimited brain",
  },
  mcp_write_needed: {
    h1: "MCP write is on Solo Founder.",
    body: "You're trying to wire your AI agents to write back to BBC through MCP. That's on Solo Founder ($29/mo) and above.",
    cta: "Upgrade for MCP write",
  },
  invite_needed: {
    h1: "Inviting teammates needs Startup.",
    body: "Bring teammates into your tenant on the Startup plan ($129/mo) — up to 10 seats, full role-based permissions.",
    cta: "See Startup features",
  },
};

export function PaywallEmail({ founderName, reason, upgradeUrl }: PaywallEmailProps) {
  const copy = REASON_COPY[reason];
  return (
    <EmailShell preview={copy.h1}>
      <Text style={styles.h1}>{copy.h1}</Text>
      {founderName && <Text style={styles.text}>Hey {founderName},</Text>}
      <Text style={styles.text}>{copy.body}</Text>
      <Link href={upgradeUrl} style={styles.cta}>{copy.cta} →</Link>
      <Text style={{ ...styles.text, marginTop: 24, fontSize: 12, color: "#6b6b6f" }}>
        Compare all plans at <Link href="https://bbc.tools/pricing" style={{ color: "#6b6b6f" }}>bbc.tools/pricing</Link>.
      </Text>
    </EmailShell>
  );
}

export default PaywallEmail;
```

**Step 2: Commit**

```bash
git add apps/dashboard/src/emails/paywall.tsx
git commit -m "Phase G.21: add paywall email template (4 reasons)"
```

---

### Task 22: Email send helper using templates

**Files:**
- Modify: `apps/dashboard/src/lib/email.ts`

The existing `email.ts` is a basic Resend wrapper. Extend it to render React Email templates.

**Step 1: Read existing email.ts**

Inspect current content to preserve existing exports:
```bash
cat apps/dashboard/src/lib/email.ts
```

**Step 2: Add template senders**

Append to `apps/dashboard/src/lib/email.ts`:
```ts
import { render } from "@react-email/render";
import { WelcomeEmail } from "@/emails/welcome";
import { InviteEmail } from "@/emails/invite";
import { QueueDigestEmail } from "@/emails/queue-digest";
import { PaywallEmail } from "@/emails/paywall";
import { Resend } from "resend";

const FROM = process.env.RESEND_FROM_EMAIL || "BBC <hello@bbc.tools>";

function getResend() {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  return new Resend(key);
}

export async function sendWelcome(to: string, founderName: string | undefined, dashboardUrl: string) {
  const resend = getResend();
  if (!resend) {
    console.warn("[email] RESEND_API_KEY missing — skipping welcome to", to);
    return { skipped: true };
  }
  const html = await render(WelcomeEmail({ founderName, dashboardUrl }));
  return resend.emails.send({ from: FROM, to, subject: "Welcome to BBC", html });
}

export async function sendInvite(to: string, inviterName: string, tenantName: string, role: string, acceptUrl: string) {
  const resend = getResend();
  if (!resend) {
    console.warn("[email] RESEND_API_KEY missing — skipping invite to", to);
    return { skipped: true };
  }
  const html = await render(InviteEmail({ inviterName, tenantName, role, acceptUrl }));
  return resend.emails.send({ from: FROM, to, subject: `${inviterName} invited you to ${tenantName}`, html });
}

export async function sendQueueDigest(
  to: string,
  founderName: string | undefined,
  pendingCount: number,
  topItems: Array<{ title: string; type: string }>,
  dashboardUrl: string,
) {
  const resend = getResend();
  if (!resend) {
    console.warn("[email] RESEND_API_KEY missing — skipping digest to", to);
    return { skipped: true };
  }
  const html = await render(QueueDigestEmail({ founderName, pendingCount, topItems, dashboardUrl }));
  const subject = `${pendingCount} ${pendingCount === 1 ? "proposal" : "proposals"} waiting in BBC`;
  return resend.emails.send({ from: FROM, to, subject, html });
}

export async function sendPaywall(
  to: string,
  founderName: string | undefined,
  reason: "credits_exhausted" | "brain_items_limit" | "mcp_write_needed" | "invite_needed",
  upgradeUrl: string,
) {
  const resend = getResend();
  if (!resend) {
    console.warn("[email] RESEND_API_KEY missing — skipping paywall to", to);
    return { skipped: true };
  }
  const html = await render(PaywallEmail({ founderName, reason, upgradeUrl }));
  const SUBJECTS = {
    credits_exhausted: "You're out of credits this month",
    brain_items_limit: "Your brain is filling up",
    mcp_write_needed: "MCP write is on Solo Founder",
    invite_needed: "Inviting teammates needs Startup",
  };
  return resend.emails.send({ from: FROM, to, subject: SUBJECTS[reason], html });
}
```

**Step 3: Add env var docs**

Append to `apps/dashboard/.env.example`:
```
# Resend transactional email
RESEND_API_KEY=
RESEND_FROM_EMAIL=BBC <hello@bbc.tools>
```

**Step 4: Verify**

```bash
pnpm --filter @bbc/dashboard type-check
pnpm --filter @bbc/dashboard build
```

Expected: PASS. Helpers exist; without API key in env they no-op with a warning.

**Step 5: Commit**

```bash
git add apps/dashboard/src/lib/email.ts apps/dashboard/.env.example
git commit -m "Phase G.22: wire 4 transactional email helpers via React Email + Resend"
```

---

## Group 7 — Phase G validation

### Task 23: End-to-end Phase G validation

**Step 1: Clean install + full build**

```bash
pnpm install
pnpm --filter @bbc/dashboard type-check
pnpm --filter @bbc/dashboard build
```

Expected: all pass.

**Step 2: Manual smoke test**

```bash
pnpm --filter @bbc/dashboard dev
```

Run through this checklist in the browser:

- [ ] `/` loads, theme defaults to system, Nav shows theme toggle
- [ ] Theme toggle: click Light → light mode persists. Click Dark → dark mode persists. Click System → tracks OS.
- [ ] `/_scratch` shows all primitives (Button, Input, Card, Dialog, Toast, Cmd+K) in both themes
- [ ] Brain variant button is lime; Studio variant button is coral; readable in both modes
- [ ] Cmd+K opens command palette; type "memory" filters; Enter navigates; ESC dismisses
- [ ] Toast notifications work — success / error / info
- [ ] Dialog opens, focus-traps, ESC dismisses
- [ ] `/terms` and `/privacy` render with prose styling
- [ ] Cookie banner appears in incognito, dismisses on Accept/Reject, persists in localStorage

Kill dev server.

**Step 3: Email preview**

```bash
cd apps/dashboard
pnpm dlx react-email dev --dir src/emails --port 3001
```

Visit `http://localhost:3001`. Expected: 4 templates listed (welcome, invite, queue-digest, paywall). Each renders cleanly. Kill the preview server.

**Step 4: Build for production**

```bash
pnpm --filter @bbc/dashboard build
```

Expected: build completes. Note any warnings about Sentry / PostHog being disabled (expected since no DSN/API keys in dev).

**Step 5: Remove scratch page**

Delete `apps/dashboard/src/app/_scratch/page.tsx` — it was for demo only and shouldn't ship.

```bash
rm apps/dashboard/src/app/_scratch/page.tsx
rmdir apps/dashboard/src/app/_scratch
```

**Step 6: Final commit**

```bash
git add apps/dashboard/src/app
git commit -m "Phase G.23: remove scratch demo page + complete Phase G"
```

---

## Phase G ship checklist

Before marking Phase G complete, verify:

- [ ] All 23 tasks committed
- [ ] `pnpm --filter @bbc/dashboard type-check` passes
- [ ] `pnpm --filter @bbc/dashboard build` passes
- [ ] Light and dark mode both work for every existing dashboard route
- [ ] Theme toggle persists across refresh
- [ ] Cmd+K palette works from every route
- [ ] `/terms`, `/privacy` reachable + readable
- [ ] Cookie banner shows for new visitors, dismisses on click, persists
- [ ] React Email preview shows all 4 templates rendering correctly
- [ ] `.env.example` documents all new env vars (Sentry, PostHog, Resend)
- [ ] No `_scratch/` page in production build
- [ ] Existing dashboard pages still functional (visit `/queue`, `/log`, `/bindings`, `/team` — they should look broken/half-styled since they reference old globals.css patterns; that's expected, those pages will be redesigned in subsequent phases against the new tokens)

After this passes, Phase G is shipped. Phases H (Brain editor) and I (Onboarding) are now unblocked and can start in parallel by different developers if available.

---

## Notes for the executor

1. **Existing dashboard pages will visually break temporarily.** The old `globals.css` had `.card`, `.btn`, `.pill` global classes. Removing them in Task 3 strands the old `/queue`, `/log`, `/bindings`, `/team` pages until they're rewritten in later phases. This is intentional — phases H–L will redesign them against the new shadcn primitives. Don't try to keep the old styles alive; the migration is meant to be clean.

2. **Sentry + PostHog stay quiet in dev.** Both are gated on env vars; without keys they no-op. Don't add real keys to `.env.local` until staging deploy.

3. **Cookie consent gates PostHog only.** Sentry runs unconditionally in production (it's error tracking, not analytics). Document this in `/privacy` if a regulator asks — already covered in Task 13.

4. **Resend "from" address must be verified.** Set up `bbc.tools` DNS records (SPF, DKIM) in Resend dashboard before sending real emails. Document this in the runbook (Phase L will surface a deployment checklist).

5. **Token values use `oklch`.** This is intentional — better perceptual uniformity than HSL, supported by all modern browsers (caniuse: 95%+ as of 2026-05). If you need fallback support, add HSL companions, but it's not required for v1.

6. **Reference the design doc.** When in doubt, defer to `docs/plans/2026-05-10-bbc-user-facing-product-design.md` §4 (theme model) and §10 (pricing tiers used in paywall email copy).
