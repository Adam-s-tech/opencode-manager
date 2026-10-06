import type { Migration } from '../migration-runner'
import { ensureMultiRunTables } from '../multi-runs'

const migration: Migration = {
  id: '027-multi-runs',
  legacy: { version: 27, name: 'multi-runs' },
  up(db) {
    ensureMultiRunTables(db)
  },
  down(db) {
    db.run('DROP TABLE IF EXISTS multi_run_entries')
    db.run('DROP TABLE IF EXISTS multi_runs')
  },
}

export default migration
