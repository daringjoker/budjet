import { describe, it, expect } from 'vitest'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { accounts, categories, rawEmails } from '../schema/index.js'
import * as schema from '../schema/index.js'

function createTestDb() {
  const sqlite = new Database(':memory:')
  sqlite.pragma('foreign_keys = ON')
  const db = drizzle(sqlite, { schema })
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      bank_name TEXT,
      email_sender TEXT,
      currency TEXT NOT NULL DEFAULT 'NPR',
      initial_balance REAL NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      color TEXT NOT NULL DEFAULT '#6366f1',
      parent_id INTEGER REFERENCES categories(id)
    );
    CREATE TABLE IF NOT EXISTS raw_emails (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      message_id TEXT NOT NULL UNIQUE,
      sender TEXT NOT NULL,
      subject TEXT NOT NULL,
      body_text TEXT NOT NULL,
      received_at INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'unknown',
      account_id INTEGER REFERENCES accounts(id)
    );
  `)
  return db
}

describe('accounts schema', () => {
  it('inserts and retrieves an account', async () => {
    const db = createTestDb()
    await db.insert(accounts).values({
      name: 'NMB Savings',
      type: 'bank',
      bankName: 'NMB Bank',
      emailSender: 'alerts@nmb.com.np',
      currency: 'NPR',
      initialBalance: 0,
      createdAt: new Date(),
    })
    const result = await db.select().from(accounts)
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('NMB Savings')
    expect(result[0].type).toBe('bank')
  })
})

describe('categories schema', () => {
  it('inserts a category with a subcategory', async () => {
    const db = createTestDb()
    const [parent] = await db.insert(categories).values({ name: 'Food', color: '#ef4444' }).returning()
    await db.insert(categories).values({ name: 'Restaurants', color: '#f97316', parentId: parent.id })
    const result = await db.select().from(categories)
    expect(result).toHaveLength(2)
    expect(result[1].parentId).toBe(parent.id)
  })
})

describe('raw_emails schema', () => {
  it('enforces unique message_id', async () => {
    const db = createTestDb()
    const [acct] = await db.insert(accounts).values({
      name: 'NMB Savings', type: 'bank', currency: 'NPR', initialBalance: 0, createdAt: new Date()
    }).returning()
    await db.insert(rawEmails).values({
      messageId: 'unique-id-1',
      sender: 'alerts@nmb.com.np',
      subject: 'Transaction Alert',
      bodyText: 'You spent NPR 500',
      receivedAt: new Date(),
      status: 'processed',
      accountId: acct.id,
    })
    await expect(
      db.insert(rawEmails).values({
        messageId: 'unique-id-1',
        sender: 'alerts@nmb.com.np',
        subject: 'Duplicate',
        bodyText: 'Duplicate',
        receivedAt: new Date(),
        status: 'unknown',
      })
    ).rejects.toThrow()
  })
})
