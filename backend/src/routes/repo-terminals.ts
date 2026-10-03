import { Hono } from 'hono'
import type { Database } from 'bun:sqlite'
import { CreateTerminalRequestSchema, ResizeTerminalRequestSchema } from '@opencode-manager/shared/schemas'
import type { GitAuthService } from '../services/git-auth'
import type { OpenCodeClient } from '../services/opencode/client'
import { TerminalService, TerminalNotFoundError } from '../services/terminal'
import { handleOpenCodeError } from '../utils/route-helpers'
import { resolveRepoRequestDirectory, type RepoDirectoryDeps } from './repo-directory'

export interface TerminalRoutesDeps extends RepoDirectoryDeps {
  terminalService: TerminalService
}

export function createRepoTerminalRoutes(
  database: Database,
  gitAuthService: GitAuthService,
  openCodeClient: OpenCodeClient,
  terminalService: TerminalService,
) {
  const deps: TerminalRoutesDeps = { database, gitAuthService, openCodeClient, terminalService }
  const app = new Hono()

  app.get('/:id/terminals', async (c) => {
    const resolved = await resolveRepoRequestDirectory(c, deps, c.req.param('id'), c.req.query('directory'), {
      allowAssistant: true,
    })
    if (resolved instanceof Response) return resolved

    try {
      const terminals = await deps.terminalService.list(resolved.directory)
      return c.json({ terminals })
    } catch (error: unknown) {
      return handleOpenCodeError(c, error, 'Terminal request failed')
    }
  })

  app.post('/:id/terminals', async (c) => {
    const body = await c.req.json().catch(() => ({}))
    const parsed = CreateTerminalRequestSchema.safeParse(body)
    if (!parsed.success) {
      return c.json({ error: 'Invalid request' }, 400)
    }

    const resolved = await resolveRepoRequestDirectory(c, deps, c.req.param('id'), parsed.data.directory, {
      allowAssistant: true,
    })
    if (resolved instanceof Response) return resolved

    try {
      const terminal = await deps.terminalService.create(resolved.directory, {
        kind: 'shell',
        name: parsed.data.title ?? 'Terminal',
      })
      return c.json(terminal)
    } catch (error: unknown) {
      return handleOpenCodeError(c, error, 'Terminal request failed')
    }
  })

  app.patch('/:id/terminals/:ptyID', async (c) => {
    const body = await c.req.json().catch(() => ({}))
    const parsed = ResizeTerminalRequestSchema.safeParse(body)
    if (!parsed.success) {
      return c.json({ error: 'Invalid request' }, 400)
    }

    const resolved = await resolveRepoRequestDirectory(c, deps, c.req.param('id'), parsed.data.directory, {
      allowAssistant: true,
    })
    if (resolved instanceof Response) return resolved

    const ptyID = c.req.param('ptyID')

    try {
      await deps.terminalService.requireTerminal(resolved.directory, ptyID)
      await deps.terminalService.resize(resolved.directory, ptyID, { cols: parsed.data.cols, rows: parsed.data.rows })
      return c.json({ success: true })
    } catch (error: unknown) {
      if (error instanceof TerminalNotFoundError) {
        return c.json({ error: error.message }, 404)
      }
      return handleOpenCodeError(c, error, 'Terminal request failed')
    }
  })

  app.delete('/:id/terminals/:ptyID', async (c) => {
    const resolved = await resolveRepoRequestDirectory(c, deps, c.req.param('id'), c.req.query('directory'), {
      allowAssistant: true,
    })
    if (resolved instanceof Response) return resolved

    const ptyID = c.req.param('ptyID')

    try {
      await deps.terminalService.requireTerminal(resolved.directory, ptyID)
      await deps.terminalService.remove(resolved.directory, ptyID)
      return c.json({ success: true })
    } catch (error: unknown) {
      if (error instanceof TerminalNotFoundError) {
        return c.json({ error: error.message }, 404)
      }
      return handleOpenCodeError(c, error, 'Terminal request failed')
    }
  })

  return app
}
