import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { Hono } from 'hono'
import { Database } from 'bun:sqlite'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { migrate } from '../../src/db/migration-runner'
import { allMigrations } from '../../src/db/migrations'
import { createRepo } from '../../src/db/queries'
import { createRepoProjectConfigRoutes } from '../../src/routes/repo-project-config'
import { ProjectConfigService } from '../../src/services/project-config'
import { createGitService } from '../../src/services/git/GitService'
import { createStubOpenCodeClient } from '../helpers/stub-opencode-client'
import type { GitAuthService } from '../../src/services/git-auth'
import type { TerminalService } from '../../src/services/terminal'

vi.mock('../../src/services/repo', () => ({
  resolveRepoWorkingDirectory: vi.fn(),
  getSiblingRepos: vi.fn(),
}))

import { resolveRepoWorkingDirectory, getSiblingRepos } from '../../src/services/repo'

const gitAuthService = { getGitEnvironment: () => ({}) } as unknown as GitAuthService
const openCodeClient = createStubOpenCodeClient()
const terminalService = {} as unknown as TerminalService
const jsonHeaders = { 'Content-Type': 'application/json' }

function createApp(db: Database): Hono {
  const service = new ProjectConfigService(db, createGitService(db, gitAuthService), gitAuthService)
  const app = new Hono()
  app.route('/', createRepoProjectConfigRoutes(db, gitAuthService, openCodeClient, service, terminalService))
  return app
}

function createTestDb(): Database {
  const db = new Database(':memory:')
  migrate(db, allMigrations)
  return db
}

function seedRepo(db: Database): void {
  createRepo(db, { localPath: 'repo-a', defaultBranch: 'main', cloneStatus: 'ready', clonedAt: Date.now(), isLocal: true })
}

