import type { Database } from 'bun:sqlite'
import type { LaunchMultiRunRequest, MultiRun } from '@opencode-manager/shared/schemas'
import { sanitizeRepoDirectoryName } from '@opencode-manager/shared/utils'
import {
  createMultiRunWithEntries,
  getMultiRun,
  getMultiRunEntry,
  listMultiRuns,
  updateMultiRunEntry,
  type MultiRunEntryRecord,
  type MultiRunRecord,
} from '../db/multi-runs'
import { getRepoById } from '../db/queries'
import { getErrorMessage } from '../utils/error-utils'
import type { GitAuthService } from './git-auth'
import type { OpenCodeClient } from './opencode/client'
import { removeRepoWorkspace } from './repo'
import { SessionLauncher, SessionLaunchError, type LaunchedSession } from './session-launcher'

const MULTI_RUN_LIST_LIMIT = 20

export class MultiRunError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'MultiRunError'
    this.status = status
  }
}

export function toMultiRun(record: MultiRunRecord): MultiRun {
  return {
    id: record.id,
    repoId: record.repoId,
    name: record.name,
    prompt: record.prompt,
    isolated: record.isolated,
    baseRef: record.baseRef,
    createdAt: record.createdAt,
    entries: record.entries.map((entry) => ({
      id: entry.id,
      model: entry.model,
      status: entry.status,
      sessionId: entry.sessionId,
      directory: entry.directory,
      isolated: entry.isolated,
      error: entry.error,
      createdAt: entry.createdAt,
      updatedAt: entry.updatedAt,
    })),
  }
}

export class MultiRunService {
  private readonly sessionLauncher: SessionLauncher
  private readonly discardingEntries = new Set<number>()

  constructor(
    private readonly db: Database,
    private readonly openCodeClient: OpenCodeClient,
    private readonly gitAuthService: GitAuthService,
  ) {
    this.sessionLauncher = new SessionLauncher(db, openCodeClient)
  }

  async launch(request: LaunchMultiRunRequest): Promise<MultiRun> {
    const repo = getRepoById(this.db, request.repoId)
    if (!repo || repo.cloneStatus !== 'ready') {
      throw new MultiRunError('Repository not found or not ready', 404)
    }

    const record = createMultiRunWithEntries(
      this.db,
      {
        repoId: request.repoId,
        name: request.name,
        prompt: request.prompt,
        isolated: request.isolate,
        baseRef: request.baseRef ?? null,
      },
      request.models,
    )

    const slug = sanitizeRepoDirectoryName(request.name)
    const results = await Promise.allSettled(
      record.entries.map((entry, index) => this.launchEntry(entry, index, request, slug)),
    )

    results.forEach((result, index) => {
      const entry = record.entries[index]
      if (!entry) {
        return
      }
      if (result.status === 'fulfilled') {
        updateMultiRunEntry(this.db, entry.id, ['starting'], {
          status: 'started',
          sessionId: result.value.sessionId,
          directory: result.value.directory,
        })
        return
      }

      const workspaceDirectory =
        result.reason instanceof SessionLaunchError ? result.reason.workspaceDirectory : null
      updateMultiRunEntry(this.db, entry.id, ['starting'], {
        status: 'failed',
        error: getErrorMessage(result.reason) || 'Failed to launch session',
        ...(workspaceDirectory ? { directory: workspaceDirectory } : {}),
      })
    })

    return this.reload(record.id)
  }

  list(repoId: number): MultiRun[] {
    return listMultiRuns(this.db, repoId, MULTI_RUN_LIST_LIMIT).map(toMultiRun)
  }

  async discard(multiRunId: number, entryId: number): Promise<MultiRun> {
    const record = getMultiRun(this.db, multiRunId)
    if (!record) {
      throw new MultiRunError('Multi-run not found', 404)
    }

    const entry = getMultiRunEntry(this.db, multiRunId, entryId)
    if (!entry) {
      throw new MultiRunError('Multi-run entry not found', 404)
    }

    if (entry.status !== 'started' && entry.status !== 'failed') {
      throw new MultiRunError('Multi-run entry cannot be discarded from its current state', 409)
    }

    if (this.discardingEntries.has(entryId)) {
      throw new MultiRunError('Multi-run entry discard already in progress', 409)
    }
    this.discardingEntries.add(entryId)

    try {
      if (entry.isolated && entry.directory) {
        const repo = getRepoById(this.db, record.repoId)
        if (!repo) {
          throw new MultiRunError('Repository not found', 404)
        }

        try {
          await removeRepoWorkspace(
            this.db,
            this.openCodeClient,
            this.gitAuthService.getGitEnvironment(),
            repo,
            entry.directory,
          )
        } catch (error) {
          const status = typeof (error as { status?: unknown }).status === 'number'
            ? (error as { status: number }).status
            : 502
          throw new MultiRunError(getErrorMessage(error) || 'Failed to remove workspace', status)
        }
      }

      const updated = updateMultiRunEntry(this.db, entryId, ['started', 'failed'], { status: 'discarded' })
      if (!updated) {
        throw new MultiRunError('Multi-run entry cannot be discarded from its current state', 409)
      }

      return this.reload(multiRunId)
    } finally {
      this.discardingEntries.delete(entryId)
    }
  }

  private async launchEntry(
    entry: MultiRunEntryRecord,
    index: number,
    request: LaunchMultiRunRequest,
    slug: string,
  ): Promise<LaunchedSession> {
    return this.sessionLauncher.launch({
      repoId: request.repoId,
      prompt: request.prompt,
      model: entry.model,
      title: `${request.name} · ${entry.model}`,
      ...(request.agent ? { agent: request.agent } : {}),
      ...(request.isolate
        ? { workspace: { name: `${slug}-${index + 1}`, ...(request.baseRef ? { ref: request.baseRef } : {}) } }
        : {}),
    })
  }

  private reload(multiRunId: number): MultiRun {
    const record = getMultiRun(this.db, multiRunId)
    if (!record) {
      throw new MultiRunError('Multi-run not found', 404)
    }
    return toMultiRun(record)
  }
}
