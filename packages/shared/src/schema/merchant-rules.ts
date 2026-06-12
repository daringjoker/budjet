import { sqliteTable, integer, text } from 'drizzle-orm/sqlite-core'
import { categories } from './categories.js'

/**
 * User-taught merchant tagging: when a transaction's remarks/description
 * contains `pattern` (case-insensitive), it belongs to `merchant` and
 * optionally gets `categoryId`.
 */
export const merchantRules = sqliteTable('merchant_rules', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  pattern: text('pattern').notNull(),
  merchant: text('merchant').notNull(),
  categoryId: integer('category_id').references(() => categories.id, { onDelete: 'set null' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
})

export type MerchantRule = typeof merchantRules.$inferSelect
