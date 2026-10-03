import { randomBytes } from 'node:crypto'
import { Hono } from 'hono'
import type { Context, MiddlewareHandler } from 'hono'
import { createNodeWebSocket, type NodeWebSocket } from '@hono/node-ws'
import { buildProxyResponseHeaders, filterProxyHeaders } from '../../utils/proxy-headers'
import { bridgeWebSocket, type WebSocketBridge } from '../../utils/websocket-bridge'

export const PREVIEW_COOKIE = 'ocm_preview'

const START_TOKEN_TTL_MS = 60_000
const SESSION_TTL_MS = 12 * 60 * 60 * 1000

const MANAGER_COOKIE_PREFIXES = ['opencode.', '__Secure-opencode.', '__Host-opencode.']

export type PreviewHost = '127.0.0.1' | '::1'

export interface PreviewSession {
  id: string
  port: number
  host: PreviewHost
  expiresAt: number
}

interface StartToken {
  port: number
  host: PreviewHost
  expiresAt: number
}

export interface PreviewSessionStoreOptions {
  now?: () => number
  randomToken?: () => string
}

export class PreviewSessionStore {
  private readonly startTokens = new Map<string, StartToken>()
  private readonly sessions = new Map<string, PreviewSession>()
  private readonly now: () => number
  private readonly randomToken: () => string

  constructor(options: PreviewSessionStoreOptions = {}) {
    this.now = options.now ?? Date.now
    this.randomToken = options.randomToken ?? (() => randomBytes(32).toString('base64url'))
  }

  issueStartToken(target: { port: number; host: PreviewHost }): string {
    this.prune()
    const token = this.randomToken()
    this.startTokens.set(token, { port: target.port, host: target.host, expiresAt: this.now() + START_TOKEN_TTL_MS })
    return token
  }

  consumeStartToken(token: string): string | null {
    this.prune()
    const entry = this.startTokens.get(token)
    if (!entry) return null
    this.startTokens.delete(token)
    const id = this.randomToken()
    this.sessions.set(id, { id, port: entry.port, host: entry.host, expiresAt: this.now() + SESSION_TTL_MS })
    return id
  }

  getSession(id: string): PreviewSession | undefined {
    this.prune()
    return this.sessions.get(id)
  }

  private prune(): void {
    const now = this.now()
    for (const [token, entry] of this.startTokens) {
      if (entry.expiresAt <= now) this.startTokens.delete(token)
    }
    for (const [id, session] of this.sessions) {
      if (session.expiresAt <= now) this.sessions.delete(id)
    }
  }
}

export function stripManagerCookies(cookieHeader: string | undefined): string | undefined {
  if (!cookieHeader) return undefined
  const kept = cookieHeader
    .split(';')
    .map((part) => part.trim())
    .filter((part) => {
      if (!part) return false
      const separator = part.indexOf('=')
      const name = separator === -1 ? part : part.slice(0, separator)
      if (name === PREVIEW_COOKIE) return false
      return !MANAGER_COOKIE_PREFIXES.some((prefix) => name.startsWith(prefix))
    })
  return kept.length > 0 ? kept.join('; ') : undefined
}

function readPreviewCookie(cookieHeader: string | undefined): string | null {
  if (!cookieHeader) return null
  for (const part of cookieHeader.split(';')) {
    const trimmed = part.trim()
    const separator = trimmed.indexOf('=')
    if (separator === -1) continue
    if (trimmed.slice(0, separator) === PREVIEW_COOKIE) {
      return trimmed.slice(separator + 1)
    }
  }
  return null
}

function htmlResponse(status: number, message: string): Response {
  return new Response(`<!doctype html><html><body><p>${message}</p></body></html>`, {
    status,
    headers: { 'content-type': 'text/html; charset=utf-8' },
  })
}

function rewriteLocalLocation(location: string, port: number): string | null {
  let parsed: URL
  try {
    parsed = new URL(location)
  } catch {
    return null
  }
  const isLocalHost =
    parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1' || parsed.hostname === '[::1]' || parsed.hostname === '::1'
  if (!isLocalHost) return null
  const locationPort = parsed.port
    ? Number.parseInt(parsed.port, 10)
    : parsed.protocol === 'https:'
      ? 443
      : 80
  if (locationPort !== port) return null
  return `${parsed.pathname}${parsed.search}`
}

export interface PreviewGateway {
  app: Hono
  injectWebSocket: NodeWebSocket['injectWebSocket']
}

function isWebSocketUpgrade(c: Context): boolean {
  return c.req.header('upgrade')?.toLowerCase() === 'websocket'
}

function upstreamWebSocketUrl(session: PreviewSession, requestUrl: URL): string {
  const targetHost = session.host === '::1' ? '[::1]' : 'localhost'
  return `ws://${targetHost}:${session.port}${requestUrl.pathname}${requestUrl.search}`
}

function parseProtocols(header: string | undefined): string[] {
  if (!header) return []
  return header
    .split(',')
    .map((protocol) => protocol.trim())
    .filter((protocol) => protocol.length > 0)
}

