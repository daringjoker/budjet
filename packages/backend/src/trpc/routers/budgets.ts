import { z } from 'zod'
import { router, publicProcedure } from '../trpc.js'
import { budgets, budgetAlerts, transactions, transactionCategories } from '@budjet/shared/schema'
import { eq, and, gte, lte, inArray, sum } from 'drizzle-orm'
import { TRPCError } from '@trpc/server'

const periodEnum = z.enum(['monthly', 'weekly', 'yearly', 'custom'])

export const budgetsRouter = router({
  list: publicProcedure.query(({ ctx }) =>
    ctx.db.select().from(budgets)
  ),

  create: publicProcedure
    .input(z.object({
      name: z.string().min(1),
      categoryId: z.number().optional(),
      accountId: z.number().optional(),
      amount: z.number().positive(),
      period: periodEnum,
      startDate: z.string().datetime(),
      endDate: z.string().datetime().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const [created] = await ctx.db.insert(budgets).values({
        ...input,
        startDate: new Date(input.startDate),
        endDate: input.endDate ? new Date(input.endDate) : null,
        createdAt: new Date(),
      }).returning()
      return created
    }),

  progress: publicProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const [budget] = await ctx.db.select().from(budgets).where(eq(budgets.id, input.id))
      if (!budget) throw new TRPCError({ code: 'NOT_FOUND', message: 'Budget not found' })

      const now = new Date()
      let periodStart = budget.startDate
      let periodEnd = budget.endDate ?? now

      if (budget.period === 'monthly') {
        periodStart = new Date(now.getFullYear(), now.getMonth(), 1)
        periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0)
      } else if (budget.period === 'weekly') {
        const day = now.getDay()
        periodStart = new Date(now.getTime() - day * 86_400_000)
        periodEnd = new Date(periodStart.getTime() + 7 * 86_400_000)
      }

      const txnIds = budget.categoryId
        ? (await ctx.db.select({ id: transactionCategories.transactionId })
            .from(transactionCategories)
            .where(eq(transactionCategories.categoryId, budget.categoryId!))).map(r => r.id)
        : []

      const filters = [
        eq(transactions.type, 'debit'),
        gte(transactions.date, periodStart),
        lte(transactions.date, periodEnd),
      ]
      if (budget.accountId) filters.push(eq(transactions.accountId, budget.accountId))
      if (txnIds.length) filters.push(inArray(transactions.id, txnIds))

      const [{ total }] = await ctx.db
        .select({ total: sum(transactions.amount) })
        .from(transactions)
        .where(and(...filters))

      const spent = Number(total ?? 0)
      return {
        budgetId: budget.id,
        budgetName: budget.name,
        budgetAmount: budget.amount,
        spent,
        remaining: budget.amount - spent,
        percentUsed: Math.round((spent / budget.amount) * 100),
        periodStart,
        periodEnd,
      }
    }),
})
