import { existsSync, readdirSync } from 'node:fs'
import path from 'path'
import type { Database } from 'bun:sqlite'
import { getScheduleWorktreesPath } from '@opencode-manager/shared/config/env'
import { ASSISTANT_REPO_ID } from '@opencode-manager/shared/utils'
import type { ScheduleWorkspaceMode } from '@opencode-manager/shared/types'
import type { Repo } from '../types/repo'
import type { GitAuthService } from './git-auth'
import { isSSHUrl } from '@opencode-manager/shared/utils'
import { executeCommand } from '../utils/process'
import { resolveDefaultBranch, createWorktreeSafely, removeWorktree } from './repo'
import { logger } from '../utils/logger'
import { mkdirSyncSafe } from '../utils/fs-safe'
import {
  getRunScheduleBranch,
  getRunScheduleWorktreePath,
  getSharedScheduleBranch,
  getSharedScheduleWorktreePath,
  parseScheduleWorktreeName,
} from './schedule-worktree-paths'

export interface ScheduleWorktreeContext {
  directory: string
  worktreePath: string
  runBranch: string
}

/**
 * A schedule worktree directory found on disk. `runId` is null for a schedule's shared worktree.
 */
export interface ScheduleWorktreeEntry {
  jobId: number
  runId: number | null
  worktreePath: string
  branch: string
}

function isSharedWorktreePath(worktreePath: string): boolean {
  return path.basename(worktreePath).endsWith('-shared')
}

/**
 * Build repo-context environment variables used by the GIT_ASKPASS handler
 * to resolve repo-specific credentials. Mirrors GitService.getEnvironmentForRepo.
 */
export function buildRepoEnvForRepo(repo: { id?: number; fullPath: string }): Record<string, string> {
  return {
    ...(repo.id ? { OCM_GIT_REPO_ID: String(repo.id) } : {}),
    OCM_GIT_REPO_CWD: repo.fullPath,
  }
}

export class ScheduleWorktreeManager {
  constructor(
    private readonly gitAuthService: GitAuthService,
    private readonly db: Database,
  ) {}

  /**
   * Prepares the directory a run works in. Returns null when the run works in the
   * repository checkout itself. A shared worktree that already exists is reused as-is;
   * otherwise a worktree is created, continuing the shared branch when it already exists.
   */
  async prepare(
    repo: Repo,
    job: { id: number; branch: string | null; workspaceMode: ScheduleWorkspaceMode },
    runId: number,
  ): Promise<ScheduleWorktreeContext | null> {
    if (repo.id === ASSISTANT_REPO_ID || job.workspaceMode === 'repo') return null

    try {
      await executeCommand(['git', '-C', repo.fullPath, 'rev-parse', '--is-inside-work-tree'], { silent: true })
    } catch {
      return null
    }

    const shared = job.workspaceMode === 'shared-worktree'
    const runBranch = shared ? getSharedScheduleBranch(job.id) : getRunScheduleBranch(job.id, runId)
    const worktreePath = shared ? getSharedScheduleWorktreePath(job.id) : getRunScheduleWorktreePath(job.id, runId)

    let sshSetup = false
    if (repo.repoUrl && isSSHUrl(repo.repoUrl)) {
      await this.gitAuthService.setupSSHForRepoUrl(repo.repoUrl, this.db)
      sshSetup = true
    }

    try {
      const env = await this.buildGitEnv(repo, sshSetup, true)

      if (shared && await this.isUsableWorktree(worktreePath, env)) {
        return { directory: worktreePath, worktreePath, runBranch }
      }

      await executeCommand(['git', '-C', repo.fullPath, 'fetch', '--prune', 'origin'], { env }).catch(() => {})

      const base = job.branch?.trim() || (await resolveDefaultBranch(repo.fullPath, env))
      const baseRef = await this.resolveBaseRef(repo.fullPath, base, env)
      if (!baseRef) {
        throw new Error(`Base branch "${base}" was not found in this repository. Choose an existing branch in the schedule settings.`)
      }

      if (existsSync(worktreePath)) {
        await removeWorktree(repo.fullPath, worktreePath, env)
      }

      mkdirSyncSafe(path.dirname(worktreePath))
      await createWorktreeSafely(repo.fullPath, worktreePath, runBranch, env, baseRef)

      if (!existsSync(worktreePath)) {
        throw new Error(`Worktree directory was not created at: ${worktreePath}`)
      }

      return { directory: worktreePath, worktreePath, runBranch }
    } finally {
      if (sshSetup) {
        await this.gitAuthService.cleanupSSHKey()
      }
    }
  }

