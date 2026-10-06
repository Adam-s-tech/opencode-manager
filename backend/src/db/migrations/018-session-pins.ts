import type { Migration } from '../migration-runner'
import { ensureSessionPinsTable } from '../session-pins'

const migration: Migration = {
  id: '018-session-pins',
  legacy: { version: 18, name: 'session-pins' },
  up(db) {
    ensureSessionPinsTable(db)
  },
  down(db) {
    db.run('DROP TABLE IF EXISTS session_pins')
  },
}

export default migration
