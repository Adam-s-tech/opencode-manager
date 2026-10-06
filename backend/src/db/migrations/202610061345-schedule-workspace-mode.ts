import type { Migration } from '../migration-runner'

interface ColumnInfo {
  name: string
}

const migration: Migration = {
  id: '202610061345-schedule-workspace-mode',

  up(db) {
    const columns = db.prepare('PRAGMA table_info(schedule_jobs)').all() as ColumnInfo[]
    if (!columns.some((column) => column.name === 'workspace_mode')) {
      db.run("ALTER TABLE schedule_jobs ADD COLUMN workspace_mode TEXT NOT NULL DEFAULT 'worktree'")
    }
  },

  down(db) {
    db.run('ALTER TABLE schedule_jobs DROP COLUMN workspace_mode')
  },
}

export default migration
