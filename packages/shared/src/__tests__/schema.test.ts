import { describe, it, expect } from 'vitest'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { accounts, categories, rawEmails, transactions, transactionCategories, recurringTransactions, budgets, budgetAlerts, predictedTransactions } from '../schema/index.js'
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

function createFullTestDb() {
  const sqlite = new Database(':memory:')
  sqlite.pragma('foreign_keys = ON')
  const db = drizzle(sqlite, { schema })
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS accounts (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, type TEXT NOT NULL, bank_name TEXT, email_sender TEXT, currency TEXT NOT NULL DEFAULT 'NPR', initial_balance REAL NOT NULL DEFAULT 0, created_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS categories (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, color TEXT NOT NULL DEFAULT '#6366f1', parent_id INTEGER REFERENCES categories(id));
    CREATE TABLE IF NOT EXISTS raw_emails (id INTEGER PRIMARY KEY AUTOINCREMENT, message_id TEXT NOT NULL UNIQUE, sender TEXT NOT NULL, subject TEXT NOT NULL, body_text TEXT NOT NULL, received_at INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'unknown', account_id INTEGER REFERENCES accounts(id));
    CREATE TABLE IF NOT EXISTS recurring_transactions (id INTEGER PRIMARY KEY AUTOINCREMENT, account_id INTEGER NOT NULL REFERENCES accounts(id), category_id INTEGER REFERENCES categories(id), name TEXT NOT NULL, amount REAL NOT NULL, currency TEXT NOT NULL DEFAULT 'NPR', type TEXT NOT NULL, frequency TEXT NOT NULL, start_date INTEGER NOT NULL, end_date INTEGER, next_due_date INTEGER NOT NULL, last_matched_at INTEGER, auto_detected INTEGER NOT NULL DEFAULT 0, tolerance_amount REAL NOT NULL DEFAULT 0, tolerance_days INTEGER NOT NULL DEFAULT 3, status TEXT NOT NULL DEFAULT 'pending_confirmation', created_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS transactions (id INTEGER PRIMARY KEY AUTOINCREMENT, account_id INTEGER NOT NULL REFERENCES accounts(id), date INTEGER NOT NULL, amount REAL NOT NULL, type TEXT NOT NULL, description TEXT NOT NULL, remarks TEXT, merchant TEXT, currency TEXT NOT NULL DEFAULT 'NPR', balance_after REAL, source TEXT NOT NULL, raw_email_id INTEGER REFERENCES raw_emails(id), llm_confidence REAL, recurring_id INTEGER REFERENCES recurring_transactions(id), created_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS transaction_categories (transaction_id INTEGER NOT NULL REFERENCES transactions(id), category_id INTEGER NOT NULL REFERENCES categories(id), PRIMARY KEY (transaction_id, category_id));
    CREATE TABLE IF NOT EXISTS budgets (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, category_id INTEGER REFERENCES categories(id), account_id INTEGER REFERENCES accounts(id), amount REAL NOT NULL, period TEXT NOT NULL, start_date INTEGER NOT NULL, end_date INTEGER, created_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS budget_alerts (id INTEGER PRIMARY KEY AUTOINCREMENT, budget_id INTEGER NOT NULL REFERENCES budgets(id), threshold REAL NOT NULL, notified_at INTEGER);
    CREATE TABLE IF NOT EXISTS predicted_transactions (id INTEGER PRIMARY KEY AUTOINCREMENT, type TEXT NOT NULL, recurring_id INTEGER REFERENCES recurring_transactions(id), account_id INTEGER NOT NULL REFERENCES accounts(id), category_id INTEGER REFERENCES categories(id), predicted_amount REAL NOT NULL, predicted_date INTEGER NOT NULL, confidence REAL NOT NULL DEFAULT 1.0, basis TEXT, status TEXT NOT NULL DEFAULT 'pending', matched_transaction_id INTEGER REFERENCES transactions(id), notes TEXT, created_at INTEGER NOT NULL);
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

describe('transactions schema', () => {
  it('inserts a transaction linked to a raw email', async () => {
    const db = createFullTestDb()
    const [acct] = await db.insert(accounts).values({ name: 'NMB Savings', type: 'bank', currency: 'NPR', initialBalance: 0, createdAt: new Date() }).returning()
    const [email] = await db.insert(rawEmails).values({ messageId: 'msg-1', sender: 'alerts@nmb.com.np', subject: 'Txn', bodyText: 'body', receivedAt: new Date(), status: 'processed', accountId: acct.id }).returning()
    await db.insert(transactions).values({ accountId: acct.id, date: new Date(), amount: 1500, type: 'debit', description: 'Coffee', currency: 'NPR', source: 'email', rawEmailId: email.id, llmConfidence: 0.95, createdAt: new Date() })
    const result = await db.select().from(transactions)
    expect(result[0].amount).toBe(1500)
    expect(result[0].llmConfidence).toBe(0.95)
  })
})

describe('predicted_transactions schema', () => {
  it('stores an anticipated transaction with notes', async () => {
    const db = createFullTestDb()
    const [acct] = await db.insert(accounts).values({ name: 'Cash', type: 'cash', currency: 'NPR', initialBalance: 0, createdAt: new Date() }).returning()
    await db.insert(predictedTransactions).values({ type: 'anticipated', accountId: acct.id, predictedAmount: 15000, predictedDate: new Date(), confidence: 1.0, status: 'pending', notes: 'Monthly rent', createdAt: new Date() })
    const result = await db.select().from(predictedTransactions)
    expect(result[0].type).toBe('anticipated')
    expect(result[0].notes).toBe('Monthly rent')
  })
})
