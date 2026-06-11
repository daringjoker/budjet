import { sqliteTable, integer, text, real } from 'drizzle-orm/sqlite-core'
import { accounts } from './accounts.js'
import { categories } from './categories.js'
import { recurringTransactions } from './recurring.js'
import { transactions } from './transactions.js'

export const predictedTransactions = sqliteTable('predicted_transactions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  type: text('type', { enum: ['recurring', 'forecast', 'anticipated'] }).notNull(),
  recurringId: integer('recurring_id').references(() => recurringTransactions.id, { onDelete: 'set null' }),
  accountId: integer('account_id').notNull().references(() => accounts.id),
  categoryId: integer('category_id').references(() => categories.id),
  predictedAmount: real('predicted_amount').notNull(),
  predictedDate: integer('predicted_date', { mode: 'timestamp' }).notNull(),
  confidence: real('confidence').notNull().default(1.0),
  basis: text('basis', {
    enum: ['recurring_pattern', 'historical_average', 'trend'],
  }),
  status: text('status', { enum: ['pending', 'matched', 'missed'] }).notNull().default('pending'),
  matchedTransactionId: integer('matched_transaction_id').references(() => transactions.id, { onDelete: 'set null' }),
  notes: text('notes'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
})

export type PredictedTransaction = typeof predictedTransactions.$inferSelect
export type NewPredictedTransaction = typeof predictedTransactions.$inferInsert
