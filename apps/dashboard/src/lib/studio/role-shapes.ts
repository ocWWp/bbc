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

// Finance's "+new" section (UI-SPEC §2/§3). Reads BrainSummary.metrics, which
// no memory type populates yet — so this section stays hidden (BrainSidebar
// drops empty sections) until the `metric` memory type lands. Forward-wired.
const metricsSection = (max = 6): SidebarSection => ({
  heading: "Metrics & actuals",
  itemsFromBrain: (b) =>
    (b.metrics ?? []).slice(0, max).map((m) => ({
      id: m.id,
      label: `${m.label}: ${m.value}`,
      href: `/brain/${m.id}`,
    })),
});

// People/HR's "+new" section (UI-SPEC §2/§3). Same forward-wired pattern as
// metricsSection — reads BrainSummary.comp_bands, hidden until that memory
// type exists.
const compBandsSection = (max = 6): SidebarSection => ({
  heading: "Comp bands",
  itemsFromBrain: (b) =>
    (b.comp_bands ?? []).slice(0, max).map((c) => ({
      id: c.id,
      label: `${c.label}: ${c.range}`,
      href: `/brain/${c.id}`,
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

  finance: {
    role: "finance",
    label: "Finance Studio",
    accentColor: "#14b8a6", // teal — distinct from Engineering's emerald
    blurb: "Board financials, budget memos, runway analysis — the narrative around the numbers, with its work shown.",
    defaultChips: [
      { id: "board-financials", label: "Board financials", templateSlug: `${ROLE_PREFIXES.finance}board-financials` },
      { id: "budget-memo", label: "Budget memo", templateSlug: `${ROLE_PREFIXES.finance}budget-memo` },
      { id: "investor-numbers", label: "Investor numbers", templateSlug: `${ROLE_PREFIXES.finance}investor-numbers` },
      { id: "expense-policy", label: "Expense policy", templateSlug: `${ROLE_PREFIXES.finance}expense-policy` },
      { id: "runway-analysis", label: "Runway analysis", templateSlug: `${ROLE_PREFIXES.finance}runway-analysis` },
    ],
    sidebarSections: [recentDecisionsSection(), vendorsSection(), metricsSection()],
  },

  legal: {
    role: "legal",
    label: "Legal Studio",
    accentColor: "#64748b", // slate — a serious neutral; never alarming
    blurb: "NDAs, contractor agreements, IP assignments, policies — a drafting assistant, never a legal advisor. Every output is a draft for attorney review.",
    defaultChips: [
      { id: "nda", label: "NDA", templateSlug: `${ROLE_PREFIXES.legal}nda` },
      { id: "contractor-agreement", label: "Contractor agreement", templateSlug: `${ROLE_PREFIXES.legal}contractor-agreement` },
      { id: "ip-assignment", label: "IP assignment", templateSlug: `${ROLE_PREFIXES.legal}ip-assignment` },
      { id: "tos-privacy", label: "ToS & privacy", templateSlug: `${ROLE_PREFIXES.legal}tos-privacy` },
      { id: "employment-terms", label: "Employment terms", templateSlug: `${ROLE_PREFIXES.legal}employment-terms` },
    ],
    sidebarSections: [recentDecisionsSection(), teamSection(), glossarySection()],
  },

  hr: {
    role: "hr",
    label: "People Studio",
    accentColor: "#f43f5e", // rose — a warm tone, distinct from Support's red
    blurb: "Job descriptions, offer letters, onboarding plans, reviews, comp rationale — behavior-anchored, bias-flagged, always a draft you personalize.",
    defaultChips: [
      { id: "job-description", label: "Job description", templateSlug: `${ROLE_PREFIXES.hr}job-description` },
      { id: "offer-letter", label: "Offer letter", templateSlug: `${ROLE_PREFIXES.hr}offer-letter` },
      { id: "onboarding-plan", label: "Onboarding plan", templateSlug: `${ROLE_PREFIXES.hr}onboarding-plan` },
      { id: "review-template", label: "Review template", templateSlug: `${ROLE_PREFIXES.hr}review-template` },
      { id: "comp-band-rationale", label: "Comp band rationale", templateSlug: `${ROLE_PREFIXES.hr}comp-band-rationale` },
    ],
    sidebarSections: [teamSection(), recentDecisionsSection(), glossarySection(4), compBandsSection()],
  },
};
