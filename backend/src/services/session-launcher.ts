import type { Database } from 'bun:sqlite'
import { openCodeLocation, parseOpenCodeModelRef } from '@opencode-manager/shared/opencode'
import { getRepoById } from '../db/queries'
import { getErrorMessage } from '../utils/error-utils'
import type { OpenCodeClient } from './opencode/client'
import { resolveOpenCodeModel } from './opencode-models'
import { createRepoWorkspace } from './repo'

export interface LaunchSessionInput {
  repoId: number
  prompt: string
  title?: string
  model?: string
  agent?: string
  workspace?: { name?: string; ref?: string }
}

export interface LaunchedSession {
  sessionId: string
  repoId: number
  directory: string
  workspaceDirectory: string | null
  model: string
  title: string | null
}

export class SessionLaunchError extends Error {
  readonly status: 400 | 404 | 502
  readonly workspaceDirectory: string | null

  constructor(message: string, status: 400 | 404 | 502, workspaceDirectory: string | null = null) {
    super(message)
    this.name = 'SessionLaunchError'
    this.status = status
    this.workspaceDirectory = workspaceDirectory
  }
}

function withWorkspace(message: string, workspaceDirectory: string | null): string {
  return workspaceDirectory ? `${message} (workspace: ${workspaceDirectory})` : message
}

export class SessionLauncher {
  constructor(
    private readonly db: Database,
    private readonly openCodeClient: OpenCodeClient,
  ) {}

  async launch(input: LaunchSessionInput): Promise<LaunchedSession> {
    const repo = getRepoById(this.db, input.repoId)
    if (!repo || repo.cloneStatus !== 'ready') {
      throw new SessionLaunchError('Repository not found or not ready', 404)
    }

    let directory = repo.fullPath
    let workspaceDirectory: string | null = null

    if (input.workspace) {
      try {
        const workspace = await createRepoWorkspace(this.openCodeClient, repo, input.workspace)
        directory = workspace.directory
        workspaceDirectory = workspace.directory
      } catch (error) {
        throw new SessionLaunchError(withWorkspace(getErrorMessage(error) || 'Failed to create workspace', null), 502)
      }
    }

    const model = await this.resolveModel(input.model, directory, workspaceDirectory)

    let session: { id: string; title?: string | null }
    try {
      session = await this.openCodeClient.api.session.create({
        ...(input.title ? { title: input.title } : {}),
        ...(input.agent ? { agent: input.agent } : {}),
        model: {
          providerID: model.providerID,
          id: model.id,
          ...(model.variant ? { variant: model.variant } : {}),
        },
        ...openCodeLocation(directory),
      })

      await this.openCodeClient.api.session.prompt({ sessionID: session.id, text: input.prompt })
    } catch (error) {
      throw new SessionLaunchError(
        withWorkspace(getErrorMessage(error) || 'Failed to create OpenCode session', workspaceDirectory),
        502,
        workspaceDirectory,
      )
    }

    return {
      sessionId: session.id,
      repoId: repo.id,
      directory,
      workspaceDirectory,
      model: model.model,
      title: session.title ?? input.title ?? null,
    }
  }

  private async resolveModel(
    requestedModel: string | undefined,
    directory: string,
    workspaceDirectory: string | null,
  ): Promise<Awaited<ReturnType<typeof resolveOpenCodeModel>>> {
    let resolved: Awaited<ReturnType<typeof resolveOpenCodeModel>>
    try {
      resolved = await resolveOpenCodeModel(this.openCodeClient, directory, {
        preferredModel: requestedModel,
      })
    } catch (error) {
      throw new SessionLaunchError(
        withWorkspace(getErrorMessage(error) || 'Failed to resolve OpenCode model', workspaceDirectory),
        502,
        workspaceDirectory,
      )
    }

    if (requestedModel) {
      const requestedRef = parseOpenCodeModelRef(requestedModel)
      if (!requestedRef || resolved.providerID !== requestedRef.providerID || resolved.id !== requestedRef.id) {
        throw new SessionLaunchError(
          withWorkspace(`Model ${requestedModel} is not available`, workspaceDirectory),
          400,
          workspaceDirectory,
        )
      }
    }

    return resolved
  }
}
