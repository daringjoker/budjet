import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import * as schema from '@budjet/shared/schema'
import { mkdirSync } from 'fs'
import { dirname, resolve } from 'path'
import { fileURLToPath } from 'url'

export function createDb(url: string) {
  if (url !== ':memory:') {
    mkdirSync(dirname(url), { recursive: true })
  }
  const sqlite = new Database(url, { timeout: 30000 })
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('foreign_keys = ON')
  const db = drizzle(sqlite, { schema })
  // Resolves to packages/backend/drizzle both from src/db/ (tsx, vitest) and dist/db/ (tsc build).
  const migrationsFolder = resolve(dirname(fileURLToPath(import.meta.url)), '../../drizzle')
  migrate(db, { migrationsFolder })
  return db
}

export type Db = ReturnType<typeof createDb>
