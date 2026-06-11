import { sqliteTable, integer, text, real } from 'drizzle-orm/sqlite-core'
import { accounts } from './accounts.js'
import { categories } from './categories.js'

export const recurringTransactions = sqliteTable('recurring_transactions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  accountId: integer('account_id').notNull().references(() => accounts.id),
  categoryId: integer('category_id').references(() => categories.id),
  name: text('name').notNull(),
  amount: real('amount').notNull(),
  currency: text('currency').notNull().default('NPR'),
  type: text('type', { enum: ['debit', 'credit'] }).notNull(),
  frequency: text('frequency', {
    enum: ['daily', 'weekly', 'biweekly', 'monthly', 'quarterly', 'yearly'],
  }).notNull(),
  startDate: integer('start_date', { mode: 'timestamp' }).notNull(),
  endDate: integer('end_date', { mode: 'timestamp' }),
  nextDueDate: integer('next_due_date', { mode: 'timestamp' }).notNull(),
  lastMatchedAt: integer('last_matched_at', { mode: 'timestamp' }),
  autoDetected: integer('auto_detected', { mode: 'boolean' }).notNull().default(false),
  toleranceAmount: real('tolerance_amount').notNull().default(0),
  toleranceDays: integer('tolerance_days').notNull().default(3),
  status: text('status', { enum: ['active', 'pending_confirmation', 'paused'] })
    .notNull()
    .default('pending_confirmation'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
})

export type RecurringTransaction = typeof recurringTransactions.$inferSelect
export type NewRecurringTransaction = typeof recurringTransactions.$inferInsert
