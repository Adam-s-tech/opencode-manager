import { z } from 'zod'

export const TerminalKindSchema = z.enum(['shell', 'action', 'setup'])

export const TerminalInfoSchema = z.object({
  id: z.string(),
  title: z.string(),
  kind: TerminalKindSchema,
  actionId: z.string().optional(),
  cwd: z.string(),
  status: z.enum(['running', 'exited']),
  exitCode: z.number().int().optional(),
})

export const CreateTerminalRequestSchema = z.object({
  directory: z.string().trim().min(1).optional(),
  title: z.string().trim().min(1).max(80).optional(),
})

export const ResizeTerminalRequestSchema = z.object({
  directory: z.string().trim().min(1).optional(),
  cols: z.number().int().min(1).max(1000),
  rows: z.number().int().min(1).max(500),
})

export type TerminalKind = z.infer<typeof TerminalKindSchema>
export type TerminalInfo = z.infer<typeof TerminalInfoSchema>
export type CreateTerminalRequest = z.infer<typeof CreateTerminalRequestSchema>
export type ResizeTerminalRequest = z.infer<typeof ResizeTerminalRequestSchema>
