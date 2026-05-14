// Runtime shape of a single rendered output block from a workflow run.
// Each block carries one of the platform-card kinds (x_post, linkedin_post, …)
// plus a props bag the card component renders. Citations live inside the
// text via inline <cite mem_id="..."/> tags; the renderer extracts them.

import { z } from "zod";
import type { PreviewKind } from "./templates/types";

// Per-kind props schemas. Kept liberal so the LLM has room to vary structure
// where the card can support it, tight where the card depends on a field.

export const xPostPropsSchema = z.object({
  text: z.string().min(1).max(800),
  hashtags: z.array(z.string()).max(8).optional(),
});

export const xThreadPropsSchema = z.object({
  posts: z
    .array(z.object({ text: z.string().min(1).max(800) }))
    .min(2)
    .max(20),
});

export const threadsPostPropsSchema = z.object({
  text: z.string().min(1).max(2000),
});

export const linkedInPostPropsSchema = z.object({
  headline: z.string().max(200).optional(),
  body: z.string().min(1).max(5000),
  hashtags: z.array(z.string()).max(8).optional(),
});

export const blogDraftPropsSchema = z.object({
  title: z.string().min(1).max(200),
  subtitle: z.string().max(300).optional(),
  body_markdown: z.string().min(1).max(20000),
});

export const scriptPropsSchema = z.object({
  hook: z.string().min(1).max(400),
  beats: z
    .array(z.object({ time: z.string().max(20), line: z.string().min(1).max(400) }))
    .min(1)
    .max(40),
  cta: z.string().max(300).optional(),
});

export const plainPropsSchema = z.object({
  text: z.string().min(1).max(8000),
});

export const outputBlockSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("x_post"), props: xPostPropsSchema }),
  z.object({ kind: z.literal("x_thread"), props: xThreadPropsSchema }),
  z.object({ kind: z.literal("threads_post"), props: threadsPostPropsSchema }),
  z.object({ kind: z.literal("linkedin_post"), props: linkedInPostPropsSchema }),
  z.object({ kind: z.literal("blog_draft"), props: blogDraftPropsSchema }),
  z.object({ kind: z.literal("script"), props: scriptPropsSchema }),
  z.object({ kind: z.literal("plain"), props: plainPropsSchema }),
]);

export type OutputBlock = z.infer<typeof outputBlockSchema>;

export const emitOutputResponseSchema = z.object({
  blocks: z.array(outputBlockSchema).min(1).max(8),
  cited_memory_ids: z.array(z.string().uuid()).max(20).default([]),
});

export type EmitOutputResponse = z.infer<typeof emitOutputResponseSchema>;

// JSON-Schema mirror for the Anthropic tool input_schema. Kept hand-written
// because the SDK doesn't accept zod -> JSONSchema conversion at this layer
// and we want to be explicit about what we permit.
export const EMIT_OUTPUT_TOOL_INPUT_SCHEMA = {
  type: "object" as const,
  properties: {
    blocks: {
      type: "array",
      minItems: 1,
      maxItems: 8,
      items: {
        type: "object",
        properties: {
          kind: {
            type: "string",
            enum: [
              "x_post",
              "x_thread",
              "threads_post",
              "linkedin_post",
              "blog_draft",
              "script",
              "plain",
            ],
          },
          props: { type: "object" },
        },
        required: ["kind", "props"],
      },
    },
    cited_memory_ids: {
      type: "array",
      items: { type: "string" },
      description:
        "uuid array. Every memory you cited inline via <cite mem_id='...'/>. Empty array if you did not cite anything.",
    },
  },
  required: ["blocks", "cited_memory_ids"],
};

// Strip <cite mem_id="..."/> tags whose ids don't belong to the active tenant.
// Returns the cleaned text and the count stripped (for telemetry).
const CITE_RE = /<cite\s+mem_id\s*=\s*['"]([0-9a-fA-F-]{36})['"]\s*\/?>/g;

export function stripUnknownCitations(
  text: string,
  knownIds: Set<string>,
): { cleaned: string; stripped: number } {
  let stripped = 0;
  const cleaned = text.replace(CITE_RE, (match, id: string) => {
    if (knownIds.has(id)) return match;
    stripped += 1;
    return "";
  });
  return { cleaned, stripped };
}

// Walk a block's props and clean citation tags inside any string field.
// Returns the cleaned block + the total citations stripped from it.
export function cleanBlockCitations(
  block: OutputBlock,
  knownIds: Set<string>,
): { block: OutputBlock; stripped: number } {
  let total = 0;
  const cleanString = (s: string) => {
    const r = stripUnknownCitations(s, knownIds);
    total += r.stripped;
    return r.cleaned;
  };
  switch (block.kind) {
    case "x_post":
      return {
        block: { kind: "x_post", props: { ...block.props, text: cleanString(block.props.text) } },
        stripped: total,
      };
    case "x_thread":
      return {
        block: {
          kind: "x_thread",
          props: { posts: block.props.posts.map((p) => ({ text: cleanString(p.text) })) },
        },
        stripped: total,
      };
    case "threads_post":
      return {
        block: { kind: "threads_post", props: { text: cleanString(block.props.text) } },
        stripped: total,
      };
    case "linkedin_post":
      return {
        block: {
          kind: "linkedin_post",
          props: {
            ...block.props,
            headline: block.props.headline ? cleanString(block.props.headline) : undefined,
            body: cleanString(block.props.body),
          },
        },
        stripped: total,
      };
    case "blog_draft":
      return {
        block: {
          kind: "blog_draft",
          props: {
            title: cleanString(block.props.title),
            subtitle: block.props.subtitle ? cleanString(block.props.subtitle) : undefined,
            body_markdown: cleanString(block.props.body_markdown),
          },
        },
        stripped: total,
      };
    case "script":
      return {
        block: {
          kind: "script",
          props: {
            hook: cleanString(block.props.hook),
            beats: block.props.beats.map((b) => ({ time: b.time, line: cleanString(b.line) })),
            cta: block.props.cta ? cleanString(block.props.cta) : undefined,
          },
        },
        stripped: total,
      };
    case "plain":
      return {
        block: { kind: "plain", props: { text: cleanString(block.props.text) } },
        stripped: total,
      };
  }
}

// Re-export so callers don't need to import from templates/types separately.
export type { PreviewKind };
