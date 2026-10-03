import type { Database } from 'bun:sqlite'
import type {
  SessionPermissionMode,
  SessionPermissionModeState,
} from '@opencode-manager/shared/schemas'
import { getScheduleRunBySessionId } from '../db/schedules'
import { getSessionPermissionMode, setSessionPermissionMode } from '../db/session-permission-modes'
import type { OpenCodeClient } from './opencode/client'
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

  async getEffectiveMode(sessionId: string): Promise<SessionPermissionModeState> {
    let rootSessionId: string

    try {
      rootSessionId = await this.resolveRootSessionId(sessionId)
    } catch {
      return { sessionId, rootSessionId: sessionId, mode: 'ask', inherited: false }
    }

    const inherited = rootSessionId !== sessionId

    if (getScheduleRunBySessionId(this.db, rootSessionId)) {
      return { sessionId, rootSessionId, mode: 'ask', inherited }
    }

    const stored = getSessionPermissionMode(this.db, rootSessionId)
    return { sessionId, rootSessionId, mode: stored ?? 'ask', inherited }
  }

  async setMode(sessionId: string, mode: SessionPermissionMode, directory: string): Promise<SessionPermissionModeState> {
    void directory

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
    return { sessionId, rootSessionId, mode, inherited: false }
  }

  defaultMode(): SessionPermissionMode {
    return this.settingsService.getSettings().preferences.sessionDefaults?.permissionMode ?? 'ask'
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
