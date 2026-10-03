import { Hono } from 'hono'
import { StartSessionGoalRequestSchema } from '@opencode-manager/shared/schemas'
import { SessionGoalError, type SessionGoalService } from '../services/session-goals'
import { handleServiceError, parseId } from '../utils/route-helpers'

export function createSessionGoalRoutes(service: SessionGoalService) {
  const app = new Hono()

  app.get('/', (c) => {
    try {
      const sessionId = c.req.query('sessionId')
      if (!sessionId) {
        return c.json({ error: 'Invalid request' }, 400)
      }
      return c.json({ goal: service.getLatest(sessionId) })
    } catch (error) {
      return handleServiceError(c, error, 'Failed to read session goal', SessionGoalError)
    }
  })

  app.post('/', async (c) => {
    let body: unknown
    try {
      body = await c.req.json()
    } catch {
      return c.json({ error: 'Invalid request' }, 400)
    }

    const parsed = StartSessionGoalRequestSchema.safeParse(body)
    if (!parsed.success) {
      return c.json({ error: 'Invalid request' }, 400)
    }

    try {
      const goal = await service.start(parsed.data)
      return c.json({ goal }, 201)
    } catch (error) {
      return handleServiceError(c, error, 'Failed to start session goal', SessionGoalError)
    }
  })

  app.post('/:id/pause', (c) => {
    try {
      const goal = service.pause(parseId(c.req.param('id'), 'goal id', SessionGoalError))
      return c.json({ goal })
    } catch (error) {
      return handleServiceError(c, error, 'Failed to pause session goal', SessionGoalError)
    }
  })

  app.post('/:id/resume', (c) => {
    try {
      const goal = service.resume(parseId(c.req.param('id'), 'goal id', SessionGoalError))
      return c.json({ goal })
    } catch (error) {
      return handleServiceError(c, error, 'Failed to resume session goal', SessionGoalError)
    }
  })

  app.post('/:id/cancel', (c) => {
    try {
      const goal = service.cancel(parseId(c.req.param('id'), 'goal id', SessionGoalError))
      return c.json({ goal })
    } catch (error) {
      return handleServiceError(c, error, 'Failed to cancel session goal', SessionGoalError)
    }
  })

  return app
}