export function createPreviewGatewayApp(store: PreviewSessionStore, fetchFn: typeof fetch = fetch): PreviewGateway {
  const app = new Hono()
  const { injectWebSocket, upgradeWebSocket } = createNodeWebSocket({ app })

  app.get('/__ocm_preview/start', (c) => {
    const sessionId = store.consumeStartToken(c.req.query('token') ?? '')
    if (!sessionId) {
      return htmlResponse(401, 'Preview session is invalid or expired.')
    }

    const requestedPath = c.req.query('path') ?? ''
    const location = requestedPath.startsWith('/') && !requestedPath.startsWith('//') ? requestedPath : '/'

    const forwardedProto = c.req.header('x-forwarded-proto')?.toLowerCase()
    const isSecure = forwardedProto === 'https' || new URL(c.req.url).protocol === 'https:'
    const cookie = `${PREVIEW_COOKIE}=${sessionId}; HttpOnly; SameSite=Lax; Path=/${isSecure ? '; Secure' : ''}`

    return new Response(null, { status: 302, headers: { location, 'set-cookie': cookie } })
  })

  const sessionGuard: MiddlewareHandler = async (c, next) => {
    if (!isWebSocketUpgrade(c)) {
      await next()
      return
    }
    const sessionId = readPreviewCookie(c.req.header('cookie'))
    if (!sessionId || !store.getSession(sessionId)) {
      return htmlResponse(401, 'Preview session expired. Reopen it from OpenCode Manager.')
    }
    await next()
  }

  app.get(
    '/*',
    sessionGuard,
    upgradeWebSocket((c) => {
      const requestUrl = new URL(c.req.url)
      const protocols = parseProtocols(c.req.header('sec-websocket-protocol'))
      let bridge: WebSocketBridge | undefined

      return {
        onOpen(_event, ws) {
          const sessionId = readPreviewCookie(c.req.header('cookie'))
          const session = sessionId ? store.getSession(sessionId) : undefined
          if (!session) {
            ws.close(1011)
            return
          }

          let upstream: WebSocket
          try {
            upstream = new WebSocket(upstreamWebSocketUrl(session, requestUrl), protocols.length > 0 ? protocols : undefined)
          } catch {
            ws.close(1011)
            return
          }

          bridge = bridgeWebSocket(upstream, {
            send: (data) => ws.send(data),
            close: (code, reason) => ws.close(code, reason),
          })
        },
        async onMessage(event) {
          if (!bridge) return
          const data = event.data
          if (typeof data === 'string') {
            bridge.send(data)
            return
          }
          if (data instanceof Blob) {
            bridge.send(await data.arrayBuffer())
            return
          }
          if (data instanceof ArrayBuffer) {
            bridge.send(data)
          }
        },
        onClose() {
          bridge?.close()
        },
      }
    }),
  )

  app.all('/*', async (c) => {
    const cookieHeader = c.req.header('cookie')
    const sessionId = readPreviewCookie(cookieHeader)
    const session = sessionId ? store.getSession(sessionId) : undefined
    if (!session) {
      return htmlResponse(401, 'Preview session expired. Reopen it from OpenCode Manager.')
    }

    const url = new URL(c.req.url)
    const targetHost = session.host === '::1' ? '[::1]' : 'localhost'
    const target = `http://${targetHost}:${session.port}${url.pathname}${url.search}`

    const hasBody = c.req.method !== 'GET' && c.req.method !== 'HEAD'

    const headers = filterProxyHeaders(c.req.raw.headers)
    const contentEncoding = hasBody ? c.req.header('content-encoding') : undefined
    if (contentEncoding) {
      headers['content-encoding'] = contentEncoding
    }
    headers['host'] = `localhost:${session.port}`
    const strippedCookies = stripManagerCookies(cookieHeader)
    if (strippedCookies) {
      headers['cookie'] = strippedCookies
    } else {
      delete headers['cookie']
    }
    headers['x-forwarded-host'] = c.req.header('host') ?? ''
    headers['x-forwarded-proto'] = c.req.header('x-forwarded-proto') ?? url.protocol.replace(':', '')

    try {
      const upstreamResponse = await fetchFn(target, {
        method: c.req.method,
        headers,
        body: hasBody ? c.req.raw.body : undefined,
        redirect: 'manual',
        duplex: 'half',
      })

      const responseHeaders = buildProxyResponseHeaders(upstreamResponse.headers)
      const location = responseHeaders.get('location')
      if (location) {
        const rewritten = rewriteLocalLocation(location, session.port)
        if (rewritten) responseHeaders.set('location', rewritten)
      }

      return new Response(upstreamResponse.body, {
        status: upstreamResponse.status,
        statusText: upstreamResponse.statusText,
        headers: responseHeaders,
      })
    } catch {
      return htmlResponse(502, `Preview request failed: cannot reach port ${session.port}.`)
    }
  })

  return { app, injectWebSocket }
}
