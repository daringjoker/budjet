import { z } from 'zod'
import { router, publicProcedure } from '../trpc.js'
import { transactions, transactionCategories, categories } from '@budjet/shared/schema'
import { eq, and, gte, lte, sum, desc, sql, inArray, or, lt, isNotNull } from 'drizzle-orm'
import { DEFAULT_CONFIDENCE_THRESHOLD, currentBsMonth, addBsMonths, bsMonthWindow, bsMonthKey } from '@budjet/shared'

export const reportsRouter = router({
  summary: publicProcedure
    .input(z.object({
      from: z.string().datetime(),
      to: z.string().datetime(),
      accountId: z.number().optional(),
      categoryId: z.number().optional(),
      merchant: z.string().optional(),
      q: z.string().optional(),
      type: z.enum(['debit', 'credit']).optional(),
      lowConfidenceOnly: z.boolean().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const baseFilters = [
        gte(transactions.date, new Date(input.from)),
        lte(transactions.date, new Date(input.to)),
      ]
      if (input.accountId) baseFilters.push(eq(transactions.accountId, input.accountId))
      if (input.merchant) baseFilters.push(eq(transactions.merchant, input.merchant))
      if (input.type) baseFilters.push(eq(transactions.type, input.type))
      if (input.lowConfidenceOnly) {
        baseFilters.push(lt(transactions.llmConfidence, DEFAULT_CONFIDENCE_THRESHOLD))
        baseFilters.push(isNotNull(transactions.llmConfidence))
      }
      if (input.q && input.q.trim().length > 0) {
        const pat = `%${input.q.trim().toLowerCase()}%`
        baseFilters.push(or(
          sql`lower(${transactions.description}) LIKE ${pat}`,
          sql`lower(coalesce(${transactions.remarks}, '')) LIKE ${pat}`,
          sql`lower(coalesce(${transactions.merchant}, '')) LIKE ${pat}`,
        )!)
      }
      if (input.categoryId) {
        const ids = (await ctx.db
          .select({ id: transactionCategories.transactionId })
          .from(transactionCategories)
          .where(eq(transactionCategories.categoryId, input.categoryId))
        ).map(r => r.id)
        if (ids.length === 0) {
          return { totalIn: 0, totalOut: 0, net: 0, transactionCount: 0 }
        }
        baseFilters.push(inArray(transactions.id, ids))
      }

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

  // Per-month in/out totals for the last N months (inclusive of current)
  trend: publicProcedure
    .input(z.object({
      months: z.number().int().min(1).max(24).default(6),
      calendar: z.enum(['ad', 'bs']).default('ad'),
    }).optional())
    .query(async ({ ctx, input }) => {
      const months = input?.months ?? 6

      if (input?.calendar === 'bs') {
        // SQLite can't group by Bikram Sambat months — bucket in JS
        const now = currentBsMonth()
        const first = addBsMonths(now.year, now.month, -(months - 1))
        const start = bsMonthWindow(first.year, first.month).start
        const rows = await ctx.db
          .select({ date: transactions.date, type: transactions.type, amount: transactions.amount })
          .from(transactions)
          .where(gte(transactions.date, start))

        const buckets = new Map<string, { totalIn: number; totalOut: number }>()
        for (let i = 0; i < months; i++) {
          const ym = addBsMonths(first.year, first.month, i)
          buckets.set(`${ym.year}-${String(ym.month).padStart(2, '0')}`, { totalIn: 0, totalOut: 0 })
        }
        for (const t of rows) {
          const key = bsMonthKey(t.date)
          const bucket = buckets.get(key)
          if (!bucket) continue
          if (t.type === 'credit') bucket.totalIn += t.amount
          else bucket.totalOut += t.amount
        }
        return [...buckets.entries()].map(([month, b]) => ({
          month,
          totalIn: Math.round(b.totalIn * 100) / 100,
          totalOut: Math.round(b.totalOut * 100) / 100,
        }))
      }

      const start = new Date()
      start.setMonth(start.getMonth() - (months - 1), 1)
      start.setHours(0, 0, 0, 0)

      const month = sql<string>`strftime('%Y-%m', ${transactions.date}, 'unixepoch')`
      const rows = await ctx.db
        .select({
          month,
          totalIn: sql<number>`coalesce(sum(case when ${transactions.type} = 'credit' then ${transactions.amount} end), 0)`,
          totalOut: sql<number>`coalesce(sum(case when ${transactions.type} = 'debit' then ${transactions.amount} end), 0)`,
        })
        .from(transactions)
        .where(gte(transactions.date, start))
        .groupBy(month)
        .orderBy(month)

      return rows.map(r => ({ month: r.month, totalIn: Number(r.totalIn), totalOut: Number(r.totalOut) }))
    }),

  // Biggest debit destinations in the window, grouped by description
  topMerchants: publicProcedure
    .input(z.object({
      from: z.string().datetime(),
      to: z.string().datetime(),
      limit: z.number().int().min(1).max(50).default(10),
    }))
    .query(async ({ ctx, input }) => {
      // Tagged merchants group all their patterns together; untagged rows
      // fall back to grouping by description
      const label = sql<string>`coalesce(${transactions.merchant}, ${transactions.description})`
      const rows = await ctx.db
        .select({
          description: label,
          total: sum(transactions.amount),
          count: sql<number>`count(*)`,
          isMerchant: sql<number>`max(${transactions.merchant} is not null)`,
        })
        .from(transactions)
        .where(and(
          gte(transactions.date, new Date(input.from)),
          lte(transactions.date, new Date(input.to)),
          eq(transactions.type, 'debit'),
        ))
        .groupBy(label)
        .orderBy(desc(sum(transactions.amount)))
        .limit(input.limit)

      return rows.map(r => ({
        description: r.description,
        total: Number(r.total ?? 0),
        count: Number(r.count),
        isMerchant: Boolean(r.isMerchant),
      }))
    }),
})
