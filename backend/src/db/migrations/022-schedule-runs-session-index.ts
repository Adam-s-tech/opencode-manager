import type { Migration } from '../migration-runner'

const migration: Migration = {
  id: '022-schedule-runs-session-index',
  legacy: { version: 22, name: 'schedule-runs-session-index' },

  up(db) {
    db.run(`
      CREATE INDEX IF NOT EXISTS idx_schedule_runs_session
      ON schedule_runs(session_id, started_at DESC)
    `)
  },

  down(db) {
    db.run('DROP INDEX IF EXISTS idx_schedule_runs_session')
  },
}

export default migration
