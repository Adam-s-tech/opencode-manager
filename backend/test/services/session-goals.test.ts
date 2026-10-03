import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { Database } from 'bun:sqlite'
import { migrate } from '../../src/db/migration-runner'
import { allMigrations } from '../../src/db/migrations'
import { getSessionGoalById, listOpenSessionGoals } from '../../src/db/session-goals'
import { SessionGoalService } from '../../src/services/session-goals'
import { SettingsService } from '../../src/services/settings'
import { createFakeSessionGoalClient } from '../helpers/fake-session-goal-client'

const DIRECTORY = '/abs/repo'

function createTestDb(): Database {
  const db = new Database(':memory:')
  migrate(db, allMigrations)
  return db
}

function createService(
  db: Database,
  options: Parameters<typeof createFakeSessionGoalClient>[0] = {},
  settingsService: SettingsService = new SettingsService(db),
): SessionGoalService {
  return new SessionGoalService(db, createFakeSessionGoalClient(options), settingsService)
}

describe('SessionGoalService', () => {
  let db: Database

  beforeEach(() => {
    db = createTestDb()
  })

  afterEach(() => {
    db.close()
  })

  it('starts an active goal with the settings defaults and the current token count', async () => {
    const settingsService = new SettingsService(db)
    settingsService.updateSettings({
      sessionDefaults: {
        permissionMode: 'ask',
        goalMaxContinuations: 7,
        goalTokenBudget: 1234,
        goalAuditorModel: 'provider/model',
      },
    })
    const service = createService(db, { tokens: { ses_1: { input: 100, output: 50, reasoning: 10 } } }, settingsService)

    const goal = await service.start({ sessionId: 'ses_1', directory: DIRECTORY, objective: 'Ship the feature' })

    expect(goal).toMatchObject({
      sessionId: 'ses_1',
      directory: DIRECTORY,
      objective: 'Ship the feature',
      status: 'active',
      stopReason: null,
      turnState: 'waiting',
      continuationCount: 0,
      maxContinuations: 7,
      tokenBudget: 1234,
      tokensUsed: 0,
      consecutiveBlocked: 0,
      lastVerdict: null,
      lastReason: null,
      finishedAt: null,
    })
    expect(getSessionGoalById(db, goal.id)?.tokensAtStart).toBe(160)
  })

  it('lets explicit input override the settings defaults', async () => {
    const settingsService = new SettingsService(db)
    settingsService.updateSettings({
      sessionDefaults: { permissionMode: 'ask', goalMaxContinuations: 7, goalTokenBudget: 1234 },
    })
    const service = createService(db, {}, settingsService)

    const goal = await service.start({
      sessionId: 'ses_1',
      directory: DIRECTORY,
      objective: 'Ship the feature',
      maxContinuations: 3,
      tokenBudget: 99,
    })

    expect(goal.maxContinuations).toBe(3)
    expect(goal.tokenBudget).toBe(99)
  })

  it('falls back to the default max continuations when settings do not set it', async () => {
    const settingsService = new SettingsService(db)
    settingsService.updateSettings({ sessionDefaults: { permissionMode: 'ask' } })
    const service = createService(db, {}, settingsService)

    const goal = await service.start({ sessionId: 'ses_1', directory: DIRECTORY, objective: 'Ship it' })

    expect(goal.maxContinuations).toBe(20)
    expect(goal.tokenBudget).toBeNull()
  })

  it('uses zero tokens when the session lookup fails', async () => {
    const service = createService(db, { failSessionGet: true })

    const goal = await service.start({ sessionId: 'ses_1', directory: DIRECTORY, objective: 'Ship it' })

    expect(getSessionGoalById(db, goal.id)?.tokensAtStart).toBe(0)
  })

  it('rejects a second open goal for the same session with 409', async () => {
    const service = createService(db)

    await service.start({ sessionId: 'ses_1', directory: DIRECTORY, objective: 'First' })

    await expect(
      service.start({ sessionId: 'ses_1', directory: DIRECTORY, objective: 'Second' }),
    ).rejects.toMatchObject({ status: 409 })
    expect(listOpenSessionGoals(db)).toHaveLength(1)
  })

  it('allows a new goal once the previous one is cancelled', async () => {
    const service = createService(db)
    const first = await service.start({ sessionId: 'ses_1', directory: DIRECTORY, objective: 'First' })

    service.cancel(first.id)
    const second = await service.start({ sessionId: 'ses_1', directory: DIRECTORY, objective: 'Second' })

    expect(second.status).toBe('active')
    expect(listOpenSessionGoals(db)).toHaveLength(1)
  })

  it('pauses and resumes a goal', async () => {
    const service = createService(db)
    const started = await service.start({ sessionId: 'ses_1', directory: DIRECTORY, objective: 'Ship it' })

    const paused = service.pause(started.id)
    expect(paused.status).toBe('paused')
    expect(paused.stopReason).toBe('user_paused')

    const resumed = service.resume(started.id)
    expect(resumed.status).toBe('active')
    expect(resumed.stopReason).toBeNull()
    expect(resumed.turnState).toBe('running')
  })

  it('cancels a paused goal and rejects cancelling a finished goal', async () => {
    const service = createService(db)
    const started = await service.start({ sessionId: 'ses_1', directory: DIRECTORY, objective: 'Ship it' })
    service.pause(started.id)

    const cancelled = service.cancel(started.id)
    expect(cancelled.status).toBe('stopped')
    expect(cancelled.stopReason).toBe('cancelled')
    expect(cancelled.finishedAt).not.toBeNull()

    expect(() => service.cancel(started.id)).toThrowError(
      expect.objectContaining({ status: 409 }) as Error,
    )
  })

  it('rejects pausing a missing goal with 404', async () => {
    const service = createService(db)

    expect(() => service.pause(999)).toThrowError(expect.objectContaining({ status: 404 }) as Error)
  })

  it('returns the latest goal for a session', async () => {
    const service = createService(db)

    expect(service.getLatest('ses_1')).toBeNull()

    const started = await service.start({ sessionId: 'ses_1', directory: DIRECTORY, objective: 'Ship it' })

    expect(service.getLatest('ses_1')?.id).toBe(started.id)
  })
})
