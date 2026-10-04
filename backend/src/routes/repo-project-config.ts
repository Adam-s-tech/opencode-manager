import { Hono } from 'hono'
import type { Database } from 'bun:sqlite'
import { UpdateProjectActionsRequestSchema, UpdateWorktreeSetupRequestSchema, TrustRepoConfigRequestSchema, MoveProjectItemRequestSchema, RunProjectActionRequestSchema } from '@opencode-manager/shared/schemas'
import type { GitAuthService } from '../services/git-auth'
import type { OpenCodeClient } from '../services/opencode/client'
import type { TerminalService } from '../services/terminal'
import { ProjectConfigError, type ProjectConfigService } from '../services/project-config'
import { handleServiceError } from '../utils/route-helpers'
import { resolveRepoRequestDirectory } from './repo-directory'

export interface RepoProjectConfigDeps {
  database: Database
  gitAuthService: GitAuthService
  openCodeClient: OpenCodeClient
  projectConfigService: ProjectConfigService
  terminalService: TerminalService
}

export function createRepoProjectConfigRoutes(
  database: Database,
  gitAuthService: GitAuthService,
  openCodeClient: OpenCodeClient,
  projectConfigService: ProjectConfigService,
  terminalService: TerminalService,
) {
  const deps: RepoProjectConfigDeps = {
    database,
    gitAuthService,
    openCodeClient,
    projectConfigService,
    terminalService,
  }
  const app = new Hono()

  app.get('/:id/project-config', async (c) => {
    const resolved = await resolveRepoRequestDirectory(c, deps, c.req.param('id'), c.req.query('directory'), {
      allowAssistant: false,
    })
    if (resolved instanceof Response) return resolved

    try {
      return c.json(await deps.projectConfigService.getConfig(resolved.repo, resolved.directory))
    } catch (error: unknown) {
      return handleServiceError(c, error, 'Project config request failed', ProjectConfigError)
    }
  })

  app.put('/:id/project-config/actions', async (c) => {
    const body = await c.req.json().catch(() => ({}))
    const parsed = UpdateProjectActionsRequestSchema.safeParse(body)
    if (!parsed.success) {
      return c.json({ error: 'Invalid request', details: parsed.error.flatten() }, 400)
    }

    const resolved = await resolveRepoRequestDirectory(c, deps, c.req.param('id'), c.req.query('directory'), {
      allowAssistant: false,
    })
    if (resolved instanceof Response) return resolved

    try {
      const projectRepo = await deps.projectConfigService.resolveProjectRepo(resolved.repo)
      deps.projectConfigService.setPersonalActions(projectRepo, parsed.data.actions)
      return c.json(await deps.projectConfigService.getConfig(resolved.repo, resolved.directory))
    } catch (error: unknown) {
      return handleServiceError(c, error, 'Project config request failed', ProjectConfigError)
    }
  })

  app.put('/:id/project-config/worktree-setup', async (c) => {
    const body = await c.req.json().catch(() => ({}))
    const parsed = UpdateWorktreeSetupRequestSchema.safeParse(body)
    if (!parsed.success) {
      return c.json({ error: 'Invalid request', details: parsed.error.flatten() }, 400)
    }

    const resolved = await resolveRepoRequestDirectory(c, deps, c.req.param('id'), c.req.query('directory'), {
      allowAssistant: false,
    })
    if (resolved instanceof Response) return resolved

    try {
      const projectRepo = await deps.projectConfigService.resolveProjectRepo(resolved.repo)
      deps.projectConfigService.setPersonalSetup(projectRepo, parsed.data.commands)
      return c.json(await deps.projectConfigService.getConfig(resolved.repo, resolved.directory))
    } catch (error: unknown) {
      return handleServiceError(c, error, 'Project config request failed', ProjectConfigError)
    }
  })

  app.post('/:id/project-config/trust', async (c) => {
    const body = await c.req.json().catch(() => ({}))
    const parsed = TrustRepoConfigRequestSchema.safeParse(body)
    if (!parsed.success) {
      return c.json({ error: 'Invalid request', details: parsed.error.flatten() }, 400)
    }

    const resolved = await resolveRepoRequestDirectory(c, deps, c.req.param('id'), parsed.data.directory, {
      allowAssistant: false,
    })
    if (resolved instanceof Response) return resolved

    try {
      await deps.projectConfigService.trustRepoFile(resolved.repo, resolved.directory, parsed.data.hash)
      return c.json(await deps.projectConfigService.getConfig(resolved.repo, resolved.directory))
    } catch (error: unknown) {
      return handleServiceError(c, error, 'Project config request failed', ProjectConfigError)
    }
  })

  app.post('/:id/project-config/move', async (c) => {
    const body = await c.req.json().catch(() => ({}))
    const parsed = MoveProjectItemRequestSchema.safeParse(body)
    if (!parsed.success) {
      return c.json({ error: 'Invalid request', details: parsed.error.flatten() }, 400)
    }

    const resolved = await resolveRepoRequestDirectory(c, deps, c.req.param('id'), parsed.data.directory, {
      allowAssistant: false,
    })
    if (resolved instanceof Response) return resolved

    try {
      await deps.projectConfigService.moveItem(resolved.repo, resolved.directory, parsed.data)
      return c.json(await deps.projectConfigService.getConfig(resolved.repo, resolved.directory))
    } catch (error: unknown) {
      return handleServiceError(c, error, 'Project config request failed', ProjectConfigError)
    }
  })

  app.post('/:id/project-config/actions/:actionId/run', async (c) => {
    const body = await c.req.json().catch(() => ({}))
    const parsed = RunProjectActionRequestSchema.safeParse(body)
    if (!parsed.success) {
      return c.json({ error: 'Invalid request', details: parsed.error.flatten() }, 400)
    }

    const resolved = await resolveRepoRequestDirectory(c, deps, c.req.param('id'), parsed.data.directory, {
      allowAssistant: false,
    })
    if (resolved instanceof Response) return resolved

    try {
      const response = await deps.projectConfigService.runAction(
        resolved.repo,
        resolved.directory,
        c.req.param('actionId'),
        deps.terminalService,
      )
      return c.json(response)
    } catch (error: unknown) {
      return handleServiceError(c, error, 'Project config request failed', ProjectConfigError)
    }
  })

  return app
}
