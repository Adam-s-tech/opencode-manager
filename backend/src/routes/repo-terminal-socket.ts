import { Hono } from 'hono'
import type { MiddlewareHandler } from 'hono'
import type { Database } from 'bun:sqlite'
import type { UpgradeWebSocket } from 'hono/ws'
import { getTrustedOrigins } from '@opencode-manager/shared/config/env'
import type { GitAuthService } from '../services/git-auth'
import type { OpenCodeClient } from '../services/opencode/client'
import type { TerminalService } from '../services/terminal'
import { forwardPeerMessage, peerBufferedAmount, type WebSocketBridge } from '../utils/websocket-bridge'
import { getErrorMessage } from '../utils/error-utils'
import { resolveRepoRequestDirectory } from './repo-directory'

interface RepoTerminalSocketVariables {
  terminalDirectory: string
  terminalCursor: number | undefined
}

const MAX_CLOSE_REASON_BYTES = 120

function isAllowedUpgradeOrigin(
  origin: string | undefined,
  trustedOrigins: readonly string[],
): boolean {
  if (origin === undefined) return true
  if (origin === 'null') return false
  return trustedOrigins.includes(origin)
}

function parseCursor(raw: string | undefined): number | undefined | null {
  if (raw === undefined) return undefined
  if (!/^-?\d+$/.test(raw)) return null
  const parsed = Number(raw)
  if (!Number.isSafeInteger(parsed) || parsed < -1) return null
  return parsed
}

function truncateCloseReason(message: string): string {
  const bytes = Buffer.from(message, 'utf8')
  if (bytes.length <= MAX_CLOSE_REASON_BYTES) return message
  return bytes.subarray(0, MAX_CLOSE_REASON_BYTES).toString('utf8')
}

export function createRepoTerminalSocketRoutes(
  database: Database,
  gitAuthService: GitAuthService,
  openCodeClient: OpenCodeClient,
  terminalService: TerminalService,
  upgradeWebSocket: UpgradeWebSocket,
  trustedOrigins: readonly string[] = getTrustedOrigins(),
) {
  const app = new Hono<{ Variables: RepoTerminalSocketVariables }>()
  const deps = { database, gitAuthService, openCodeClient }

  const validate: MiddlewareHandler<{ Variables: RepoTerminalSocketVariables }> = async (c, next) => {
    if (!isAllowedUpgradeOrigin(c.req.header('origin'), trustedOrigins)) {
      return c.json({ error: 'Origin not allowed' }, 403)
    }

    const cursor = parseCursor(c.req.query('cursor'))
    if (cursor === null) {
      return c.json({ error: 'Invalid cursor' }, 400)
    }

    const resolved = await resolveRepoRequestDirectory(c, deps, c.req.param('id') ?? '', c.req.query('directory'), {
      allowAssistant: true,
    })
    if (resolved instanceof Response) return resolved

    c.set('terminalDirectory', resolved.directory)
    c.set('terminalCursor', cursor)
    await next()
  }

  app.get(
    '/:id/terminals/:ptyID/connect',
    validate,
    upgradeWebSocket((c) => {
      const directory = c.get('terminalDirectory')
      const cursor = c.get('terminalCursor')
      const ptyID = c.req.param('ptyID')

      let bridge: WebSocketBridge | undefined
      let closed = false
      let connectPromise: Promise<void> = Promise.resolve()

      return {
        onOpen(_event, ws) {
          connectPromise = terminalService
            .connect(directory, ptyID, cursor, {
              send: (data) => ws.send(data),
              close: (code, reason) => ws.close(code, reason),
              bufferedAmount: () => peerBufferedAmount(ws),
            })
            .then((connected) => {
              if (closed) {
                connected.close()
                return
              }
              bridge = connected
            })
            .catch((error: unknown) => {
              if (closed) return
              ws.close(1011, truncateCloseReason(getErrorMessage(error)))
            })
        },
        async onMessage(event) {
          await connectPromise
          if (!bridge) return
          await forwardPeerMessage(bridge, event.data)
        },
        onClose() {
          closed = true
          bridge?.close()
        },
      }
    }),
  )

  return app
}