  /**
   * Commits a finished run's changes to its branch. A `worktree` run's worktree is then
   * removed, along with its branch when nothing was committed. Kept and shared worktrees
   * stay on disk on their branch so the work can be continued.
   */
  async finalize(
    repo: Repo,
    job: { id: number; name: string; prompt: string; workspaceMode: ScheduleWorkspaceMode },
    run: { id: number; worktreePath: string | null; runBranch: string | null; triggerSource: string },
  ): Promise<{ commitHash: string | null }> {
    if (!run.worktreePath) {
      return { commitHash: null }
    }

    const retain = isSharedWorktreePath(run.worktreePath) || job.workspaceMode === 'kept-worktree'
    let sshSetup = false
    let env: Record<string, string> | undefined
    let commitHash: string | null = null

    try {
      if (repo.repoUrl && isSSHUrl(repo.repoUrl)) {
        await this.gitAuthService.setupSSHForRepoUrl(repo.repoUrl, this.db)
        sshSetup = true
      }

      env = await this.buildGitEnv(repo, sshSetup, false)

      const promptSummary = job.prompt.length > 200 ? `${job.prompt.slice(0, 200)}...` : job.prompt
      commitHash = await this.commitPendingChanges(
        run.worktreePath,
        env,
        `Scheduled run: ${job.name} (run #${run.id})`,
        `Trigger: ${run.triggerSource}\nPrompt: ${promptSummary}`,
      )

      if (!retain) {
        await executeCommand(['git', '-C', run.worktreePath, 'checkout', '--detach'], { env }).catch(() => {})
      }

      return { commitHash }
    } catch (error) {
      logger.error(`Failed to finalize schedule run ${run.id} in worktree ${run.worktreePath}:`, error)
      throw error
    } finally {
      if (!retain) {
        await removeWorktree(repo.fullPath, run.worktreePath, env).catch((error) => {
          logger.error(`Failed to remove worktree ${run.worktreePath}:`, error)
        })

        if (run.runBranch && !commitHash) {
          await executeCommand(['git', '-C', repo.fullPath, 'branch', '-D', run.runBranch], env ? { env } : undefined).catch(() => undefined)
        }
      }

      if (sshSetup) {
        await this.gitAuthService.cleanupSSHKey()
      }
    }
  }

  /**
   * Removes a kept or shared worktree. Uncommitted changes are committed to its branch
   * first and the branch is kept, so no work is lost; if that commit fails the worktree
   * is left in place.
   */
  async releaseWorktree(repo: Repo, job: { name: string }, worktreePath: string): Promise<void> {
    const env = await this.buildGitEnv(repo, false, true)

    if (existsSync(worktreePath)) {
      await this.commitPendingChanges(worktreePath, env, `Schedule worktree removed: ${job.name}`, 'Uncommitted changes saved before the worktree was removed.')
    }

    await removeWorktree(repo.fullPath, worktreePath, env)
  }

