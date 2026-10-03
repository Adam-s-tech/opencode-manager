import { describe, it, expect, vi } from 'vitest'
import { TerminalService, TerminalNotFoundError } from '../../src/services/terminal'
import type { OpenCodeClient } from '../../src/services/opencode/client'
import type { CredentialProvider } from '../../src/services/credential-provider'

interface PtyRecord {
  id: string
  title: string
  command: string
  args: string[]
  cwd: string
  status: 'running' | 'exited'
  pid: number
  exitCode?: number
}

function createPty(overrides: Partial<PtyRecord> = {}): PtyRecord {
  return { id: 'pty-1', title: 'Terminal', command: 'sh', args: [], cwd: '/repo', status: 'running', pid: 1, ...overrides }
}

function createClient(pty: Record<string, unknown>): OpenCodeClient {
  return { api: { pty } } as unknown as OpenCodeClient
}

function createCredentialProvider(shellEnv: Record<string, string> = {}): CredentialProvider {
  return { getShellEnv: vi.fn(() => shellEnv) } as unknown as CredentialProvider
}

function createTerminalService(
  client: OpenCodeClient,
  provider: CredentialProvider,
  openSocket?: (url: string) => WebSocket,
): TerminalService {
  return new TerminalService(client, provider, () => 'http://127.0.0.1:5551', openSocket)
}

class FakeUpstreamSocket {
  binaryType: 'blob' | 'arraybuffer' = 'blob'
  readonly sent: Array<string | Uint8Array> = []
  readonly url: string
  close = vi.fn()
  private readonly listeners = new Map<string, Set<(event: unknown) => void>>()

  constructor(url: string) {
    this.url = url
  }

  addEventListener(type: string, listener: (event: unknown) => void): void {
    const set = this.listeners.get(type) ?? new Set<(event: unknown) => void>()
    set.add(listener)
    this.listeners.set(type, set)
  }

  send(data: string | Uint8Array): void {
    this.sent.push(data)
  }

  emit(type: string, event: unknown): void {
    for (const listener of this.listeners.get(type) ?? []) listener(event)
  }
}

interface FakePeer {
  sent: Array<string | Uint8Array>
  closeCalls: Array<{ code?: number; reason?: string }>
  send(data: string | Uint8Array): void
  close(code?: number, reason?: string): void
}

function createPeer(): FakePeer {
  const sent: Array<string | Uint8Array> = []
  const closeCalls: Array<{ code?: number; reason?: string }> = []
  return {
    sent,
    closeCalls,
    send(data) {
      sent.push(data)
    },
    close(code, reason) {
      closeCalls.push({ code, reason })
    },
  }
}

