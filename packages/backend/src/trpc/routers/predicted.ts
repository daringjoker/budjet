import { z } from 'zod'
import { router, publicProcedure } from '../trpc.js'
import { predictedTransactions } from '@budjet/shared/schema'
import { eq } from 'drizzle-orm'

export const predictedRouter = router({
  list: publicProcedure
    .input(z.object({ status: z.enum(['pending', 'matched', 'missed']).optional() }).optional())
    .query(async ({ ctx, input }) => {
      if (input?.status) {
        return ctx.db.select().from(predictedTransactions).where(eq(predictedTransactions.status, input.status))
      }
      return ctx.db.select().from(predictedTransactions)
    }),

  createAnticipated: publicProcedure
    .input(z.object({
      accountId: z.number(),
      categoryId: z.number().optional(),
      predictedAmount: z.number().positive(),
      predictedDate: z.string().datetime(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const [created] = await ctx.db.insert(predictedTransactions).values({
        ...input,
        type: 'anticipated',
        predictedDate: new Date(input.predictedDate),
        confidence: 1.0,
        status: 'pending',
        createdAt: new Date(),
      }).returning()
      return created
    }),
})
