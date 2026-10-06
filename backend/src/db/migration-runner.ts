import { Database } from 'bun:sqlite'
import { logger } from '../utils/logger'

/**
 * A schema change applied once per database. Migrations run in the order they appear in
 * `allMigrations`, and each is recorded by its `id`, which must never change once released.
 *
 * New migrations use a UTC timestamp id, `YYYYMMDDHHmm-short-name` (for example
 * `202610061345-schedule-workspace-mode`), in a file of the same name, so migrations written on
 * different branches cannot claim the same identity. Make `up` safe to run on a database that
 * already has the change, because merged branches may apply migrations in a different order.
 *
 * `legacy` only exists on the numbered migrations written before ids; it lets databases that
 * recorded them by version number in `schema_migrations` recognise them as applied.
 */
export interface Migration {
  id: string
  legacy?: { version: number; name: string }
  up(db: Database): void
  down(db: Database): void
}

interface LegacyMigrationRecord {
  version: number
  name: string
  applied_at: number
}

export function migrate(db: Database, migrations: Migration[]): void {
  assertUniqueIds(migrations)
  db.run('CREATE TABLE IF NOT EXISTS applied_migrations (id TEXT PRIMARY KEY, applied_at INTEGER NOT NULL)')
  adoptLegacyMigrations(db, migrations)

  const applied = new Set((db.prepare('SELECT id FROM applied_migrations').all() as Array<{ id: string }>).map((row) => row.id))
  const pending = migrations.filter((migration) => !applied.has(migration.id))

  if (pending.length === 0) {
    logger.info('Database schema is up to date')
    return
  }

  logger.info(`Running ${pending.length} pending migration(s)`)

  for (const migration of pending) {
    logger.info(`Applying migration ${migration.id}`)
    db.run('BEGIN TRANSACTION')
    try {
      migration.up(db)
      db.prepare('INSERT INTO applied_migrations (id, applied_at) VALUES (?, ?)').run(migration.id, Date.now())
      db.run('COMMIT')
      logger.info(`Migration ${migration.id} applied successfully`)
    } catch (error) {
      db.run('ROLLBACK')
      logger.error(`Migration ${migration.id} failed:`, error)
      throw error
    }
  }

  logger.info('All migrations applied successfully')
}

function assertUniqueIds(migrations: Migration[]): void {
  const seen = new Set<string>()
  for (const migration of migrations) {
    if (seen.has(migration.id)) throw new Error(`Duplicate migration id "${migration.id}"`)
    seen.add(migration.id)
  }
}

/**
 * Records numbered migrations that a database applied under the old version-keyed table.
 * A version recorded under a different name is still treated as applied, as before, but warned
 * about because its schema change may be missing.
 */
function adoptLegacyMigrations(db: Database, migrations: Migration[]): void {
  const hasLegacyTable = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'schema_migrations'").get()
  if (!hasLegacyTable) return

  const records = new Map(
    (db.prepare('SELECT version, name, applied_at FROM schema_migrations').all() as LegacyMigrationRecord[])
      .map((record) => [record.version, record] as const),
  )
  const adopted = migrations.flatMap((migration) => {
    const record = migration.legacy ? records.get(migration.legacy.version) : undefined
    if (!migration.legacy || !record) return []
    if (record.name !== migration.legacy.name) {
      logger.warn(
        `Migration version ${migration.legacy.version} is recorded as "${record.name}" but the code defines "${migration.legacy.name}". ` +
        `This migration was skipped; its schema changes may be missing. Verify the database schema and apply the changes manually if needed.`,
      )
    }
    return [{ id: migration.id, appliedAt: record.applied_at }]
  })
  if (adopted.length === 0) return

  const insert = db.prepare('INSERT OR IGNORE INTO applied_migrations (id, applied_at) VALUES (?, ?)')
  db.run('BEGIN TRANSACTION')
  try {
    adopted.forEach((entry) => insert.run(entry.id, entry.appliedAt))
    db.run('COMMIT')
  } catch (error) {
    db.run('ROLLBACK')
    throw error
  }
}