  /**
   * Lists the schedule worktree directories on disk, optionally for a single job.
   */
  listWorktrees(jobId?: number): ScheduleWorktreeEntry[] {
    let names: string[]
    try {
      names = readdirSync(getScheduleWorktreesPath())
    } catch {
      return []
    }

    return names.flatMap((name) => {
      const parsed = parseScheduleWorktreeName(name)
      if (!parsed || (jobId !== undefined && parsed.jobId !== jobId)) return []
      return [{
        jobId: parsed.jobId,
        runId: parsed.runId,
        worktreePath: path.join(getScheduleWorktreesPath(), name),
        branch: parsed.runId === null ? getSharedScheduleBranch(parsed.jobId) : getRunScheduleBranch(parsed.jobId, parsed.runId),
      }]
    })
  }

  /**
   * Removes leftover worktrees and deletes the run branches for a set of
   * finished runs. Used when clearing run history. The job's shared worktree and
   * branch are never touched, since they belong to the schedule rather than a run.
   * Branch and worktree removal are local git operations, so no SSH setup is needed;
   * failures are swallowed per artifact so one bad entry does not block the rest.
   */
  async pruneRunArtifacts(
    repo: Repo,
    jobId: number,
    artifacts: { runBranch: string | null; worktreePath: string | null }[],
  ): Promise<void> {
    const sharedPath = getSharedScheduleWorktreePath(jobId)
    const sharedBranch = getSharedScheduleBranch(jobId)
    const worktreePaths = artifacts
      .map((a) => a.worktreePath)
      .filter((p): p is string => p !== null && p !== sharedPath)
    const branches = artifacts
      .map((a) => a.runBranch)
      .filter((b): b is string => b !== null && b.length > 0 && b !== sharedBranch)

    if (worktreePaths.length === 0 && branches.length === 0) return

    const env = await this.buildGitEnv(repo, false, true)

    await Promise.all(
      worktreePaths.map((worktreePath) => removeWorktree(repo.fullPath, worktreePath, env).catch(() => undefined)),
    )

    if (branches.length > 0) {
      await executeCommand(['git', '-C', repo.fullPath, 'branch', '-D', ...branches], { env }).catch(() => {})
    }
  }

  private async commitPendingChanges(
    worktreePath: string,
    env: Record<string, string>,
    title: string,
    body: string,
  ): Promise<string | null> {
    const status = await executeCommand(['git', '-C', worktreePath, 'status', '--porcelain'], { env }).catch(() => '')
    if (!status.trim()) return null

    await executeCommand(['git', '-C', worktreePath, 'add', '-A'], { env })
    await executeCommand(['git', '-C', worktreePath, 'commit', '-m', title, '-m', body], { env })
    return (await executeCommand(['git', '-C', worktreePath, 'rev-parse', 'HEAD'], { env })).trim()
  }

  private async isUsableWorktree(worktreePath: string, env: Record<string, string>): Promise<boolean> {
    if (!existsSync(path.join(worktreePath, '.git'))) return false
    try {
      await executeCommand(['git', '-C', worktreePath, 'rev-parse', '--is-inside-work-tree'], { env, silent: true })
      return true
    } catch {
      return false
    }
  }

  /**
   * Resolves a user-supplied base branch name to a verified git ref, preferring
   * the remote-tracking branch for freshness. Returns null when neither the
   * remote nor local ref exists, allowing the caller to fail with a clear error
   * instead of a cryptic git "not a valid object name" failure.
   */
  private async resolveBaseRef(repoPath: string, base: string, env: Record<string, string>): Promise<string | null> {
    for (const candidate of [`refs/remotes/origin/${base}`, `refs/heads/${base}`]) {
      try {
        await executeCommand(['git', '-C', repoPath, 'rev-parse', '--verify', candidate], { env, silent: true })
        return candidate.startsWith('refs/remotes/') ? `origin/${base}` : base
      } catch {
        continue
      }
    }
    return null
  }

  private async buildGitEnv(repo: Repo, sshSetup: boolean, silent: boolean): Promise<Record<string, string>> {
    const baseEnv = this.gitAuthService.getGitEnvironment(silent)
    const sshEnv = sshSetup ? this.gitAuthService.getSSHEnvironment() : {}
    return { ...baseEnv, ...buildRepoEnvForRepo(repo), ...sshEnv }
  }
}
