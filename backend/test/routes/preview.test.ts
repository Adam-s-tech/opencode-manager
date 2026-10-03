import { describe, it, expect, afterEach } from 'vitest'
import { mkdtemp, mkdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ENV } from '@opencode-manager/shared/config/env'
import { createPreviewRoutes } from '../../src/routes/preview'
import { PreviewSessionStore } from '../../src/services/preview/gateway'
import type { PreviewPortEntry } from '../../src/services/preview/ports'

function entry(overrides: Partial<PreviewPortEntry>): PreviewPortEntry {
  return { port: 5173, host: '127.0.0.1', pid: 1, command: 'node', cwd: null, ...overrides }
}

const tempDirs: string[] = []

async function makeTempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'ocm-preview-'))
  tempDirs.push(dir)
  return dir
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

describe('Preview Routes', () => {
  it('lists the directory-matching port first', async () => {
    const root = await makeTempDir()
    const appDir = join(root, 'app')
    await mkdir(appDir)

    const app = createPreviewRoutes({
      enabled: true,
      listPorts: async () => [
        entry({ port: 9000, cwd: '/somewhere/else' }),
        entry({ port: 5173, cwd: appDir }),
      ],
    })

    const res = await app.request(`/ports?directory=${encodeURIComponent(root)}`)

    expect(res.status).toBe(200)
    const body = await res.json() as { enabled: boolean; ports: PreviewPortEntry[] }
    expect(body.enabled).toBe(true)
    expect(body.ports.map((port) => port.port)).toEqual([5173, 9000])
  })

  it('sorts by port when no directory is given', async () => {
    const app = createPreviewRoutes({
      enabled: true,
      listPorts: async () => [entry({ port: 9000 }), entry({ port: 5173 })],
    })

    const res = await app.request('/ports')
    const body = await res.json() as { ports: PreviewPortEntry[] }

    expect(body.ports.map((port) => port.port)).toEqual([5173, 9000])
  })

  it('reports preview as disabled when the port is zero', async () => {
    const app = createPreviewRoutes({ enabled: false, listPorts: async () => [] })

    const res = await app.request('/ports')

    expect(await res.json()).toEqual({ enabled: false, ports: [] })
  })

  it('issues a preview start token for a listening port', async () => {
    const store = new PreviewSessionStore()
    const app = createPreviewRoutes({ enabled: true, listPorts: async () => [entry({ port: 5173 })], store })

    const res = await app.request('/sessions', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ port: 5173 }),
    })

    expect(res.status).toBe(200)
    const body = await res.json() as { token: string; previewPort: number; publicUrl: string | null }
    expect(typeof body.token).toBe('string')
    expect(body.token.length).toBeGreaterThan(0)
    expect(body.previewPort).toBe(ENV.PREVIEW.PORT)
    expect(body.publicUrl).toBe(ENV.PREVIEW.PUBLIC_URL || null)
  })

  it('rejects a reserved port with 400', async () => {
    const app = createPreviewRoutes({ enabled: true, listPorts: async () => [entry({ port: ENV.PREVIEW.PORT })] })

    const res = await app.request('/sessions', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ port: ENV.PREVIEW.PORT }),
    })

    expect(res.status).toBe(400)
  })

  it('returns 404 for a port that is not listening', async () => {
    const app = createPreviewRoutes({ enabled: true, listPorts: async () => [entry({ port: 5173 })] })

    const res = await app.request('/sessions', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ port: 6000 }),
    })

    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'Port 6000 is not listening' })
  })

  it('returns 503 when preview is disabled', async () => {
    const app = createPreviewRoutes({ enabled: false, listPorts: async () => [entry({ port: 5173 })] })

    const res = await app.request('/sessions', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ port: 5173 }),
    })

    expect(res.status).toBe(503)
  })

  it('rejects an out-of-range port with 400', async () => {
    const app = createPreviewRoutes({ enabled: true, listPorts: async () => [] })

    const res = await app.request('/sessions', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ port: 80 }),
    })

    expect(res.status).toBe(400)
  })
})
