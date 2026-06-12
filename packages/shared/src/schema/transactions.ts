import { sqliteTable, integer, text, real, primaryKey } from 'drizzle-orm/sqlite-core'
import { accounts } from './accounts.js'
import { categories } from './categories.js'
import { rawEmails } from './raw-emails.js'
import { recurringTransactions } from './recurring.js'

export const transactions = sqliteTable('transactions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  accountId: integer('account_id').notNull().references(() => accounts.id),
  date: integer('date', { mode: 'timestamp' }).notNull(),
  amount: real('amount').notNull(),
  type: text('type', { enum: ['debit', 'credit'] }).notNull(),
  description: text('description').notNull(),
  remarks: text('remarks'),
  merchant: text('merchant'),
  currency: text('currency').notNull().default('NPR'),
  balanceAfter: real('balance_after'),
  source: text('source', { enum: ['email', 'manual'] }).notNull(),
  rawEmailId: integer('raw_email_id').references(() => rawEmails.id, { onDelete: 'set null' }),
  llmConfidence: real('llm_confidence'),
  recurringId: integer('recurring_id').references(() => recurringTransactions.id, { onDelete: 'set null' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
})

export const transactionCategories = sqliteTable(
  'transaction_categories',
  {
    transactionId: integer('transaction_id').notNull().references(() => transactions.id),
    categoryId: integer('category_id').notNull().references(() => categories.id),
  },
  (t) => ({ pk: primaryKey({ columns: [t.transactionId, t.categoryId] }) })
)

export type Transaction = typeof transactions.$inferSelect
export type NewTransaction = typeof transactions.$inferInsert
