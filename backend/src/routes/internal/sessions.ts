import { Hono, type Context } from 'hono'
import { z } from 'zod'
import type { Database } from 'bun:sqlite'
import {
  InternalCreateSessionRequestSchema,
  InternalForkSessionRequestSchema,
  InternalSessionPromptRequestSchema,
} from '@opencode-manager/shared/schemas'
import { isSessionNotFoundError } from '@opencode-manager/shared/opencode'
import { getRepoById, listRepos } from '../../db/queries'
import { getErrorMessage } from '../../utils/error-utils'
import { logger } from '../../utils/logger'
import type { OpenCodeClient } from '../../services/opencode/client'
import { SessionLaunchError, SessionLauncher } from '../../services/session-launcher'
import { isSessionBusy, readLatestAssistantReply } from '../../services/session-reply'

const INTERNAL_SESSION_LIST_LIMIT_MIN = 1
const INTERNAL_SESSION_LIST_LIMIT_MAX = 50
const INTERNAL_SESSION_LIST_LIMIT_DEFAULT = 10
const INTERNAL_SESSION_WORKSPACE_NAME_FALLBACK = 'ocm-session'

const ListSessionsQuerySchema = z.object({
  repoId: z.coerce.number().int().optional(),
  limit: z.coerce
    .number()
    .int()
    .min(INTERNAL_SESSION_LIST_LIMIT_MIN)
    .max(INTERNAL_SESSION_LIST_LIMIT_MAX)
    .default(INTERNAL_SESSION_LIST_LIMIT_DEFAULT),
})

type JsonBodyResult = { ok: true; value: unknown } | { ok: false }

async function readJsonBody(c: Context): Promise<JsonBodyResult> {
  const text = await c.req.text()
  if (!text.trim()) {
    return { ok: true, value: {} }
  }
  try {
    return { ok: true, value: JSON.parse(text) }
  } catch {
    return { ok: false }
  }
}

function openCodeErrorResponse(error: unknown): { status: 400 | 404 | 502; body: { error: string } } {
  if (error instanceof SessionLaunchError) {
    return { status: error.status, body: { error: error.message } }
  }
  if (isSessionNotFoundError(error)) {
    return { status: 404, body: { error: 'Session not found' } }
  }
  logger.error('Internal session request failed:', error)
  return { status: 502, body: { error: getErrorMessage(error) } }
}

function workspaceNameFromTitle(title: string | undefined): string {
  const slug = (title ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+/, '')
    .replace(/-+$/, '')
  return slug || INTERNAL_SESSION_WORKSPACE_NAME_FALLBACK
}

export function createInternalSessionRoutes(db: Database, openCodeClient: OpenCodeClient) {
  const app = new Hono()
  const sessionLauncher = new SessionLauncher(db, openCodeClient)

  app.get('/', async (c) => {
    const parsedQuery = ListSessionsQuerySchema.safeParse(c.req.query())
    if (!parsedQuery.success) {
      return c.json({ error: 'Invalid query', details: parsedQuery.error.issues }, 400)
    }

    const { repoId, limit } = parsedQuery.data
    const repo = repoId === undefined ? undefined : getRepoById(db, repoId)
    if (repoId !== undefined && !repo) {
      return c.json({ error: 'Repository not found' }, 404)
    }

    try {
      const response = await openCodeClient.api.session.list({
        limit,
        order: 'desc',
        parentID: null,
        ...(repo ? { directory: repo.fullPath } : {}),
      })
      const active = await openCodeClient.api.session.active()
      const repos = listRepos(db)

      const sessions = response.data.map((session) => {
        const directory = session.location.directory
        const matchedRepo = repos.find((candidate) => candidate.fullPath === directory)
        return {
          id: session.id,
          title: session.title ?? null,
          directory,
          repoId: matchedRepo?.id ?? null,
          busy: session.id in active,
          outcome: session.outcome ?? null,
          updated: session.time.updated,
        }
      })

      return c.json({ sessions })
    } catch (error) {
      const mapped = openCodeErrorResponse(error)
      return c.json(mapped.body, mapped.status)
    }
  })

  app.post('/', async (c) => {
    const body = await readJsonBody(c)
    if (!body.ok) {
      return c.json({ error: 'Invalid JSON' }, 400)
    }

    const parsed = InternalCreateSessionRequestSchema.safeParse(body.value)
    if (!parsed.success) {
      return c.json({ error: 'Invalid request body', details: parsed.error.issues }, 400)
    }

    const input = parsed.data
    try {
      const launched = await sessionLauncher.launch({
        repoId: input.repoId,
        prompt: input.prompt,
        ...(input.title ? { title: input.title } : {}),
        ...(input.model ? { model: input.model } : {}),
        ...(input.agent ? { agent: input.agent } : {}),
        ...(input.worktree
          ? {
              workspace: {
                name: workspaceNameFromTitle(input.title),
                ...(input.ref ? { ref: input.ref } : {}),
              },
            }
          : {}),
      })

      const url = `/repos/${launched.repoId}/sessions/${launched.sessionId}${launched.workspaceDirectory ? '?repoTab=workspaces' : ''}`
      return c.json({ ...launched, url }, 201)
    } catch (error) {
      const mapped = openCodeErrorResponse(error)
      return c.json(mapped.body, mapped.status)
    }
  })

  app.post('/:sessionId/prompt', async (c) => {
    const sessionId = c.req.param('sessionId')
    const body = await readJsonBody(c)
    if (!body.ok) {
      return c.json({ error: 'Invalid JSON' }, 400)
    }

    const parsed = InternalSessionPromptRequestSchema.safeParse(body.value)
    if (!parsed.success) {
      return c.json({ error: 'Invalid request body', details: parsed.error.issues }, 400)
    }

    try {
      await openCodeClient.api.session.prompt({
        sessionID: sessionId,
        text: parsed.data.text,
        delivery: 'queue',
      })
      return c.json({ queued: true }, 202)
    } catch (error) {
      const mapped = openCodeErrorResponse(error)
      return c.json(mapped.body, mapped.status)
    }
  })

  app.get('/:sessionId/reply', async (c) => {
    const sessionId = c.req.param('sessionId')

    try {
      const [busy, reply] = await Promise.all([
        isSessionBusy(openCodeClient, sessionId),
        readLatestAssistantReply(openCodeClient, sessionId),
      ])

      return c.json({
        busy,
        responseText: reply?.responseText ?? null,
        errorText: reply?.errorText ?? null,
        completed: reply?.completed ?? false,
      })
    } catch (error) {
      const mapped = openCodeErrorResponse(error)
      return c.json(mapped.body, mapped.status)
    }
  })

  app.post('/:sessionId/fork', async (c) => {
    const sessionId = c.req.param('sessionId')
    const body = await readJsonBody(c)
    if (!body.ok) {
      return c.json({ error: 'Invalid JSON' }, 400)
    }

    const parsed = InternalForkSessionRequestSchema.safeParse(body.value)
    if (!parsed.success) {
      return c.json({ error: 'Invalid request body', details: parsed.error.issues }, 400)
    }

    const beforeMessageId = parsed.data.beforeMessageId
    try {
      const forked = await openCodeClient.api.session.fork({
        sessionID: sessionId,
        ...(beforeMessageId ? { before: beforeMessageId } : {}),
      })
      return c.json({ sessionId: forked.id, directory: forked.location.directory })
    } catch (error) {
      const mapped = openCodeErrorResponse(error)
      return c.json(mapped.body, mapped.status)
    }
  })

  return app
}
