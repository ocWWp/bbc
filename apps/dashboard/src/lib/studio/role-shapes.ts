// Task 18: per-role chrome contracts.
//
// ROLE_SHAPES drives the chrome around each Studio (header label, accent
// color, default prompt chips, sidebar sections). Behavior — the action
// flow, the state machine, the writeback path — stays where it lives in
// each role's existing client. This file is presentational data.
//
// Every chip's templateSlug MUST satisfy two invariants:
//   1. It starts with the role's prefix from ROLE_PREFIXES (template-id.ts).
//   2. The corresponding Template is registered in the role's registry
//      (apps/dashboard/src/lib/studio/<role>-templates/).
//
// The accompanying test asserts both invariants.

import type { BrainSummary } from "./templates/types";
import { ROLE_PREFIXES, type StudioRole } from "./template-id";

export type RoleChip = {
  id: string;
  label: string;
  templateSlug: string;
};

export type SidebarItem = {
  id: string;
  label: string;
  href: string;
};

export type SidebarSection = {
  heading: string;
  itemsFromBrain: (brain: BrainSummary) => SidebarItem[];
};

export type RoleShape = {
  role: StudioRole;
  label: string;
  /** CSS color or var(--…). Applied as --studio-accent on the shell root. */
  accentColor: string;
  /** Short blurb under the prompt; voice for each role's reason-to-be. */
  blurb: string;
  defaultChips: RoleChip[];
  sidebarSections: SidebarSection[];
};

// Common sidebar primitives — voice, recent decisions, glossary. Roles
// compose these into their own sidebarSections so the data shape stays
// consistent across roles.

const voiceSection = (slugSuffix = "") => ({
  heading: "Your voice",
  itemsFromBrain: (b: BrainSummary): SidebarItem[] =>
    b.voice
      ? [
          {
            id: "voice",
            label: `${b.voice.register}, ${b.voice.do_words.length} do-words${
              slugSuffix ? ` · ${slugSuffix}` : ""
            }`,
            href: "/brain?type=voice",
          },
        ]
      : [],
});

const recentDecisionsSection = (max = 5): SidebarSection => ({
  heading: "Recent decisions",
  itemsFromBrain: (b) =>
    b.recent_decisions.slice(0, max).map((d) => ({
      id: d.id,
      label: d.title,
      href: `/brain/${d.id}`,
    })),
});

const glossarySection = (max = 6): SidebarSection => ({
  heading: "Glossary",
  itemsFromBrain: (b) =>
    (b.glossary?.terms ?? []).slice(0, max).map((t) => ({
      id: t.id,
      label: t.term,
      href: `/brain/${t.id}`,
    })),
});

const vendorsSection = (max = 6): SidebarSection => ({
  heading: "Vendors",
  itemsFromBrain: (b) =>
    b.vendors.slice(0, max).map((v) => ({
      id: v.id,
      label: `${v.name} (${v.role})`,
      href: `/brain/${v.id}`,
    })),
});

const teamSection = (max = 6): SidebarSection => ({
  heading: "Team",
  itemsFromBrain: (b) =>
    b.team.slice(0, max).map((p) => ({
      id: p.id,
      label: `${p.name} — ${p.role}`,
      href: `/brain/${p.id}`,
    })),
});

export const ROLE_SHAPES: Record<StudioRole, RoleShape> = {
  marketing: {
    role: "marketing",
    label: "Marketing Studio",
    accentColor: "#f59e0b", // amber
    blurb: "Posts, threads, and blog drafts in your team's voice — every line cites a memory.",
    defaultChips: [
      { id: "tweet", label: "Tweet thread", templateSlug: `${ROLE_PREFIXES.marketing}tweet-thread` },
      { id: "linkedin", label: "LinkedIn post", templateSlug: `${ROLE_PREFIXES.marketing}linkedin-announcement` },
      { id: "blog", label: "Blog draft", templateSlug: `${ROLE_PREFIXES.marketing}blog-post-draft` },
      { id: "launch", label: "Launch announcement", templateSlug: `${ROLE_PREFIXES.marketing}single-x-post` },
      { id: "reel", label: "Reel script", templateSlug: `${ROLE_PREFIXES.marketing}reel-script` },
    ],
    sidebarSections: [voiceSection(), recentDecisionsSection(), glossarySection(4)],
  },

  engineering: {
    role: "engineering",
    label: "Engineering Studio",
    accentColor: "#10b981", // emerald
    blurb: "ADRs, tech-debt reviews, vendor swaps — drafted from your stack memories.",
    defaultChips: [
      { id: "adr", label: "ADR draft", templateSlug: `${ROLE_PREFIXES.engineering}adr-draft` },
      { id: "vendor-swap", label: "Vendor swap memo", templateSlug: `${ROLE_PREFIXES.engineering}vendor-swap` },
      { id: "tech-debt", label: "Tech-debt review", templateSlug: `${ROLE_PREFIXES.engineering}tech-debt-review` },
    ],
    sidebarSections: [recentDecisionsSection(), vendorsSection(), glossarySection(4)],
  },

  founder: {
    role: "founder",
    label: "Founder Studio",
    accentColor: "#3b82f6", // blue
    blurb: "Strategic memos, board updates, weekly recaps — grounded in what your team actually decided.",
    defaultChips: [
      { id: "memo", label: "Strategic memo", templateSlug: `${ROLE_PREFIXES.founder}strategic-memo` },
      { id: "board-update", label: "Board update", templateSlug: `${ROLE_PREFIXES.founder}board-update` },
      { id: "weekly-recap", label: "Weekly recap", templateSlug: `${ROLE_PREFIXES.founder}weekly-recap` },
    ],
    sidebarSections: [recentDecisionsSection(), teamSection(), vendorsSection(4)],
  },

  designer: {
    role: "designer",
    label: "Designer Studio",
    accentColor: "#a855f7", // purple
    blurb: "Visual specs, UI copy passes, brand-guideline entries — voice-aware and decision-cited.",
    defaultChips: [
      { id: "visual-spec", label: "Visual spec", templateSlug: `${ROLE_PREFIXES.designer}visual-spec` },
      { id: "ui-copy", label: "UI copy pass", templateSlug: `${ROLE_PREFIXES.designer}ui-copy-pass` },
      { id: "brand-entry", label: "Brand guideline", templateSlug: `${ROLE_PREFIXES.designer}brand-guideline-entry` },
    ],
    sidebarSections: [voiceSection(), recentDecisionsSection(4), glossarySection(4)],
  },

  support: {
    role: "support",
    label: "Support Studio",
    accentColor: "#ef4444", // red
    blurb: "Customer replies, churn-saves, bug acks — voice-grounded, decisions-aware, never auto-sent.",
    defaultChips: [
      { id: "reply", label: "Customer reply", templateSlug: `${ROLE_PREFIXES.support}customer-reply` },
      { id: "churn-save", label: "Churn save", templateSlug: `${ROLE_PREFIXES.support}churn-save` },
      { id: "bug-ack", label: "Bug ack", templateSlug: `${ROLE_PREFIXES.support}bug-ack` },
      { id: "incident", label: "Incident status", templateSlug: `${ROLE_PREFIXES.support}incident-status` },
      { id: "feature-req", label: "Feature triage", templateSlug: `${ROLE_PREFIXES.support}feature-request-triage` },
    ],
    sidebarSections: [voiceSection(), glossarySection(), recentDecisionsSection(4)],
  },
};
