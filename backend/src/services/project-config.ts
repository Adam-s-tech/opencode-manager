import { z } from 'zod'
import type { Database } from 'bun:sqlite'
import type { Repo } from '@opencode-manager/shared/types'
import {
  ProjectActionSchema,
  WorktreeSetupCommandsSchema,
  type ProjectAction,
  type ProjectConfigResponse,
} from '@opencode-manager/shared/schemas'
import { getRepoByDirectory, getRepoSetting, setRepoSetting } from '../db/queries'
import type { GitService } from './git/GitService'
import type { GitAuthService } from './git-auth'

const PROJECT_ACTIONS_KEY = 'projectActions'
const WORKTREE_SETUP_KEY = 'worktreeSetupCommands'
const REPO_CONFIG_TRUST_KEY = 'repoConfigTrustHash'

export class ProjectConfigError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
    public details?: unknown,
  ) {
    super(message)
    this.name = 'ProjectConfigError'
  }
}

export class ProjectConfigService {
  constructor(
    private readonly database: Database,
    private readonly git: GitService,
    private readonly gitAuthService: GitAuthService,
  ) {}

  async resolveProjectRepo(repo: Repo): Promise<Repo> {
    if (!repo.isWorktree) {
      return repo
    }
    const mainCheckout = await this.git.getMainCheckoutPath(repo.fullPath)
    return getRepoByDirectory(this.database, mainCheckout) ?? repo
  }

  getPersonalActions(projectRepo: Repo): ProjectAction[] {
    return this.readStoredJson(projectRepo.id, PROJECT_ACTIONS_KEY, z.array(ProjectActionSchema)) ?? []
  }

  setPersonalActions(projectRepo: Repo, actions: ProjectAction[]): void {
    const ids = new Set<string>()
    for (const action of actions) {
      if (ids.has(action.id)) {
        throw new ProjectConfigError(400, 'Duplicate action id')
      }
      ids.add(action.id)
    }
    setRepoSetting(this.database, projectRepo.id, PROJECT_ACTIONS_KEY, JSON.stringify(actions))
  }

  getPersonalSetup(projectRepo: Repo): string[] {
    return this.readStoredJson(projectRepo.id, WORKTREE_SETUP_KEY, WorktreeSetupCommandsSchema) ?? []
  }

  setPersonalSetup(projectRepo: Repo, commands: string[]): void {
    setRepoSetting(this.database, projectRepo.id, WORKTREE_SETUP_KEY, JSON.stringify(commands))
  }

  async getConfig(repo: Repo, directory: string): Promise<ProjectConfigResponse> {
    const projectRepo = await this.resolveProjectRepo(repo)
    const actions = this.getPersonalActions(projectRepo).map((action) => ({ ...action, source: 'personal' as const }))
    const worktreeSetup = this.getPersonalSetup(projectRepo).map((command) => ({ command, source: 'personal' as const }))
    const hash: string | null = null
    void directory

    return {
      actions,
      worktreeSetup,
      repoFile: {
        path: '.ocm/project.json',
        exists: false,
        trusted: hash !== null && hash === getRepoSetting(this.database, projectRepo.id, REPO_CONFIG_TRUST_KEY),
        hash,
        warnings: [],
      },
    }
  }

  private readStoredJson<T>(repoId: number, key: string, schema: z.ZodType<T>): T | null {
    const raw = getRepoSetting(this.database, repoId, key)
    if (!raw) {
      return null
    }
    try {
      const result = schema.safeParse(JSON.parse(raw))
      return result.success ? result.data : null
    } catch {
      return null
    }
  }
}
