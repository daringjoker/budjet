import { z } from 'zod'
import { router, publicProcedure } from '../trpc.js'
import { recurringTransactions, transactions } from '@budjet/shared/schema'
import { desc, eq } from 'drizzle-orm'
import { TRPCError } from '@trpc/server'
import { detectRecurring } from '../../pipeline/recurring-detector.js'

export const recurringRouter = router({
  list: publicProcedure
    .input(z.object({ status: z.enum(['active', 'pending_confirmation', 'paused']).optional() }).optional())
    .query(async ({ ctx, input }) => {
      if (input?.status) {
        return ctx.db.select().from(recurringTransactions).where(eq(recurringTransactions.status, input.status))
      }
      return ctx.db.select().from(recurringTransactions)
    }),

  confirm: publicProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const [updated] = await ctx.db.update(recurringTransactions)
        .set({ status: 'active' })
        .where(eq(recurringTransactions.id, input.id))
        .returning()
      if (!updated) throw new TRPCError({ code: 'NOT_FOUND' })
      return updated
    }),

  dismiss: publicProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.delete(recurringTransactions).where(eq(recurringTransactions.id, input.id))
    }),

  pause: publicProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const [updated] = await ctx.db.update(recurringTransactions)
        .set({ status: 'paused' })
        .where(eq(recurringTransactions.id, input.id))
        .returning()
      if (!updated) throw new TRPCError({ code: 'NOT_FOUND' })
      return updated
    }),

  resume: publicProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const [updated] = await ctx.db.update(recurringTransactions)
        .set({ status: 'active' })
        .where(eq(recurringTransactions.id, input.id))
        .returning()
      if (!updated) throw new TRPCError({ code: 'NOT_FOUND' })
      return updated
    }),

  // Retroactively scan all existing transactions for recurring patterns.
  // Safe to run multiple times — detectRecurring skips already-tracked combos.
  scan: publicProcedure.mutation(async ({ ctx }) => {
    const all = await ctx.db.select().from(transactions).orderBy(desc(transactions.date))

    // One representative (most recent) per (accountId, type, description) group
    const seen = new Set<string>()
    const representatives = []
    for (const txn of all) {
      const key = `${txn.accountId}:${txn.type}:${txn.description.toLowerCase()}`
      if (!seen.has(key)) {
        seen.add(key)
        representatives.push(txn)
      }
    }

    let detected = 0
    for (const txn of representatives) {
      const created = await detectRecurring(ctx.db, txn, 365)
      if (created) detected++
    }
    return { detected }
  }),
})
