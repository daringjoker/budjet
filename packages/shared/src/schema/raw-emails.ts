import { sqliteTable, integer, text } from 'drizzle-orm/sqlite-core'
import { accounts } from './accounts.js'

export const rawEmails = sqliteTable('raw_emails', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  messageId: text('message_id').notNull().unique(),
  sender: text('sender').notNull(),
  subject: text('subject').notNull(),
  bodyText: text('body_text').notNull(),
  receivedAt: integer('received_at', { mode: 'timestamp' }).notNull(),
  status: text('status', { enum: ['processed', 'unknown', 'failed'] })
    .notNull()
    .default('unknown'),
  accountId: integer('account_id').references(() => accounts.id, { onDelete: 'set null' }),
})

export type RawEmail = typeof rawEmails.$inferSelect
export type NewRawEmail = typeof rawEmails.$inferInsert
