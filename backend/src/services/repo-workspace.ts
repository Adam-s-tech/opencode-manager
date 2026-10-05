import type { Database } from 'bun:sqlite'
import type { Repo } from '@opencode-manager/shared/types'
import { isWorktreeSibling } from '@opencode-manager/shared/utils'
import { logger } from '../utils/logger'
import type { GitAuthService } from './git-auth'
import type { OpenCodeClient } from './opencode/client'
import type { ProjectConfigService } from './project-config'
import type { TerminalService } from './terminal'
import { findSiblingByDirectory, getSiblingRepos, RepoWorkspaceError, resolveRepoProjectId } from './repo'

/** Single owner of OpenCode workspace lifecycle side effects: worktree setup on create and terminal cleanup on remove. */
export class RepoWorkspaceService {
  constructor(
    private readonly database: Database,
    private readonly openCodeClient: OpenCodeClient,
    private readonly gitAuthService: GitAuthService,
    private readonly projectConfigService: ProjectConfigService,
    private readonly terminalService: TerminalService,
  ) {}

  async create(repo: Repo, options: { name?: string; ref?: string } = {}) {
    const projectID = await resolveRepoProjectId(this.openCodeClient, repo.fullPath)
    const worktree = await this.openCodeClient.api.worktree.create({
      projectID,
      ...(options.name ? { name: options.name } : {}),
      ...(options.ref ? { branch: options.ref } : {}),
    })
    const worktreeSetup = await this.projectConfigService.runWorktreeSetupForRepo(repo, worktree.directory, this.terminalService)
    return { ...worktree, worktreeSetup }
  }

  async remove(repo: Repo, directory: string): Promise<void> {
    const worktree = findSiblingByDirectory(await this.listWorktreeSiblings(repo.id), directory)
    if (!worktree) throw new RepoWorkspaceError('Not a deletable worktree of this repo', 400)

    await this.removeTerminals(worktree.fullPath)
    const projectID = await resolveRepoProjectId(this.openCodeClient, repo.fullPath)
    await this.openCodeClient.api.worktree.remove({ projectID, directory: worktree.fullPath, force: true })
  }

  async removeRepoTerminals(repo: Repo): Promise<void> {
    await this.removeTerminals(repo.fullPath)

    let siblings: Array<{ fullPath: string }>
    try {
      siblings = await this.listWorktreeSiblings(repo.id)
    } catch (error: unknown) {
      logger.warn(`Failed to list OpenCode workspace siblings for repo ${repo.id}:`, error)
      return
    }
    await Promise.all(siblings.map((sibling) => this.removeTerminals(sibling.fullPath)))
  }

  private async listWorktreeSiblings(repoId: number) {
    const siblings = await getSiblingRepos(
      this.database,
      repoId,
      this.gitAuthService.getGitEnvironment(),
      this.openCodeClient,
      { includeBranch: false },
    )
    return siblings.filter(isWorktreeSibling)
  }

  private async removeTerminals(directory: string): Promise<void> {
    try {
      await this.terminalService.removeAll(directory)
    } catch (error: unknown) {
      logger.warn(`Failed to remove terminals for ${directory}:`, error)
    }
  }
}
