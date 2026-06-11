import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import * as schema from '@budjet/shared/schema'
import { mkdirSync } from 'fs'
import { dirname } from 'path'

export function createDb(url: string) {
  if (url !== ':memory:') {
    mkdirSync(dirname(url), { recursive: true })
  }
  const sqlite = new Database(url)
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('foreign_keys = ON')
  const db = drizzle(sqlite, { schema })
  // Inline DDL — all tables. Used until drizzle-kit migrations are wired up.
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS accounts (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, type TEXT NOT NULL, bank_name TEXT, email_sender TEXT, currency TEXT NOT NULL DEFAULT 'NPR', initial_balance REAL NOT NULL DEFAULT 0, created_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS categories (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, color TEXT NOT NULL DEFAULT '#6366f1', parent_id INTEGER REFERENCES categories(id));
    CREATE TABLE IF NOT EXISTS raw_emails (id INTEGER PRIMARY KEY AUTOINCREMENT, message_id TEXT NOT NULL UNIQUE, sender TEXT NOT NULL, subject TEXT NOT NULL, body_text TEXT NOT NULL, received_at INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'unknown', account_id INTEGER REFERENCES accounts(id));
    CREATE TABLE IF NOT EXISTS recurring_transactions (id INTEGER PRIMARY KEY AUTOINCREMENT, account_id INTEGER NOT NULL REFERENCES accounts(id), category_id INTEGER REFERENCES categories(id), name TEXT NOT NULL, amount REAL NOT NULL, currency TEXT NOT NULL DEFAULT 'NPR', type TEXT NOT NULL, frequency TEXT NOT NULL, start_date INTEGER NOT NULL, end_date INTEGER, next_due_date INTEGER NOT NULL, last_matched_at INTEGER, auto_detected INTEGER NOT NULL DEFAULT 0, tolerance_amount REAL NOT NULL DEFAULT 0, tolerance_days INTEGER NOT NULL DEFAULT 3, status TEXT NOT NULL DEFAULT 'pending_confirmation', created_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS transactions (id INTEGER PRIMARY KEY AUTOINCREMENT, account_id INTEGER NOT NULL REFERENCES accounts(id), date INTEGER NOT NULL, amount REAL NOT NULL, type TEXT NOT NULL, description TEXT NOT NULL, currency TEXT NOT NULL DEFAULT 'NPR', balance_after REAL, source TEXT NOT NULL, raw_email_id INTEGER REFERENCES raw_emails(id), llm_confidence REAL, recurring_id INTEGER REFERENCES recurring_transactions(id), created_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS transaction_categories (transaction_id INTEGER NOT NULL REFERENCES transactions(id), category_id INTEGER NOT NULL REFERENCES categories(id), PRIMARY KEY (transaction_id, category_id));
    CREATE TABLE IF NOT EXISTS budgets (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, category_id INTEGER REFERENCES categories(id), account_id INTEGER REFERENCES accounts(id), amount REAL NOT NULL, period TEXT NOT NULL, start_date INTEGER NOT NULL, end_date INTEGER, created_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS budget_alerts (id INTEGER PRIMARY KEY AUTOINCREMENT, budget_id INTEGER NOT NULL REFERENCES budgets(id), threshold REAL NOT NULL, notified_at INTEGER);
    CREATE TABLE IF NOT EXISTS predicted_transactions (id INTEGER PRIMARY KEY AUTOINCREMENT, type TEXT NOT NULL, recurring_id INTEGER REFERENCES recurring_transactions(id), account_id INTEGER NOT NULL REFERENCES accounts(id), category_id INTEGER REFERENCES categories(id), predicted_amount REAL NOT NULL, predicted_date INTEGER NOT NULL, confidence REAL NOT NULL DEFAULT 1.0, basis TEXT, status TEXT NOT NULL DEFAULT 'pending', matched_transaction_id INTEGER REFERENCES transactions(id), notes TEXT, created_at INTEGER NOT NULL);
  `)
  return db
}

export type Db = ReturnType<typeof createDb>
