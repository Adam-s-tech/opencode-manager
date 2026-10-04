import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Database } from 'bun:sqlite'
import type { Repo } from '@opencode-manager/shared/types'
import type { GitAuthService } from '../../src/services/git-auth'
import type { OpenCodeClient } from '../../src/services/opencode/client'
import type { ProjectConfigService } from '../../src/services/project-config'
import type { TerminalService } from '../../src/services/terminal'
import { RepoWorkspaceError } from '../../src/services/repo'
import { RepoWorkspaceService } from '../../src/services/repo-workspace'

const mocks = vi.hoisted(() => ({
  getSiblingRepos: vi.fn(),
  resolveRepoProjectId: vi.fn(),
  loggerWarn: vi.fn(),
}))

vi.mock('../../src/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: mocks.loggerWarn,
  },
}))

vi.mock('../../src/services/repo', () => {
  class MockRepoWorkspaceError extends Error {
    readonly status = 400

    constructor(message: string) {
      super(message)
      this.name = 'RepoWorkspaceError'
    }
  }

  return {
    getSiblingRepos: mocks.getSiblingRepos,
    resolveRepoProjectId: mocks.resolveRepoProjectId,
    findSiblingByDirectory: <T extends { fullPath: string }>(siblings: T[], directory: string): T | undefined =>
      siblings.find((sibling) => sibling.fullPath === directory),
    RepoWorkspaceError: MockRepoWorkspaceError,
  }
})

const REPO: Repo = {
  id: 1,
  localPath: 'repo-a',
  fullPath: '/repos/repo-a',
  defaultBranch: 'main',
  cloneStatus: 'ready',
  clonedAt: 0,
} as Repo

const gitAuthService = { getGitEnvironment: () => ({}) } as unknown as GitAuthService

function createService(overrides: {
  worktreeCreate?: ReturnType<typeof vi.fn>
  worktreeRemove?: ReturnType<typeof vi.fn>
  runWorktreeSetupForRepo?: ReturnType<typeof vi.fn>
  removeAll?: ReturnType<typeof vi.fn>
}) {
  const worktreeCreate = overrides.worktreeCreate ?? vi.fn(async () => ({ directory: '/worktrees/feature-x' }))
  const worktreeRemove = overrides.worktreeRemove ?? vi.fn(async () => undefined)
  const runWorktreeSetupForRepo =
    overrides.runWorktreeSetupForRepo ?? vi.fn(async () => ({ status: 'started' as const }))
  const removeAll = overrides.removeAll ?? vi.fn(async () => undefined)

  const openCodeClient = {
    api: { worktree: { create: worktreeCreate, remove: worktreeRemove } },
  } as unknown as OpenCodeClient
  const projectConfigService = { runWorktreeSetupForRepo } as unknown as ProjectConfigService
  const terminalService = { removeAll } as unknown as TerminalService

  return {
    service: new RepoWorkspaceService(
      {} as Database,
      openCodeClient,
      gitAuthService,
      projectConfigService,
      terminalService,
    ),
    worktreeCreate,
    worktreeRemove,
    runWorktreeSetupForRepo,
    removeAll,
    terminalService,
  }
}

