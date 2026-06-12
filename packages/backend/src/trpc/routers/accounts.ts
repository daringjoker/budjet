import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { router, publicProcedure } from '../trpc.js'
import { accounts, transactions } from '@budjet/shared/schema'
import { eq, sql } from 'drizzle-orm'

const accountTypeEnum = z.enum(['bank', 'cash', 'debit_card', 'credit_card', 'fund', 'investment'])

export const accountsRouter = router({
  list: publicProcedure.query(({ ctx }) =>
    ctx.db.select().from(accounts)
  ),

  // Computed balances: initial + credits − debits
  balances: publicProcedure.query(async ({ ctx }) => {
    const accts = await ctx.db.select().from(accounts)
    const sums = await ctx.db
      .select({
        accountId: transactions.accountId,
        delta: sql<number>`sum(case when ${transactions.type} = 'credit' then ${transactions.amount} else -${transactions.amount} end)`,
      })
      .from(transactions)
      .groupBy(transactions.accountId)
    const deltaByAccount = new Map(sums.map(s => [s.accountId, Number(s.delta ?? 0)]))
    return accts.map(a => ({
      id: a.id,
      name: a.name,
      currency: a.currency,
      balance: a.initialBalance + (deltaByAccount.get(a.id) ?? 0),
    }))
  }),

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
