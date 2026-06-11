import { z } from 'zod'
import { router, publicProcedure } from '../trpc.js'
import { transactions, transactionCategories, categories } from '@budjet/shared/schema'
import { eq, and, gte, lte, sum, desc, sql } from 'drizzle-orm'

export const reportsRouter = router({
  summary: publicProcedure
    .input(z.object({
      from: z.string().datetime(),
      to: z.string().datetime(),
      accountId: z.number().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const baseFilters = [
        gte(transactions.date, new Date(input.from)),
        lte(transactions.date, new Date(input.to)),
      ]
      if (input.accountId) baseFilters.push(eq(transactions.accountId, input.accountId))

      const [{ totalIn }] = await ctx.db
        .select({ totalIn: sum(transactions.amount) })
        .from(transactions)
        .where(and(...baseFilters, eq(transactions.type, 'credit')))

      const [{ totalOut }] = await ctx.db
        .select({ totalOut: sum(transactions.amount) })
        .from(transactions)
        .where(and(...baseFilters, eq(transactions.type, 'debit')))

      const [{ count }] = await ctx.db
        .select({ count: sql`count(*)` })
        .from(transactions)
        .where(and(...baseFilters))

      const tin = Number(totalIn ?? 0)
      const tout = Number(totalOut ?? 0)
      return { totalIn: tin, totalOut: tout, net: tin - tout, transactionCount: Number(count) }
    }),

  categoryBreakdown: publicProcedure
    .input(z.object({
      from: z.string().datetime(),
      to: z.string().datetime(),
      accountId: z.number().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const filters = [
        gte(transactions.date, new Date(input.from)),
        lte(transactions.date, new Date(input.to)),
        eq(transactions.type, 'debit'),
      ]
      if (input.accountId) filters.push(eq(transactions.accountId, input.accountId))

      const rows = await ctx.db
        .select({
          categoryId: transactionCategories.categoryId,
          categoryName: categories.name,
          categoryColor: categories.color,
          total: sum(transactions.amount),
        })
        .from(transactions)
        .innerJoin(transactionCategories, eq(transactionCategories.transactionId, transactions.id))
        .innerJoin(categories, eq(categories.id, transactionCategories.categoryId))
        .where(and(...filters))
        .groupBy(transactionCategories.categoryId, categories.name, categories.color)
        .orderBy(desc(sum(transactions.amount)))

      return rows.map(r => ({ ...r, total: Number(r.total ?? 0) }))
    }),
})
