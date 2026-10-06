import type { Migration } from '../migration-runner'
import { ensureSessionPermissionModesTable } from '../session-permission-modes'

const migration: Migration = {
  id: '025-session-permission-modes',
  legacy: { version: 25, name: 'session-permission-modes' },
  up(db) {
    ensureSessionPermissionModesTable(db)
  },
  down(db) {
    db.run('DROP TABLE IF EXISTS session_permission_modes')
  },
}

export default migration
