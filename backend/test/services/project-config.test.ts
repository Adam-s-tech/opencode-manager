import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from 'vitest'
import { Database } from 'bun:sqlite'
import { execSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { migrate } from '../../src/db/migration-runner'
import { allMigrations } from '../../src/db/migrations'
import { createRepo, setRepoSetting } from '../../src/db/queries'
import { createGitService } from '../../src/services/git/GitService'
import { ProjectConfigService, ProjectConfigError } from '../../src/services/project-config'
import type { GitAuthService } from '../../src/services/git-auth'
import type { ProjectAction } from '@opencode-manager/shared/schemas'
import type { Repo } from '@opencode-manager/shared/types'

const gitAuthService = { getGitEnvironment: () => ({}) } as unknown as GitAuthService

function createService(db: Database): ProjectConfigService {
  return new ProjectConfigService(db, createGitService(db, gitAuthService), gitAuthService)
}

function createAction(overrides: Partial<ProjectAction> = {}): ProjectAction {
  return { id: 'serve', name: 'Serve', command: 'pnpm dev', autoOpenUrl: false, ...overrides }
}

describe('ProjectConfigService personal settings', () => {
  let db: Database
  let service: ProjectConfigService
  let repo: Repo

  beforeEach(() => {
    db = new Database(':memory:')
    migrate(db, allMigrations)
    service = createService(db)
    repo = createRepo(db, { localPath: 'repo-a', defaultBranch: 'main', cloneStatus: 'ready', clonedAt: Date.now(), isLocal: true })
  })

  afterEach(() => {
    db.close()
  })

  it('round-trips personal actions', () => {
    const actions = [createAction(), createAction({ id: 'test', name: 'Test', command: 'pnpm test' })]

    service.setPersonalActions(repo, actions)

    expect(service.getPersonalActions(repo)).toEqual(actions)
  })

  it('returns personal actions through getConfig with the personal source', async () => {
    service.setPersonalActions(repo, [createAction()])

    const config = await service.getConfig(repo, repo.fullPath)

    expect(config.actions).toEqual([{ ...createAction(), source: 'personal' }])
    expect(config.repoFile).toEqual({
      path: '.ocm/project.json',
      exists: false,
      trusted: false,
      hash: null,
      warnings: [],
    })
  })

  it('round-trips personal setup commands through getConfig', async () => {
    service.setPersonalSetup(repo, ['pnpm install', 'pnpm build'])

    expect(service.getPersonalSetup(repo)).toEqual(['pnpm install', 'pnpm build'])

    const config = await service.getConfig(repo, repo.fullPath)
    expect(config.worktreeSetup).toEqual([
      { command: 'pnpm install', source: 'personal' },
      { command: 'pnpm build', source: 'personal' },
    ])
  })

  it('rejects duplicate action ids', () => {
    let caught: unknown
    try {
      service.setPersonalActions(repo, [createAction(), createAction({ name: 'Other' })])
    } catch (error: unknown) {
      caught = error
    }

    expect(caught).toBeInstanceOf(ProjectConfigError)
    expect((caught as ProjectConfigError).status).toBe(400)
    expect((caught as ProjectConfigError).message).toBe('Duplicate action id')
  })

  it('reads corrupt stored action JSON as an empty list', () => {
    setRepoSetting(db, repo.id, 'projectActions', '{not json')

    expect(service.getPersonalActions(repo)).toEqual([])
  })

  it('reads wrongly shaped stored action JSON as an empty list', () => {
    setRepoSetting(db, repo.id, 'projectActions', JSON.stringify({ id: 'serve' }))

    expect(service.getPersonalActions(repo)).toEqual([])
  })

  it('reads corrupt stored setup JSON as an empty list', () => {
    setRepoSetting(db, repo.id, 'worktreeSetupCommands', 'not-json')

    expect(service.getPersonalSetup(repo)).toEqual([])
  })
})

describe('ProjectConfigService worktree resolution', () => {
  let db: Database
  let service: ProjectConfigService
  let basePath: string
  let worktreePath: string
  let root: string
  let baseRepo: Repo
  let worktreeRepo: Repo

  beforeAll(() => {
    root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ocm-project-config-')))
    basePath = path.join(root, 'base')
    worktreePath = path.join(root, 'linked worktree')

    execSync(`git init "${basePath}"`)
    execSync(`git -C "${basePath}" config user.email test@test.com`)
    execSync(`git -C "${basePath}" config user.name Test`)
    execSync(`git -C "${basePath}" commit --allow-empty -m "Initial commit"`)
    execSync(`git -C "${basePath}" worktree add -b feature "${worktreePath}"`)
  })

  afterAll(() => {
    fs.rmSync(root, { recursive: true, force: true })
  })

  beforeEach(() => {
    db = new Database(':memory:')
    migrate(db, allMigrations)
    service = createService(db)
    baseRepo = createRepo(db, {
      localPath: basePath,
      sourcePath: basePath,
      defaultBranch: 'main',
      cloneStatus: 'ready',
      clonedAt: Date.now(),
      isLocal: true,
    })
    worktreeRepo = createRepo(db, {
      localPath: worktreePath,
      sourcePath: worktreePath,
      defaultBranch: 'main',
      cloneStatus: 'ready',
      clonedAt: Date.now(),
      isLocal: true,
      isWorktree: true,
    })
  })

  afterEach(() => {
    db.close()
  })

  it('resolves the main checkout from both the base and the linked worktree', async () => {
    const git = createGitService(db, gitAuthService)

    expect(fs.realpathSync(await git.getMainCheckoutPath(basePath))).toBe(fs.realpathSync(basePath))
    expect(fs.realpathSync(await git.getMainCheckoutPath(worktreePath))).toBe(fs.realpathSync(basePath))
  })

  it('resolves a linked worktree repo to the main checkout row', async () => {
    const resolved = await service.resolveProjectRepo(worktreeRepo)

    expect(resolved.id).toBe(baseRepo.id)
  })

  it('keeps a non-worktree repo unchanged', async () => {
    const resolved = await service.resolveProjectRepo(baseRepo)

    expect(resolved.id).toBe(baseRepo.id)
  })

  it('returns personal actions saved on the base repo when resolving from the worktree', async () => {
    service.setPersonalActions(baseRepo, [createAction()])

    const config = await service.getConfig(worktreeRepo, worktreePath)

    expect(config.actions).toEqual([{ ...createAction(), source: 'personal' }])
  })

  it('returns personal setup saved on the base repo when resolving from the worktree', async () => {
    service.setPersonalSetup(baseRepo, ['pnpm install'])

    const config = await service.getConfig(worktreeRepo, worktreePath)

    expect(config.worktreeSetup).toEqual([{ command: 'pnpm install', source: 'personal' }])
  })
})
