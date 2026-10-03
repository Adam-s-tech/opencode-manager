import { z } from 'zod'

export const PreviewPortSchema = z.object({
  port: z.number().int(),
  host: z.enum(['127.0.0.1', '::1']),
  pid: z.number().int().nullable(),
  command: z.string().nullable(),
  cwd: z.string().nullable(),
  inDirectory: z.boolean(),
})

export const PreviewPortsResponseSchema = z.object({
  enabled: z.boolean(),
  ports: z.array(PreviewPortSchema),
})

export const CreatePreviewSessionRequestSchema = z.object({
  port: z.number().int().min(1024).max(65535),
})

export const CreatePreviewSessionResponseSchema = z.object({
  token: z.string(),
  previewPort: z.number().int(),
  publicUrl: z.string().nullable(),
})

export type PreviewPort = z.infer<typeof PreviewPortSchema>
export type PreviewPortsResponse = z.infer<typeof PreviewPortsResponseSchema>
export type CreatePreviewSessionRequest = z.infer<typeof CreatePreviewSessionRequestSchema>
export type CreatePreviewSessionResponse = z.infer<typeof CreatePreviewSessionResponseSchema>
