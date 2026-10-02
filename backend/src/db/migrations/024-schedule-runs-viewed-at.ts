import type { Migration } from '../migration-runner'

interface ColumnInfo {
  name: string
}

const migration: Migration = {
  version: 24,
  name: 'schedule-runs-viewed-at',

  up(db) {
    const columns = db.prepare('PRAGMA table_info(schedule_runs)').all() as ColumnInfo[]
    if (!columns.some((column) => column.name === 'viewed_at')) {
      db.run('ALTER TABLE schedule_runs ADD COLUMN viewed_at INTEGER')
    }

    db.run(`
      UPDATE schedule_runs
      SET viewed_at = COALESCE(finished_at, started_at)
      WHERE viewed_at IS NULL AND status != 'running'
    `)

    db.run(`
      CREATE INDEX IF NOT EXISTS idx_schedule_runs_unread
      ON schedule_runs(finished_at DESC)
      WHERE viewed_at IS NULL
    `)
  },

  down(db) {
    db.run('DROP INDEX IF EXISTS idx_schedule_runs_unread')
    db.run('ALTER TABLE schedule_runs DROP COLUMN viewed_at')
  },
}

export default migration
