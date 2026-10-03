import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { Database } from 'bun:sqlite'
import { migrate } from '../../src/db/migration-runner'
import { allMigrations } from '../../src/db/migrations'
import { createRepo } from '../../src/db/queries'
import { createScheduleRun, updateScheduleRunMetadata } from '../../src/db/schedules'
import { getSessionPermissionMode, setSessionPermissionMode } from '../../src/db/session-permission-modes'
import { SettingsService } from '../../src/services/settings'
import { SessionPermissionModeService } from '../../src/services/session-permission-modes'
import { createFakeSessionPermissionClient } from '../helpers/fake-session-permission-client'

function createTestDb(): Database {
  const db = new Database(':memory:')
  migrate(db, allMigrations)
  return db
}

describe('SessionPermissionModeService', () => {
  let db: Database

  beforeEach(() => {
    db = createTestDb()
  })

  afterEach(() => {
    db.close()
  })

  it('treats a root session with no stored row as ask', async () => {
    const service = new SessionPermissionModeService(db, createFakeSessionPermissionClient(), new SettingsService(db))

    await expect(service.getEffectiveMode('ses_root')).resolves.toEqual({
      sessionId: 'ses_root',
      rootSessionId: 'ses_root',
      mode: 'ask',
      inherited: false,
    })
  })

  it('applies a stored auto root mode to its child and marks it inherited', async () => {
    setSessionPermissionMode(db, 'ses_root', 'auto')
    const client = createFakeSessionPermissionClient({ parents: { ses_child: 'ses_root', ses_root: null } })
    const service = new SessionPermissionModeService(db, client, new SettingsService(db))

    await expect(service.getEffectiveMode('ses_child')).resolves.toEqual({
      sessionId: 'ses_child',
      rootSessionId: 'ses_root',
      mode: 'auto',
      inherited: true,
    })
  })

  it('always reports ask for a schedule-run session even when a mode is stored', async () => {
    createRepo(db, {
      localPath: 'repo-one',
      sourcePath: '/abs/repo',
      defaultBranch: 'main',
      cloneStatus: 'ready',
      clonedAt: Date.now(),
      isLocal: true,
    })
    const run = createScheduleRun(db, {
      jobId: 1,
      repoId: 1,
      triggerSource: 'schedule',
      status: 'running',
      startedAt: Date.now(),
      createdAt: Date.now(),
    })
    updateScheduleRunMetadata(db, 1, 1, run.id, { sessionId: 'ses_scheduled' })
    setSessionPermissionMode(db, 'ses_scheduled', 'auto')

    const service = new SessionPermissionModeService(db, createFakeSessionPermissionClient(), new SettingsService(db))

    await expect(service.getEffectiveMode('ses_scheduled')).resolves.toEqual({
      sessionId: 'ses_scheduled',
      rootSessionId: 'ses_scheduled',
      mode: 'ask',
      inherited: false,
    })
  })

  it('rejects setMode for a child session', async () => {
    const client = createFakeSessionPermissionClient({ parents: { ses_child: 'ses_root', ses_root: null } })
    const service = new SessionPermissionModeService(db, client, new SettingsService(db))

    await expect(service.setMode('ses_child', 'auto', '/abs/repo')).rejects.toMatchObject({ status: 400 })
    expect(getSessionPermissionMode(db, 'ses_child')).toBeNull()
    expect(getSessionPermissionMode(db, 'ses_root')).toBeNull()
  })

  it('fails closed to ask when parent resolution fails', async () => {
    const service = new SessionPermissionModeService(db, createFakeSessionPermissionClient({ failSessionGet: true }), new SettingsService(db))

    await expect(service.getEffectiveMode('ses_root')).resolves.toEqual({
      sessionId: 'ses_root',
      rootSessionId: 'ses_root',
      mode: 'ask',
      inherited: false,
    })
  })

  it('reads the default mode from session settings', () => {
    const settingsService = new SettingsService(db)
    const service = new SessionPermissionModeService(db, createFakeSessionPermissionClient(), settingsService)

    expect(service.defaultMode()).toBe('ask')

    settingsService.updateSettings({ sessionDefaults: { permissionMode: 'auto' } })
    expect(service.defaultMode()).toBe('auto')
  })
})
