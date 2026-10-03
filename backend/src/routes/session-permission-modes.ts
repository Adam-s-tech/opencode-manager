import { Hono } from 'hono'
import { SetSessionPermissionModeRequestSchema } from '@opencode-manager/shared/schemas'
import { SessionPermissionModeError, type SessionPermissionModeService } from '../services/session-permission-modes'
import { handleServiceError } from '../utils/route-helpers'

export function createSessionPermissionModeRoutes(service: SessionPermissionModeService) {
  const app = new Hono()

  app.get('/:sessionId', async (c) => {
    try {
      const state = await service.getEffectiveMode(c.req.param('sessionId'))
      return c.json(state)
    } catch (error) {
      return handleServiceError(c, error, 'Failed to read session permission mode', SessionPermissionModeError)
    }
  })

  app.put('/:sessionId', async (c) => {
    let body: unknown
    try {
      body = await c.req.json()
    } catch {
      return c.json({ error: 'Invalid request' }, 400)
    }

    const parsed = SetSessionPermissionModeRequestSchema.safeParse(body)
    if (!parsed.success) {
      return c.json({ error: 'Invalid request' }, 400)
    }

    try {
      const state = await service.setMode(c.req.param('sessionId'), parsed.data.mode, parsed.data.directory)
      return c.json(state)
    } catch (error) {
      return handleServiceError(c, error, 'Failed to set session permission mode', SessionPermissionModeError)
    }
  })

  return app
}