describe('RepoWorkspaceService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.resolveRepoProjectId.mockResolvedValue('project-1')
    mocks.getSiblingRepos.mockResolvedValue([])
  })

  describe('create', () => {
    it('creates the worktree with projectID, name and branch and runs the setup', async () => {
      const worktreeCreate = vi.fn(async () => ({ directory: '/worktrees/feature-x', branch: 'feature/x' }))
      const runWorktreeSetupForRepo = vi.fn(async () => ({ status: 'started' as const }))
      const { service, terminalService } = createService({ worktreeCreate, runWorktreeSetupForRepo })

      const result = await service.create(REPO, { name: 'feature-x', ref: 'feature/x' })

      expect(worktreeCreate).toHaveBeenCalledWith({
        projectID: 'project-1',
        name: 'feature-x',
        branch: 'feature/x',
      })
      expect(runWorktreeSetupForRepo).toHaveBeenCalledWith(REPO, '/worktrees/feature-x', terminalService)
      expect(result).toEqual({
        directory: '/worktrees/feature-x',
        branch: 'feature/x',
        worktreeSetup: { status: 'started' },
      })
    })

    it('creates the worktree without optional options', async () => {
      const worktreeCreate = vi.fn(async () => ({ directory: '/worktrees/feature-x' }))
      const { service } = createService({ worktreeCreate })

      await service.create(REPO)

      expect(worktreeCreate).toHaveBeenCalledWith({ projectID: 'project-1' })
    })
  })

  describe('remove', () => {
    it('throws a 400 when the directory is not a worktree sibling and touches nothing', async () => {
      const worktreeRemove = vi.fn(async () => undefined)
      const removeAll = vi.fn(async () => undefined)
      mocks.getSiblingRepos.mockResolvedValue([{ fullPath: '/worktrees/other', worktreeStrategy: 'git' }])
      const { service } = createService({ worktreeRemove, removeAll })

      const error = await service.remove(REPO, '/worktrees/unknown').catch((caught: unknown) => caught)

      expect(error).toBeInstanceOf(RepoWorkspaceError)
      expect(error).toMatchObject({ status: 400 })
      expect(removeAll).not.toHaveBeenCalled()
      expect(worktreeRemove).not.toHaveBeenCalled()
    })

    it('removes terminals for the matched sibling before removing the worktree', async () => {
      const worktreeRemove = vi.fn(async () => undefined)
      const removeAll = vi.fn(async () => undefined)
      mocks.getSiblingRepos.mockResolvedValue([{ fullPath: '/worktrees/feature-x', worktreeStrategy: 'git' }])
      const { service } = createService({ worktreeRemove, removeAll })

      await service.remove(REPO, '/worktrees/feature-x')

      expect(removeAll).toHaveBeenCalledWith('/worktrees/feature-x')
      expect(worktreeRemove).toHaveBeenCalledWith({
        projectID: 'project-1',
        directory: '/worktrees/feature-x',
        force: true,
      })
      expect(removeAll.mock.invocationCallOrder[0]!).toBeLessThan(worktreeRemove.mock.invocationCallOrder[0]!)
    })

    it('logs a terminal removal failure and still removes the worktree', async () => {
      const worktreeRemove = vi.fn(async () => undefined)
      const removeAll = vi.fn(async () => {
        throw new Error('pty cleanup failed')
      })
      mocks.getSiblingRepos.mockResolvedValue([{ fullPath: '/worktrees/feature-x', worktreeStrategy: 'git' }])
      const { service } = createService({ worktreeRemove, removeAll })

      await expect(service.remove(REPO, '/worktrees/feature-x')).resolves.toBeUndefined()

      expect(mocks.loggerWarn).toHaveBeenCalled()
      expect(worktreeRemove).toHaveBeenCalledWith({
        projectID: 'project-1',
        directory: '/worktrees/feature-x',
        force: true,
      })
    })
  })

  describe('removeRepoTerminals', () => {
    it('removes terminals for the repo directory and each worktree sibling', async () => {
      const removeAll = vi.fn(async () => undefined)
      mocks.getSiblingRepos.mockResolvedValue([
        { fullPath: '/worktrees/a', worktreeStrategy: 'git' },
        { fullPath: '/worktrees/b', worktreeStrategy: 'git' },
        { fullPath: '/repos/manager-worktree', isWorktree: true },
      ])
      const { service } = createService({ removeAll })

      await service.removeRepoTerminals(REPO)

      expect(removeAll).toHaveBeenCalledWith('/repos/repo-a')
      expect(removeAll).toHaveBeenCalledWith('/worktrees/a')
      expect(removeAll).toHaveBeenCalledWith('/worktrees/b')
      expect(removeAll).not.toHaveBeenCalledWith('/repos/manager-worktree')
    })

    it('still removes the repo terminals when listing siblings fails', async () => {
      const removeAll = vi.fn(async () => undefined)
      mocks.getSiblingRepos.mockRejectedValue(new Error('siblings failed'))
      const { service } = createService({ removeAll })

      await expect(service.removeRepoTerminals(REPO)).resolves.toBeUndefined()

      expect(removeAll).toHaveBeenCalledWith('/repos/repo-a')
      expect(mocks.loggerWarn).toHaveBeenCalled()
    })
  })
})