describe('TerminalService', () => {
  describe('list', () => {
    it('passes the location and decodes each terminal title', async () => {
      const list = vi.fn(async () => ({
        location: { directory: '/repo' },
        data: [
          createPty({ id: 'a', title: 'Terminal' }),
          createPty({ id: 'b', title: 'ocm:setup:Worktree setup' }),
          createPty({ id: 'c', title: 'ocm:action:build:Build', status: 'exited', exitCode: 0 }),
        ],
      }))
      const service = createTerminalService(createClient({ list }), createCredentialProvider())

      const result = await service.list('/repo')

      expect(list).toHaveBeenCalledWith({ location: { directory: '/repo' } })
      expect(result).toEqual([
        { id: 'a', title: 'Terminal', kind: 'shell', cwd: '/repo', status: 'running' },
        { id: 'b', title: 'Worktree setup', kind: 'setup', cwd: '/repo', status: 'running' },
        { id: 'c', title: 'Build', kind: 'action', actionId: 'build', cwd: '/repo', status: 'exited', exitCode: 0 },
      ])
    })
  })

  describe('create', () => {
    it('sends the location, encoded title and merged environment', async () => {
      const create = vi.fn(async () => ({
        location: { directory: '/repo' },
        data: createPty({ id: 'pty-new', title: 'ocm:action:dev:Dev server' }),
      }))
      const credentialProvider = createCredentialProvider({ GH_TOKEN: 'gh' })
      const service = createTerminalService(createClient({ create }), credentialProvider)

      const result = await service.create('/repo', {
        kind: 'action',
        actionId: 'dev',
        name: 'Dev server',
        command: '/bin/sh',
        args: ['-c', 'npm run dev'],
        env: { FOO: 'bar' },
      })

      expect(credentialProvider.getShellEnv).toHaveBeenCalledWith({ cwd: '/repo' })
      expect(create).toHaveBeenCalledWith({
        location: { directory: '/repo' },
        title: 'ocm:action:dev:Dev server',
        command: '/bin/sh',
        args: ['-c', 'npm run dev'],
        env: { GH_TOKEN: 'gh', FOO: 'bar' },
      })
      expect(result).toEqual({
        id: 'pty-new',
        title: 'Dev server',
        kind: 'action',
        actionId: 'dev',
        cwd: '/repo',
        status: 'running',
      })
    })

    it('omits command and args for a plain shell', async () => {
      let captured: Record<string, unknown> | undefined
      const create = vi.fn(async (input: Record<string, unknown>) => {
        captured = input
        return {
          location: { directory: '/repo' },
          data: createPty({ id: 'pty-1', title: 'Terminal' }),
        }
      })
      const service = createTerminalService(createClient({ create }), createCredentialProvider())

      await service.create('/repo', { kind: 'shell', name: 'Terminal' })

      expect(captured).toMatchObject({ title: 'Terminal' })
      expect(captured).not.toHaveProperty('command')
      expect(captured).not.toHaveProperty('args')
      expect(captured?.env).toEqual({})
    })
  })

  describe('requireTerminal', () => {
    it('returns the terminal when the id exists in the directory', async () => {
      const list = vi.fn(async () => ({
        location: { directory: '/repo' },
        data: [createPty({ id: 'pty-1' })],
      }))
      const service = createTerminalService(createClient({ list }), createCredentialProvider())

      await expect(service.requireTerminal('/repo', 'pty-1')).resolves.toMatchObject({ id: 'pty-1' })
    })

    it('rejects a PTY id from another directory', async () => {
      const list = vi.fn(async ({ location }: { location: { directory: string } }) => ({
        location: { directory: location.directory },
        data: location.directory === '/repo' ? [createPty({ id: 'pty-1' })] : [],
      }))
      const service = createTerminalService(createClient({ list }), createCredentialProvider())

      await expect(service.requireTerminal('/other', 'pty-1')).rejects.toBeInstanceOf(TerminalNotFoundError)
    })
  })

  describe('resize', () => {
    it('updates the terminal size with the location', async () => {
      const update = vi.fn(async () => ({ location: { directory: '/repo' }, data: createPty() }))
      const service = createTerminalService(createClient({ update }), createCredentialProvider())

      await service.resize('/repo', 'pty-1', { cols: 120, rows: 40 })

      expect(update).toHaveBeenCalledWith({ ptyID: 'pty-1', location: { directory: '/repo' }, size: { cols: 120, rows: 40 } })
    })
  })

  describe('remove', () => {
    it('removes the terminal with the location', async () => {
      const remove = vi.fn(async () => undefined)
      const service = createTerminalService(createClient({ remove }), createCredentialProvider())

      await service.remove('/repo', 'pty-1')

      expect(remove).toHaveBeenCalledWith({ ptyID: 'pty-1', location: { directory: '/repo' } })
    })
  })

  describe('removeAll', () => {
    it('removes every terminal and tolerates a 404', async () => {
      const list = vi.fn(async () => ({
        location: { directory: '/repo' },
        data: [createPty({ id: 'a' }), createPty({ id: 'b' })],
      }))
      const notFound = Object.assign(new Error('not found'), { _tag: 'PtyNotFoundError' })
      const remove = vi.fn(async ({ ptyID }: { ptyID: string }) => {
        if (ptyID === 'a') throw notFound
      })
      const service = createTerminalService(createClient({ list, remove }), createCredentialProvider())

      await expect(service.removeAll('/repo')).resolves.toBeUndefined()
      expect(remove).toHaveBeenCalledTimes(2)
      expect(remove).toHaveBeenCalledWith({ ptyID: 'a', location: { directory: '/repo' } })
      expect(remove).toHaveBeenCalledWith({ ptyID: 'b', location: { directory: '/repo' } })
    })

    it('propagates a non-404 removal failure', async () => {
      const list = vi.fn(async () => ({
        location: { directory: '/repo' },
        data: [createPty({ id: 'a' })],
      }))
      const remove = vi.fn(async () => {
        throw new Error('boom')
      })
      const service = createTerminalService(createClient({ list, remove }), createCredentialProvider())

      await expect(service.removeAll('/repo')).rejects.toThrow('boom')
    })
  })

  describe('connect', () => {
    function createConnectClient(options: { ticket?: string; terminals?: PtyRecord[] } = {}) {
      const list = vi.fn(async ({ location }: { location: { directory: string } }) => ({
        location,
        data: options.terminals ?? [createPty({ id: 'pty-1' })],
      }))
      const token = vi.fn(async () => ({
        location: { directory: '/repo' },
        data: { ticket: options.ticket ?? 'ticket-abc', expires_in: 60 },
      }))
      return { client: { api: { pty: { list, connect: { token } } } } as unknown as OpenCodeClient, list, token }
    }

    it('resolves the terminal, requests a ticket, and bridges the upstream socket', async () => {
      const { client, list, token } = createConnectClient()
      let opened: FakeUpstreamSocket | undefined
      const service = createTerminalService(client, createCredentialProvider(), (url) => {
        opened = new FakeUpstreamSocket(url)
        return opened as unknown as WebSocket
      })
      const peer = createPeer()

      const bridge = await service.connect('/repo', 'pty-1', 12, peer)

      expect(list).toHaveBeenCalledWith({ location: { directory: '/repo' } })
      expect(token).toHaveBeenCalledWith({
        ptyID: 'pty-1',
        location: { directory: '/repo' },
        'x-opencode-ticket': '1',
      })

      expect(opened).toBeDefined()
      const url = new URL(opened!.url)
      expect(url.protocol).toBe('ws:')
      expect(url.pathname).toBe('/api/pty/pty-1/connect')
      expect(url.searchParams.get('ticket')).toBe('ticket-abc')
      expect(url.searchParams.get('location[directory]')).toBe('/repo')
      expect(url.searchParams.get('cursor')).toBe('12')

      opened!.emit('open', {})
      bridge.send('hello')
      expect(opened!.sent).toEqual(['hello'])

      opened!.emit('message', { data: new Uint8Array([7]).buffer })
      expect(peer.sent).toEqual([new Uint8Array([7])])
    })

    it('omits the cursor parameter when no cursor is provided', async () => {
      const { client } = createConnectClient()
      let opened: FakeUpstreamSocket | undefined
      const service = createTerminalService(client, createCredentialProvider(), (url) => {
        opened = new FakeUpstreamSocket(url)
        return opened as unknown as WebSocket
      })

      await service.connect('/repo', 'pty-1', undefined, createPeer())

      const url = new URL(opened!.url)
      expect(url.searchParams.has('cursor')).toBe(false)
    })

    it('rejects an unknown terminal before requesting a ticket', async () => {
      const { client, token } = createConnectClient({ terminals: [] })
      const service = createTerminalService(client, createCredentialProvider())

      await expect(service.connect('/repo', 'missing', undefined, createPeer())).rejects.toBeInstanceOf(TerminalNotFoundError)
      expect(token).not.toHaveBeenCalled()
    })
  })
})
