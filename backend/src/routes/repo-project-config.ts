import { Hono } from 'hono'
import type { Context } from 'hono'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import type { Database } from 'bun:sqlite'
import type { Repo } from '@opencode-manager/shared/types'
import { UpdateProjectActionsRequestSchema, UpdateWorktreeSetupRequestSchema, TrustRepoConfigRequestSchema, MoveProjectItemRequestSchema, RunProjectActionRequestSchema } from '@opencode-manager/shared/schemas'
import * as repoService from '../services/repo'
import { resolveRepoWorkingDirectory } from '../services/repo'
import { getRepoById } from '../db/queries'
import type { GitAuthService } from '../services/git-auth'
import type { OpenCodeClient } from '../services/opencode/client'
import type { TerminalService } from '../services/terminal'
import { ProjectConfigError, type ProjectConfigService } from '../services/project-config'
import { logger } from '../utils/logger'
import { getErrorMessage } from '../utils/error-utils'

export interface RepoProjectConfigDeps {
  database: Database
  gitAuthService: GitAuthService
  openCodeClient: OpenCodeClient
  projectConfigService: ProjectConfigService
  terminalService: TerminalService
}

function handleProjectConfigError(c: Context, error: unknown): Response {
  if (error instanceof ProjectConfigError) {
    return c.json(
      { error: error.message, code: error.code, details: error.details },
      error.status as ContentfulStatusCode,
    )
  }
  logger.error('Project config request failed:', error)
  return c.json({ error: getErrorMessage(error) }, 500)
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

  async function resolveRepoDirectory(
    c: Context,
    repoIdParam: string,
    directory: string | undefined,
  ): Promise<{ repo: Repo; directory: string } | Response> {
    const id = Number.parseInt(repoIdParam, 10)
    if (Number.isNaN(id)) {
      return c.json({ error: 'Invalid repo id' }, 400)
    }

    const repo = getRepoById(deps.database, id)
    if (!repo || repo.cloneStatus !== 'ready') {
      return c.json({ error: 'Repo not found' }, 404)
    }

    const resolved = await resolveRepoWorkingDirectory(repo, directory, () =>
      repoService.getSiblingRepos(
        deps.database,
        repo.id,
        deps.gitAuthService.getGitEnvironment(),
        deps.openCodeClient,
      ),
    )

    if (!resolved) {
      return c.json({ error: 'Directory is not part of this repository' }, 400)
    }

    return { repo, directory: resolved }
  }

  app.get('/:id/project-config', async (c) => {
    const resolved = await resolveRepoDirectory(c, c.req.param('id'), c.req.query('directory'))
    if (resolved instanceof Response) return resolved

    try {
      return c.json(await deps.projectConfigService.getConfig(resolved.repo, resolved.directory))
    } catch (error: unknown) {
      return handleProjectConfigError(c, error)
    }
  })

  app.put('/:id/project-config/actions', async (c) => {
    const body = await c.req.json().catch(() => ({}))
    const parsed = UpdateProjectActionsRequestSchema.safeParse(body)
    if (!parsed.success) {
      return c.json({ error: 'Invalid request', details: parsed.error.flatten() }, 400)
    }

    const resolved = await resolveRepoDirectory(c, c.req.param('id'), c.req.query('directory'))
    if (resolved instanceof Response) return resolved

    try {
      const projectRepo = await deps.projectConfigService.resolveProjectRepo(resolved.repo)
      deps.projectConfigService.setPersonalActions(projectRepo, parsed.data.actions)
      return c.json(await deps.projectConfigService.getConfig(resolved.repo, resolved.directory))
    } catch (error: unknown) {
      return handleProjectConfigError(c, error)
    }
  })

  app.put('/:id/project-config/worktree-setup', async (c) => {
    const body = await c.req.json().catch(() => ({}))
    const parsed = UpdateWorktreeSetupRequestSchema.safeParse(body)
    if (!parsed.success) {
      return c.json({ error: 'Invalid request', details: parsed.error.flatten() }, 400)
    }

    const resolved = await resolveRepoDirectory(c, c.req.param('id'), c.req.query('directory'))
    if (resolved instanceof Response) return resolved

    try {
      const projectRepo = await deps.projectConfigService.resolveProjectRepo(resolved.repo)
      deps.projectConfigService.setPersonalSetup(projectRepo, parsed.data.commands)
      return c.json(await deps.projectConfigService.getConfig(resolved.repo, resolved.directory))
    } catch (error: unknown) {
      return handleProjectConfigError(c, error)
    }
  })

  app.post('/:id/project-config/trust', async (c) => {
    const body = await c.req.json().catch(() => ({}))
    const parsed = TrustRepoConfigRequestSchema.safeParse(body)
    if (!parsed.success) {
      return c.json({ error: 'Invalid request', details: parsed.error.flatten() }, 400)
    }

    const resolved = await resolveRepoDirectory(c, c.req.param('id'), parsed.data.directory)
    if (resolved instanceof Response) return resolved

    try {
      await deps.projectConfigService.trustRepoFile(resolved.repo, resolved.directory, parsed.data.hash)
      return c.json(await deps.projectConfigService.getConfig(resolved.repo, resolved.directory))
    } catch (error: unknown) {
      return handleProjectConfigError(c, error)
    }
  })

  app.post('/:id/project-config/move', async (c) => {
    const body = await c.req.json().catch(() => ({}))
    const parsed = MoveProjectItemRequestSchema.safeParse(body)
    if (!parsed.success) {
      return c.json({ error: 'Invalid request', details: parsed.error.flatten() }, 400)
    }

    const resolved = await resolveRepoDirectory(c, c.req.param('id'), parsed.data.directory)
    if (resolved instanceof Response) return resolved

    try {
      await deps.projectConfigService.moveItem(resolved.repo, resolved.directory, parsed.data)
      return c.json(await deps.projectConfigService.getConfig(resolved.repo, resolved.directory))
    } catch (error: unknown) {
      return handleProjectConfigError(c, error)
    }
  })

  app.post('/:id/project-config/actions/:actionId/run', async (c) => {
    const body = await c.req.json().catch(() => ({}))
    const parsed = RunProjectActionRequestSchema.safeParse(body)
    if (!parsed.success) {
      return c.json({ error: 'Invalid request', details: parsed.error.flatten() }, 400)
    }

    const resolved = await resolveRepoDirectory(c, c.req.param('id'), parsed.data.directory)
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
      return handleProjectConfigError(c, error)
    }
  })

  return app
}
