import { z } from "zod";

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");

export const voiceFieldsSchema = z.object({
  register: z.enum(["formal", "neutral", "casual"]).default("neutral"),
  audience: z.string().max(200).optional(),
  do_words: z.array(z.string()).default([]),
  dont_words: z.array(z.string()).default([]),
  example_phrases: z.array(z.string()).default([]),
});

export const decisionFieldsSchema = z.object({
  number: z.number().int().positive().optional(),
  date: dateString.optional(),
  status: z.enum(["proposed", "accepted", "superseded"]).default("proposed"),
  context: z.string().max(2000).default(""),
  decision: z.string().max(2000).default(""),
  consequences: z.string().max(2000).default(""),
  superseded_by: z.string().uuid().optional(),
});

export const glossaryFieldsSchema = z.object({
  term: z.string().max(200).default(""),
  pronunciation: z.string().max(200).optional(),
  definition: z.string().max(2000).default(""),
  aliases: z.array(z.string()).default([]),
  domain: z.string().max(100).optional(),
});

export const vendorFieldsSchema = z.object({
  vendor_name: z.string().max(200).default(""),
  role: z.string().max(100).default(""),
  status: z.enum(["candidate", "active", "deprecated"]).default("candidate"),
  homepage: z.string().url().optional().or(z.literal("")),
  pricing_url: z.string().url().optional().or(z.literal("")),
  notes: z.string().max(2000).optional(),
});

export const productFieldsSchema = z.object({
  positioning: z.string().max(500).default(""),
  target_user: z.string().max(500).default(""),
  competitors: z.array(z.string()).default([]),
  differentiators: z.array(z.string()).default([]),
  launch_date: dateString.optional(),
});

export const teamFieldsSchema = z.object({
  name: z.string().max(200).default(""),
  role: z.string().max(200).default(""),
  email: z.string().email().optional().or(z.literal("")),
  slack: z.string().max(100).optional(),
  github: z.string().max(100).optional(),
  bio: z.string().max(2000).optional(),
});

export const skillFieldsSchema = z.object({
  invocation: z.string().max(200).default(""),
  extends: z.string().optional(),
  when_to_use: z.string().max(2000).default(""),
  inputs: z.string().max(2000).optional(),
  outputs: z.string().max(2000).optional(),
  status: z.enum(["draft", "active", "deprecated"]).default("draft"),
});

export type VoiceFields = z.infer<typeof voiceFieldsSchema>;
export type DecisionFields = z.infer<typeof decisionFieldsSchema>;
export type GlossaryFields = z.infer<typeof glossaryFieldsSchema>;
export type VendorFields = z.infer<typeof vendorFieldsSchema>;
export type ProductFields = z.infer<typeof productFieldsSchema>;
export type TeamFields = z.infer<typeof teamFieldsSchema>;
export type SkillFields = z.infer<typeof skillFieldsSchema>;

export const supertagSchemas = {
  voice: voiceFieldsSchema,
  decision: decisionFieldsSchema,
  glossary: glossaryFieldsSchema,
  vendor: vendorFieldsSchema,
  product: productFieldsSchema,
  team: teamFieldsSchema,
  skill: skillFieldsSchema,
} as const;

export type Supertag = keyof typeof supertagSchemas;

export const SUPERTAGS: readonly Supertag[] = [
  "voice",
  "decision",
  "glossary",
  "vendor",
  "product",
  "team",
  "skill",
] as const;

export const supertagMeta: Record<Supertag, { label: string; hint: string; accent: string }> = {
  voice:     { label: "Voice",     hint: "How your product sounds",       accent: "coral" },
  decision:  { label: "Decision",  hint: "A locked architectural choice", accent: "lime" },
  glossary:  { label: "Glossary",  hint: "A term + definition",           accent: "violet" },
  vendor:    { label: "Vendor",    hint: "A tool or service you use",     accent: "amber" },
  product:   { label: "Product",   hint: "Positioning + competitors",     accent: "sky" },
  team:      { label: "Team",      hint: "A person on the team",          accent: "rose" },
  skill:     { label: "Skill",     hint: "An agent skill",                accent: "emerald" },
};
