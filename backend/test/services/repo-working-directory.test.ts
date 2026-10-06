import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { Database } from 'bun:sqlite'
import { migrate } from '../../src/db/migration-runner'
import { allMigrations } from '../../src/db/migrations'
import { createRepo } from '../../src/db/queries'
import { findSiblingByDirectory, getSiblingRepos, resolveRepoWorkingDirectory } from '../../src/services/repo'
import type { Repo } from '@opencode-manager/shared/types'

const { executeCommand, resolveProjectId, getSettings } = vi.hoisted(() => ({
  executeCommand: vi.fn(),
  resolveProjectId: vi.fn(),
  getSettings: vi.fn(),
}))

vi.mock('../../src/utils/process', () => ({ executeCommand }))
vi.mock('../../src/services/project-id-resolver', () => ({ resolveProjectId, isGitMainCheckout: vi.fn() }))
vi.mock('../../src/services/settings', () => ({
  SettingsService: vi.fn().mockImplementation(() => ({ getSettings })),
}))

describe('resolveRepoWorkingDirectory', () => {
  let root: string
  let repoPath: string
  let siblingPath: string
  let unrelatedPath: string
  let repoLinkPath: string
  let siblingLinkPath: string

  beforeAll(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'ocm-repo-working-directory-'))
    repoPath = path.join(root, 'repo')
    siblingPath = path.join(root, 'sibling')
    unrelatedPath = path.join(root, 'unrelated')
    repoLinkPath = path.join(root, 'repo-link')
    siblingLinkPath = path.join(root, 'sibling-link')

    fs.mkdirSync(repoPath)
    fs.mkdirSync(siblingPath)
    fs.mkdirSync(unrelatedPath)
    fs.symlinkSync(repoPath, repoLinkPath, 'dir')
    fs.symlinkSync(siblingPath, siblingLinkPath, 'dir')
  })

  afterAll(() => {
    fs.rmSync(root, { recursive: true, force: true })
  })

  function createRepo(): Repo {
    return { fullPath: repoPath } as Repo
  }

  it('returns the repo path when no directory is given', async () => {
    expect(await resolveRepoWorkingDirectory(createRepo(), undefined, async () => [])).toBe(repoPath)
  })

  it('returns the repo path for the repo directory itself', async () => {
    expect(await resolveRepoWorkingDirectory(createRepo(), repoPath, async () => [])).toBe(repoPath)
  })

  it('returns the repo path for a symlinked equivalent of the repo directory', async () => {
    expect(await resolveRepoWorkingDirectory(createRepo(), repoLinkPath, async () => [])).toBe(repoPath)
  })

  it('returns a matching sibling path', async () => {
    const siblings = [{ fullPath: siblingPath }]
    expect(await resolveRepoWorkingDirectory(createRepo(), siblingPath, async () => siblings)).toBe(siblingPath)
  })

  it('matches a sibling through a symlinked directory', async () => {
    const siblings = [{ fullPath: siblingPath }]
    expect(await resolveRepoWorkingDirectory(createRepo(), siblingLinkPath, async () => siblings)).toBe(siblingPath)
  })

  it('returns null for an unrelated directory', async () => {
    const siblings = [{ fullPath: siblingPath }]
    expect(await resolveRepoWorkingDirectory(createRepo(), unrelatedPath, async () => siblings)).toBeNull()
  })
})

describe('findSiblingByDirectory', () => {
  let root: string
  let siblingPath: string
  let siblingLinkPath: string

  beforeAll(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'ocm-find-sibling-'))
    siblingPath = path.join(root, 'sibling')
    siblingLinkPath = path.join(root, 'sibling-link')
    fs.mkdirSync(siblingPath)
    fs.symlinkSync(siblingPath, siblingLinkPath, 'dir')
  })

  afterAll(() => {
    fs.rmSync(root, { recursive: true, force: true })
  })

  it('returns the sibling whose canonical path matches', () => {
    const sibling = { fullPath: siblingPath, id: 1 }
    expect(findSiblingByDirectory([sibling], siblingPath)).toBe(sibling)
  })

  it('matches through a symlinked directory', () => {
    const sibling = { fullPath: siblingPath, id: 1 }
    expect(findSiblingByDirectory([sibling], siblingLinkPath)).toBe(sibling)
  })

  it('returns undefined when no sibling matches', () => {
    const sibling = { fullPath: siblingPath, id: 1 }
    expect(findSiblingByDirectory([sibling], path.join(root, 'missing'))).toBeUndefined()
  })
})

describe('getSiblingRepos branch resolution', () => {
  let db: Database

  beforeEach(() => {
    db = new Database(':memory:')
    migrate(db, allMigrations)
    getSettings.mockReturnValue({ preferences: { repoOrder: [] }, updatedAt: Date.now() })
    resolveProjectId.mockResolvedValue('project-1')
    executeCommand.mockReset()
  })

  afterEach(() => {
    db.close()
  })

  function seedRepo(): Repo {
    return createRepo(db, {
      localPath: 'repo-a',
      defaultBranch: 'main',
      cloneStatus: 'ready',
      clonedAt: Date.now(),
      isLocal: true,
    })
  }

  it('skips branch resolution when includeBranch is false', async () => {
    const repo = seedRepo()

    const siblings = await getSiblingRepos(db, repo.id, {}, undefined, { includeBranch: false })

    expect(siblings).toHaveLength(1)
    expect(siblings[0]?.currentBranch).toBeUndefined()
    expect(executeCommand.mock.calls.map(([args]) => args)).toEqual([['git', '-C', repo.fullPath, 'worktree', 'list', '--porcelain']])
  })

  it('resolves the branch when includeBranch is true', async () => {
    const repo = seedRepo()
    executeCommand.mockResolvedValue('feature-branch\n')

    const siblings = await getSiblingRepos(db, repo.id, {})

    expect(siblings).toHaveLength(1)
    expect(siblings[0]?.currentBranch).toBe('feature-branch')
    expect(executeCommand).toHaveBeenCalled()
  })
})
