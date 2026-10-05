import { DatabaseSync } from 'node:sqlite'

// Adapter to make node:sqlite compatible with bun:sqlite API
export class Database {
  private db: DatabaseSync
  private transactionDepth = 0

  constructor(path: string) {
    this.db = new DatabaseSync(path)
    this.db.exec('PRAGMA foreign_keys = OFF')
  }

  prepare(sql: string) {
    const stmt = this.db.prepare(sql)
    return {
      run: (...params: unknown[]) => {
        const result = (stmt.run as (...args: unknown[]) => { changes: number; lastInsertRowid: number })(...params)
        return { changes: result.changes, lastInsertRowid: result.lastInsertRowid }
      },
      get: (...params: unknown[]) => (stmt.get as (...args: unknown[]) => unknown)(...params),
      all: (...params: unknown[]) => (stmt.all as (...args: unknown[]) => unknown[])(...params),
    }
  }

  query(sql: string) {
    return this.prepare(sql)
  }

  exec(sql: string) {
    this.db.exec(sql)
  }

  run(sql: string, ...params: unknown[]) {
    const stmt = this.db.prepare(sql)
    const result = (stmt.run as (...args: unknown[]) => { changes: number; lastInsertRowid: number })(...params)
    return { changes: result.changes, lastInsertRowid: result.lastInsertRowid }
  }

  transaction<T extends (...args: unknown[]) => void>(fn: T) {
    return (...args: unknown[]) => {
      const nested = this.transactionDepth > 0
      const savepoint = `ocm_sp_${this.transactionDepth}`
      if (nested) {
        this.db.exec(`SAVEPOINT ${savepoint}`)
      } else {
        this.db.exec('BEGIN')
      }
      this.transactionDepth += 1
      try {
        const result = fn(...args)
        if (nested) {
          this.db.exec(`RELEASE ${savepoint}`)
        } else {
          this.db.exec('COMMIT')
        }
        return result
      } catch (e) {
        if (nested) {
          this.db.exec(`ROLLBACK TO ${savepoint}`)
          this.db.exec(`RELEASE ${savepoint}`)
        } else {
          this.db.exec('ROLLBACK')
        }
        throw e
      } finally {
        this.transactionDepth -= 1
      }
    }
  }

  close() {
    this.db.close()
  }
}
