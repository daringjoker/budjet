import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { router, publicProcedure } from '../trpc.js'
import { transactions } from '@budjet/shared/schema'
import { DEFAULT_CONFIDENCE_THRESHOLD } from '@budjet/shared'
import { eq, and, gte, lte, lt, isNotNull, desc } from 'drizzle-orm'

export const transactionsRouter = router({
  list: publicProcedure
    .input(z.object({
      accountId: z.number().optional(),
      type: z.enum(['debit', 'credit']).optional(),
      from: z.string().datetime().optional(),
      to: z.string().datetime().optional(),
      lowConfidenceOnly: z.boolean().optional(),
      limit: z.number().default(100),
    }).optional())
    .query(async ({ ctx, input }) => {
      const filters = []
      if (input?.accountId) filters.push(eq(transactions.accountId, input.accountId))
      if (input?.type) filters.push(eq(transactions.type, input.type))
      if (input?.from) filters.push(gte(transactions.date, new Date(input.from)))
      if (input?.to) filters.push(lte(transactions.date, new Date(input.to)))
      if (input?.lowConfidenceOnly) {
        filters.push(lt(transactions.llmConfidence, DEFAULT_CONFIDENCE_THRESHOLD))
        filters.push(isNotNull(transactions.llmConfidence))
      }
      return ctx.db.select().from(transactions)
        .where(filters.length ? and(...filters) : undefined)
        .orderBy(desc(transactions.date))
        .limit(input?.limit ?? 100)
    }),

  create: publicProcedure
    .input(z.object({
      accountId: z.number(),
      date: z.string().datetime(),
      amount: z.number().positive(),
      type: z.enum(['debit', 'credit']),
      description: z.string().min(1),
      currency: z.string().default('NPR'),
      balanceAfter: z.number().optional(),
      source: z.enum(['email', 'manual']),
      llmConfidence: z.number().min(0).max(1).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const [created] = await ctx.db.insert(transactions).values({
        ...input,
        date: new Date(input.date),
        createdAt: new Date(),
      }).returning()
      return created
    }),

  update: publicProcedure
    .input(z.object({
      id: z.number(),
      description: z.string().optional(),
      type: z.enum(['debit', 'credit']).optional(),
      amount: z.number().positive().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input
      if (Object.keys(data).length === 0) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'No fields to update' })
      }
      const [updated] = await ctx.db.update(transactions).set(data).where(eq(transactions.id, id)).returning()
      if (!updated) {
        throw new TRPCError({ code: 'NOT_FOUND' })
      }
      return updated
    }),

  review: publicProcedure
    .input(z.object({
      id: z.number(),
      description: z.string().optional(),
      amount: z.number().positive().optional(),
      type: z.enum(['debit', 'credit']).optional(),
      llmConfidence: z.number().nullable().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input
      if (Object.keys(data).length === 0) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'No fields to update' })
      }
      const [updated] = await ctx.db.update(transactions).set(data).where(eq(transactions.id, id)).returning()
      if (!updated) {
        throw new TRPCError({ code: 'NOT_FOUND' })
      }
      return updated
    }),
})
