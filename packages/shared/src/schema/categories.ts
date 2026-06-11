import { sqliteTable, integer, text } from 'drizzle-orm/sqlite-core'

export const categories = sqliteTable('categories', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  color: text('color').notNull().default('#6366f1'),
  parentId: integer('parent_id'),
})

export type Category = typeof categories.$inferSelect
export type NewCategory = typeof categories.$inferInsert