describe('Repo Project Config Routes', () => {
  let db: Database
  let app: Hono

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getSiblingRepos).mockResolvedValue([])
    vi.mocked(resolveRepoWorkingDirectory).mockImplementation(async (repo, directory) => {
      if (directory === undefined || directory === repo.fullPath) return repo.fullPath
      return null
    })
    db = createTestDb()
    app = createApp(db)
  })

  afterEach(() => {
    db.close()
  })

  it('returns personal config for a ready repo', async () => {
    seedRepo(db)

    const res = await app.request('/1/project-config')

    expect(res.status).toBe(200)
    const body = await res.json() as { actions: unknown[]; worktreeSetup: unknown[]; repoFile: unknown }
    expect(body.actions).toEqual([])
    expect(body.worktreeSetup).toEqual([])
    expect(body.repoFile).toEqual({
      path: '.ocm/project.json',
      exists: false,
      trusted: false,
      hash: null,
      warnings: [],
    })
  })

  it('returns 404 for an unknown repo', async () => {
    const res = await app.request('/999/project-config')

    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'Repo not found' })
  })

  it('returns 404 for a repo that is not ready', async () => {
    createRepo(db, { localPath: 'repo-cloning', defaultBranch: 'main', cloneStatus: 'cloning', clonedAt: Date.now(), isLocal: true })

    const res = await app.request('/1/project-config')

    expect(res.status).toBe(404)
  })

  it('returns 400 for a non-numeric repo id', async () => {
    const res = await app.request('/abc/project-config')

    expect(res.status).toBe(400)
  })

  it('round-trips personal actions with the personal source', async () => {
    seedRepo(db)
    const action = { id: 'serve', name: 'Serve', command: 'pnpm dev', autoOpenUrl: false }

    const put = await app.request('/1/project-config/actions', {
      method: 'PUT',
      headers: jsonHeaders,
      body: JSON.stringify({ actions: [action] }),
    })
    expect(put.status).toBe(200)
    expect((await put.json() as { actions: unknown[] }).actions).toEqual([{ ...action, source: 'personal' }])

    const get = await app.request('/1/project-config')
    expect(get.status).toBe(200)
    expect((await get.json() as { actions: unknown[] }).actions).toEqual([{ ...action, source: 'personal' }])
  })

  it('round-trips personal worktree setup commands', async () => {
    seedRepo(db)

    const put = await app.request('/1/project-config/worktree-setup', {
      method: 'PUT',
      headers: jsonHeaders,
      body: JSON.stringify({ commands: ['pnpm install', 'pnpm build'] }),
    })
    expect(put.status).toBe(200)
    expect((await put.json() as { worktreeSetup: unknown[] }).worktreeSetup).toEqual([
      { command: 'pnpm install', source: 'personal' },
      { command: 'pnpm build', source: 'personal' },
    ])

    const get = await app.request('/1/project-config')
    expect((await get.json() as { worktreeSetup: unknown[] }).worktreeSetup).toEqual([
      { command: 'pnpm install', source: 'personal' },
      { command: 'pnpm build', source: 'personal' },
    ])
  })

  it('returns 400 for schema violations on actions', async () => {
    seedRepo(db)

    const bodies = [
      '{}',
      JSON.stringify({ actions: 'nope' }),
      JSON.stringify({ actions: [{ id: 'has space', name: 'Serve', command: 'pnpm dev' }] }),
      JSON.stringify({ actions: [{ id: 'serve', name: '', command: 'pnpm dev' }] }),
      JSON.stringify({ actions: [{ id: 'serve', name: 'Serve', command: 'pnpm dev', icon: 'unknown' }] }),
    ]

    for (const body of bodies) {
      const res = await app.request('/1/project-config/actions', { method: 'PUT', headers: jsonHeaders, body })
      expect(res.status).toBe(400)
    }
  })

  it('returns 400 for schema violations on worktree setup', async () => {
    seedRepo(db)

    const bodies = ['{}', JSON.stringify({ commands: 'nope' }), JSON.stringify({ commands: [''] })]

    for (const body of bodies) {
      const res = await app.request('/1/project-config/worktree-setup', { method: 'PUT', headers: jsonHeaders, body })
      expect(res.status).toBe(400)
    }
  })

  it('returns 400 for a foreign directory', async () => {
    seedRepo(db)

    const res = await app.request('/1/project-config?directory=/tmp/other')

    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'Directory is not part of this repository' })
  })

  it('returns 400 for an invalid trust request', async () => {
    seedRepo(db)

    const res = await app.request('/1/project-config/trust', {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify({ hash: 'not-a-hash' }),
    })

    expect(res.status).toBe(400)
  })

  it('returns 409 when trusting a stale hash', async () => {
    seedRepo(db)

    const res = await app.request('/1/project-config/trust', {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify({ hash: 'a'.repeat(64) }),
    })

    expect(res.status).toBe(409)
    expect((await res.json() as { code: string }).code).toBe('REPO_CONFIG_CHANGED')
  })

  it('returns 400 for an invalid move request', async () => {
    seedRepo(db)

    const res = await app.request('/1/project-config/move', {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify({ kind: 'action', id: 'serve', to: 'nowhere' }),
    })

    expect(res.status).toBe(400)
  })

  it('returns 404 when moving an unknown item', async () => {
    seedRepo(db)

    const res = await app.request('/1/project-config/move', {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify({ kind: 'action', id: 'missing', to: 'repo' }),
    })

    expect(res.status).toBe(404)
  })

  it('moves a personal action into the repo file and returns it as trusted', async () => {
    seedRepo(db)
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ocm-route-move-'))
    vi.mocked(resolveRepoWorkingDirectory).mockResolvedValue(directory)
    const action = { id: 'serve', name: 'Serve', command: 'pnpm dev', autoOpenUrl: false }

    try {
      await app.request('/1/project-config/actions', {
        method: 'PUT',
        headers: jsonHeaders,
        body: JSON.stringify({ actions: [action] }),
      })

      const res = await app.request('/1/project-config/move', {
        method: 'POST',
        headers: jsonHeaders,
        body: JSON.stringify({ kind: 'action', id: 'serve', to: 'repo' }),
      })

      expect(res.status).toBe(200)
      const body = await res.json() as { actions: unknown[]; repoFile: { exists: boolean; trusted: boolean } }
      expect(body.repoFile.exists).toBe(true)
      expect(body.repoFile.trusted).toBe(true)
      expect(body.actions).toEqual([{ ...action, source: 'repo' }])
    } finally {
      fs.rmSync(directory, { recursive: true, force: true })
    }
  })

  it('returns 409 when moving a setup command into a repository already at capacity', async () => {
    seedRepo(db)
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ocm-route-move-'))
    vi.mocked(resolveRepoWorkingDirectory).mockResolvedValue(directory)

    try {
      await app.request('/1/project-config/worktree-setup', {
        method: 'PUT',
        headers: jsonHeaders,
        body: JSON.stringify({ commands: ['personal-cmd'] }),
      })
      const repoFileDir = path.join(directory, '.ocm')
      fs.mkdirSync(repoFileDir, { recursive: true })
      fs.writeFileSync(
        path.join(repoFileDir, 'project.json'),
        JSON.stringify({ version: 1, setupWorktree: Array.from({ length: 20 }, (_, index) => `repo-${index}`) }),
      )

      const res = await app.request('/1/project-config/move', {
        method: 'POST',
        headers: jsonHeaders,
        body: JSON.stringify({ kind: 'setup', command: 'personal-cmd', to: 'repo' }),
      })

      expect(res.status).toBe(409)
      expect((await res.json() as { code: string }).code).toBe('PROJECT_CONFIG_LIMIT_EXCEEDED')
    } finally {
      fs.rmSync(directory, { recursive: true, force: true })
    }
  })
})
