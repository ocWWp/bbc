import { z } from "zod";
import { supertagSchemas, SUPERTAGS, type Supertag } from "@/lib/memory/types";

export type Proposal = {
  type: Supertag;
  title: string;
  fields: unknown;
  body: string;
};

/**
 * Validates a single proposal: the fields shape must match its supertag's zod schema.
 * Body is free-form prose that ends up in the new item's `body_blocks` as a paragraph.
 */
export const proposalSchema = z
  .object({
    type: z.enum(SUPERTAGS as unknown as [Supertag, ...Supertag[]]),
    title: z.string().min(1).max(200),
    fields: z.record(z.string(), z.unknown()).default({}),
    body: z.string().max(4000).default(""),
  })
  .superRefine((p, ctx) => {
    const result = supertagSchemas[p.type as Supertag].safeParse(p.fields);
    if (!result.success) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${p.type} fields: ${result.error.issues[0]?.message ?? "invalid"}`,
        path: ["fields"],
      });
    }
  });

export const proposalsResponseSchema = z.object({
  proposals: z.array(proposalSchema).min(0).max(20),
});

export type ProposalsResponse = z.infer<typeof proposalsResponseSchema>;
