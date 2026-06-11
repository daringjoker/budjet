import { z } from 'zod'
import { router, publicProcedure } from '../trpc.js'
import { transactions, transactionCategories, categories } from '@budjet/shared/schema'
import { eq, and, gte, lte, sum, desc } from 'drizzle-orm'

export const reportsRouter = router({
  summary: publicProcedure
    .input(z.object({
      from: z.string().datetime(),
      to: z.string().datetime(),
      accountId: z.number().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const filters = [
        gte(transactions.date, new Date(input.from)),
        lte(transactions.date, new Date(input.to)),
      ]
      if (input.accountId) filters.push(eq(transactions.accountId, input.accountId))

      const allTxns = await ctx.db.select().from(transactions).where(and(...filters))
      const totalIn = allTxns.filter(t => t.type === 'credit').reduce((a, t) => a + t.amount, 0)
      const totalOut = allTxns.filter(t => t.type === 'debit').reduce((a, t) => a + t.amount, 0)
      return { totalIn, totalOut, net: totalIn - totalOut, transactionCount: allTxns.length }
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
