import type { Database } from 'bun:sqlite'
import type {
  SessionPermissionMode,
  SessionPermissionModeState,
} from '@opencode-manager/shared/schemas'
import { openCodeLocation, type PermissionRequest } from '@opencode-manager/shared/opencode'
import { getScheduleRunBySessionId } from '../db/schedules'
import {
  deleteSessionPermissionMode,
  getSessionPermissionMode,
  insertSessionPermissionModeIfAbsent,
  setSessionPermissionMode,
} from '../db/session-permission-modes'
import { logger } from '../utils/logger'
import type { OpenCodeClient } from './opencode/client'
import type { SSEEvent } from './sse-aggregator'
import type { SettingsService } from './settings'

const MAX_PARENT_HOPS = 10

export class SessionPermissionModeError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

export class SessionPermissionModeService {
  private readonly parentBySession = new Map<string, string | null>()

  constructor(
    private readonly db: Database,
    private readonly openCodeClient: OpenCodeClient,
    private readonly settingsService: SettingsService,
  ) {}

  rememberParent(sessionId: string, parentId: string | null | undefined): void {
    this.parentBySession.set(sessionId, parentId ?? null)
  }

  async resolveRootSessionId(sessionId: string): Promise<string> {
    let current = sessionId

    for (let hops = 0; hops < MAX_PARENT_HOPS; hops += 1) {
      const parentId = await this.getParentId(current)
      if (!parentId) {
        return current
      }
      current = parentId
    }

    return current
  }

  async handleEvent(directory: string, event: SSEEvent): Promise<void> {
    switch (event.type) {
      case 'session.created': {
        const { sessionID, parentID } = event.data
        this.rememberParent(sessionID, parentID)
        if (!parentID && this.defaultMode() === 'auto') {
          insertSessionPermissionModeIfAbsent(this.db, sessionID, 'auto')
        }
        return
      }
      case 'permission.asked': {
        const { sessionID, id } = event.data
        await this.autoAcceptRequest(sessionID, id)
        return
      }
      case 'session.deleted': {
        const { sessionID } = event.data
        this.parentBySession.delete(sessionID)
        deleteSessionPermissionMode(this.db, sessionID)
        return
      }
    }
  }

  async getEffectiveMode(sessionId: string): Promise<SessionPermissionModeState> {
    const rootSessionId = await this.resolveRootSessionIdOrNull(sessionId)
    return this.effectiveModeForRoot(sessionId, rootSessionId)
  }

  async setMode(sessionId: string, mode: SessionPermissionMode, directory: string): Promise<SessionPermissionModeState> {
    const rootSessionId = await this.resolveRootSessionId(sessionId)
    if (rootSessionId !== sessionId) {
      throw new SessionPermissionModeError(
        'Child sessions inherit the permission mode of their parent session',
        400,
      )
    }

    if (getScheduleRunBySessionId(this.db, rootSessionId)) {
      throw new SessionPermissionModeError(
        'Scheduled runs use their own permission configuration',
        409,
      )
    }

    setSessionPermissionMode(this.db, sessionId, mode)
    if (mode === 'auto') {
      await this.acceptPendingRequests(sessionId, directory)
    }
    return { sessionId, rootSessionId, mode, inherited: false }
  }

  defaultMode(): SessionPermissionMode {
    return this.settingsService.getSettings().preferences.sessionDefaults?.permissionMode ?? 'ask'
  }

  private effectiveModeForRoot(
    sessionId: string,
    rootSessionId: string | null,
  ): SessionPermissionModeState {
    if (!rootSessionId) {
      return { sessionId, rootSessionId: sessionId, mode: 'ask', inherited: false }
    }

    const inherited = rootSessionId !== sessionId

    if (getScheduleRunBySessionId(this.db, rootSessionId)) {
      return { sessionId, rootSessionId, mode: 'ask', inherited }
    }

    const stored = getSessionPermissionMode(this.db, rootSessionId)
    return { sessionId, rootSessionId, mode: stored ?? 'ask', inherited }
  }

  private async acceptPendingRequests(rootSessionId: string, directory: string): Promise<void> {
    let requests: PermissionRequest[]
    try {
      const result = await this.openCodeClient.api.permission.request.list(openCodeLocation(directory))
      requests = result.data
    } catch (error) {
      logger.error(`Failed to list pending permission requests for session ${rootSessionId}:`, error)
      return
    }

    for (const request of requests) {
      await this.autoAcceptRequest(request.sessionID, request.id, rootSessionId)
    }
  }

  private async autoAcceptRequest(
    sessionID: string,
    requestID: string,
    expectedRootSessionId?: string,
  ): Promise<void> {
    const rootSessionId = await this.resolveRootSessionIdOrNull(sessionID)
    if (!rootSessionId) {
      return
    }

    if (expectedRootSessionId !== undefined && rootSessionId !== expectedRootSessionId) {
      return
    }

    if (this.effectiveModeForRoot(sessionID, rootSessionId).mode !== 'auto') {
      return
    }

    await this.replyOnce(sessionID, requestID)
  }

  private async replyOnce(sessionID: string, requestID: string): Promise<void> {
    try {
      await this.openCodeClient.api.permission.reply({ sessionID, requestID, decision: 'once' })
      logger.info(`Auto-accepted permission request ${requestID} for session ${sessionID}`)
    } catch (error) {
      logger.error(`Failed to auto-accept permission request ${requestID} for session ${sessionID}:`, error)
    }
  }

  private async resolveRootSessionIdOrNull(sessionId: string): Promise<string | null> {
    try {
      return await this.resolveRootSessionId(sessionId)
    } catch {
      return null
    }
  }

  private async getParentId(sessionId: string): Promise<string | null> {
    if (this.parentBySession.has(sessionId)) {
      return this.parentBySession.get(sessionId) ?? null
    }

    const session = await this.openCodeClient.api.session.get({ sessionID: sessionId })
    const parentId = session.parentID ?? null
    this.parentBySession.set(sessionId, parentId)
    return parentId
  }
}
