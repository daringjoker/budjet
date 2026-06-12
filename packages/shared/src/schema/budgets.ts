import { sqliteTable, integer, text, real } from 'drizzle-orm/sqlite-core'
import { accounts } from './accounts.js'
import { categories } from './categories.js'

export const budgets = sqliteTable('budgets', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  categoryId: integer('category_id').references(() => categories.id),
  accountId: integer('account_id').references(() => accounts.id),
  amount: real('amount').notNull(),
  period: text('period', { enum: ['monthly', 'weekly', 'yearly', 'custom'] }).notNull(),
  // Which calendar the period tracks: Gregorian months/years or Bikram Sambat
  calendar: text('calendar', { enum: ['ad', 'bs'] }).notNull().default('ad'),
  startDate: integer('start_date', { mode: 'timestamp' }).notNull(),
  endDate: integer('end_date', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
})

export const budgetAlerts = sqliteTable('budget_alerts', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  budgetId: integer('budget_id').notNull().references(() => budgets.id),
  threshold: real('threshold').notNull(),
  notifiedAt: integer('notified_at', { mode: 'timestamp' }),
})

export type Budget = typeof budgets.$inferSelect
export type NewBudget = typeof budgets.$inferInsert
export type BudgetAlert = typeof budgetAlerts.$inferSelect
