import { z } from 'zod'
import { router, publicProcedure } from '../trpc.js'
import { recurringTransactions } from '@budjet/shared/schema'
import { eq } from 'drizzle-orm'
import { TRPCError } from '@trpc/server'

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
})
