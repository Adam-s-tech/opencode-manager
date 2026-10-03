import { z } from "zod";

export const InternalCreateSessionRequestSchema = z
  .object({
    repoId: z.number().int(),
    prompt: z.string().trim().min(1).max(20000),
    title: z.string().max(200).optional(),
    model: z.string().optional(),
    agent: z.string().optional(),
    worktree: z.boolean().optional(),
    ref: z.string().optional(),
  })
  .strict();

export type InternalCreateSessionRequest = z.infer<typeof InternalCreateSessionRequestSchema>;

export const InternalSessionPromptRequestSchema = z
  .object({
    text: z.string().trim().min(1).max(20000),
  })
  .strict();

export type InternalSessionPromptRequest = z.infer<typeof InternalSessionPromptRequestSchema>;

export const InternalForkSessionRequestSchema = z
  .object({
    beforeMessageId: z.string().optional(),
  })
  .strict();

export type InternalForkSessionRequest = z.infer<typeof InternalForkSessionRequestSchema>;
