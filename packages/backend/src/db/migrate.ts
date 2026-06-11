import 'dotenv/config'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { mkdirSync } from 'fs'
import { dirname, resolve } from 'path'
import { fileURLToPath } from 'url'

const url = process.env.DATABASE_URL ?? './data/budjet.db'
mkdirSync(dirname(url), { recursive: true })

const sqlite = new Database(url, { timeout: 30000 })
sqlite.pragma('journal_mode = WAL')
sqlite.pragma('foreign_keys = ON')
const db = drizzle(sqlite)

const migrationsFolder = resolve(dirname(fileURLToPath(import.meta.url)), '../../drizzle')
migrate(db, { migrationsFolder })

console.log(`[DB] Migrations applied to ${url}`)
sqlite.close()
process.exit(0)
