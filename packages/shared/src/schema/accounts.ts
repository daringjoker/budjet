import { sqliteTable, integer, text, real } from 'drizzle-orm/sqlite-core'

export const accounts = sqliteTable('accounts', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  type: text('type', {
    enum: ['bank', 'cash', 'debit_card', 'credit_card', 'fund', 'investment'],
  }).notNull(),
  bankName: text('bank_name'),
  emailSender: text('email_sender'),
  currency: text('currency').notNull().default('NPR'),
  initialBalance: real('initial_balance').notNull().default(0),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
})

export type Account = typeof accounts.$inferSelect
export type NewAccount = typeof accounts.$inferInsert
