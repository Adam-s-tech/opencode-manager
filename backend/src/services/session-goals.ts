import type { Database } from 'bun:sqlite'
import {
  DEFAULT_SESSION_DEFAULTS,
  type SessionGoal,
  type SessionGoalStatus,
  type StartSessionGoalRequest,
} from '@opencode-manager/shared/schemas'
import {
  getLatestSessionGoal,
  getSessionGoalById,
  insertSessionGoal,
  transitionSessionGoal,
  type SessionGoalPatch,
  type SessionGoalRecord,
} from '../db/session-goals'
import { logger } from '../utils/logger'
import type { OpenCodeClient } from './opencode/client'
import type { SettingsService } from './settings'

export class SessionGoalError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

export function sessionTokenTotal(tokens: { input: number; output: number; reasoning: number }): number {
  return tokens.input + tokens.output + tokens.reasoning
}

export function toSessionGoal(record: SessionGoalRecord): SessionGoal {
  return {
    id: record.id,
    sessionId: record.sessionId,
    directory: record.directory,
    objective: record.objective,
    status: record.status,
    stopReason: record.stopReason,
    turnState: record.turnState,
    continuationCount: record.continuationCount,
    maxContinuations: record.maxContinuations,
    tokenBudget: record.tokenBudget,
    tokensUsed: record.tokensUsed,
    consecutiveBlocked: record.consecutiveBlocked,
    lastVerdict: record.lastVerdict,
    lastReason: record.lastReason,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    finishedAt: record.finishedAt,
  }
}

export class SessionGoalService {
  constructor(
    private readonly db: Database,
    private readonly openCodeClient: OpenCodeClient,
    private readonly settingsService: SettingsService,
  ) {}

  async start(input: StartSessionGoalRequest): Promise<SessionGoal> {
    const defaults = this.settingsService.getSettings().preferences.sessionDefaults
    const maxContinuations =
      input.maxContinuations ?? defaults?.goalMaxContinuations ?? DEFAULT_SESSION_DEFAULTS.goalMaxContinuations
    const tokenBudget = input.tokenBudget ?? defaults?.goalTokenBudget ?? null
    const tokensAtStart = await this.readSessionTokenTotal(input.sessionId)

    const record = insertSessionGoal(this.db, {
      sessionId: input.sessionId,
      directory: input.directory,
      objective: input.objective,
      maxContinuations,
      tokenBudget,
      tokensAtStart,
    })

    if (!record) {
      throw new SessionGoalError('This session already has an open goal', 409)
    }

    return toSessionGoal(record)
  }

  getLatest(sessionId: string): SessionGoal | null {
    const record = getLatestSessionGoal(this.db, sessionId)
    return record ? toSessionGoal(record) : null
  }

  pause(id: number): SessionGoal {
    return toSessionGoal(this.transition(id, ['active'], { status: 'paused', stopReason: 'user_paused' }))
  }

  resume(id: number): SessionGoal {
    return toSessionGoal(this.transition(id, ['paused'], {
      status: 'active',
      stopReason: null,
      turnState: 'running',
      finishedAt: null,
    }))
  }

  cancel(id: number): SessionGoal {
    return toSessionGoal(this.transition(id, ['active', 'paused'], {
      status: 'stopped',
      stopReason: 'cancelled',
      finishedAt: Date.now(),
    }))
  }

  private transition(id: number, fromStatuses: SessionGoalStatus[], patch: SessionGoalPatch): SessionGoalRecord {
    const record = transitionSessionGoal(this.db, id, fromStatuses, patch)
    if (record) {
      return record
    }

    if (!getSessionGoalById(this.db, id)) {
      throw new SessionGoalError('Session goal not found', 404)
    }
    throw new SessionGoalError('Session goal cannot transition from its current state', 409)
  }

  private async readSessionTokenTotal(sessionId: string): Promise<number> {
    try {
      const session = await this.openCodeClient.api.session.get({ sessionID: sessionId })
      return sessionTokenTotal(session.tokens)
    } catch (error) {
      logger.error(`Failed to read token usage for session ${sessionId}:`, error)
      return 0
    }
  }
}
