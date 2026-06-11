import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { router, publicProcedure } from '../trpc.js'
import { accounts } from '@budjet/shared/schema'
import { eq } from 'drizzle-orm'

const accountTypeEnum = z.enum(['bank', 'cash', 'debit_card', 'credit_card', 'fund', 'investment'])

export const accountsRouter = router({
  list: publicProcedure.query(({ ctx }) =>
    ctx.db.select().from(accounts)
  ),

  create: publicProcedure
    .input(z.object({
      name: z.string().min(1),
      type: accountTypeEnum,
      bankName: z.string().optional(),
      emailSender: z.string().email().optional(),
      currency: z.string().default('NPR'),
      initialBalance: z.number().default(0),
    }))
    .mutation(async ({ ctx, input }) => {
      const [created] = await ctx.db.insert(accounts).values({
        ...input,
        createdAt: new Date(),
      }).returning()
      return created
    }),

  update: publicProcedure
    .input(z.object({
      id: z.number(),
      name: z.string().min(1).optional(),
      type: accountTypeEnum.optional(),
      bankName: z.string().nullable().optional(),
      emailSender: z.string().email().optional(),
      currency: z.string().optional(),
      initialBalance: z.number().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input
      if (Object.keys(data).length === 0) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'No fields to update' })
      }
      const [updated] = await ctx.db.update(accounts).set(data).where(eq(accounts.id, id)).returning()
      if (!updated) {
        throw new TRPCError({ code: 'NOT_FOUND' })
      }
      return updated
    }),
})
