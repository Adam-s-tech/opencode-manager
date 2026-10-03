import { z } from 'zod'

export const ProjectActionIconSchema = z.enum([
  'play',
  'build',
  'test',
  'lint',
  'terminal',
  'server',
  'bug',
  'rocket',
])

export const ProjectActionSchema = z.object({
  id: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),
  name: z.string().trim().min(1).max(60),
  command: z.string().trim().min(1).max(4000),
  icon: ProjectActionIconSchema.optional(),
  url: z.string().trim().max(500).optional(),
  autoOpenUrl: z.boolean().default(false),
})

export const WorktreeSetupCommandsSchema = z.array(z.string().trim().min(1).max(4000)).max(20)

export const ProjectItemSourceSchema = z.enum(['personal', 'repo'])

export const RepoProjectFileSchema = z.looseObject({
  version: z.literal(1),
  projectActions: z.array(ProjectActionSchema).optional(),
  setupWorktree: WorktreeSetupCommandsSchema.optional(),
})

export const ProjectConfigResponseSchema = z.object({
  actions: z.array(
    ProjectActionSchema.extend({
      source: ProjectItemSourceSchema,
      resolvedUrl: z.string().optional(),
    }),
  ),
  worktreeSetup: z.array(
    z.object({
      command: z.string(),
      source: ProjectItemSourceSchema,
    }),
  ),
  repoFile: z.object({
    path: z.literal('.ocm/project.json'),
    exists: z.boolean(),
    trusted: z.boolean(),
    hash: z.string().nullable(),
    error: z.string().optional(),
    warnings: z.array(z.string()),
  }),
})

export const UpdateProjectActionsRequestSchema = z.object({
  actions: z.array(ProjectActionSchema).max(50),
})

export const UpdateWorktreeSetupRequestSchema = z.object({
  commands: WorktreeSetupCommandsSchema,
})

export type ProjectActionIcon = z.infer<typeof ProjectActionIconSchema>
export type ProjectAction = z.infer<typeof ProjectActionSchema>
export type WorktreeSetupCommands = z.infer<typeof WorktreeSetupCommandsSchema>
export type ProjectItemSource = z.infer<typeof ProjectItemSourceSchema>
export type RepoProjectFile = z.infer<typeof RepoProjectFileSchema>
export type ProjectConfigResponse = z.infer<typeof ProjectConfigResponseSchema>
export type UpdateProjectActionsRequest = z.infer<typeof UpdateProjectActionsRequestSchema>
export type UpdateWorktreeSetupRequest = z.infer<typeof UpdateWorktreeSetupRequestSchema>
