import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { router, publicProcedure } from '../trpc.js'
import { accounts, transactions } from '@budjet/shared/schema'
import { eq, sql } from 'drizzle-orm'
import type { Db } from '../../db/index.js'

async function computedBalance(db: Db, accountId: number, initialBalance: number): Promise<number> {
  const [row] = await db
    .select({
      delta: sql<number>`coalesce(sum(case when ${transactions.type} = 'credit' then ${transactions.amount} else -${transactions.amount} end), 0)`,
    })
    .from(transactions)
    .where(eq(transactions.accountId, accountId))
  return initialBalance + Number(row.delta)
}

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
      emailSender: z.string().email().nullable().optional(),
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

  /**
   * Set the account's REAL current balance. Adjusts initialBalance so the
   * computed balance (initial + credits − debits) equals what the user
   * actually has — past and future numbers all line up after this.
   */
  reconcile: publicProcedure
    .input(z.object({ id: z.number(), actualBalance: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const [account] = await ctx.db.select().from(accounts).where(eq(accounts.id, input.id))
      if (!account) throw new TRPCError({ code: 'NOT_FOUND' })

      const current = await computedBalance(ctx.db, account.id, account.initialBalance)
      const adjustment = input.actualBalance - current
      const [updated] = await ctx.db
        .update(accounts)
        .set({ initialBalance: account.initialBalance + adjustment })
        .where(eq(accounts.id, account.id))
        .returning()
      return { account: updated, adjustment, balance: input.actualBalance }
    }),

  delete: publicProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const [{ txnCount }] = await ctx.db
        .select({ txnCount: sql<number>`count(*)` })
        .from(transactions)
        .where(eq(transactions.accountId, input.id))
      if (Number(txnCount) > 0) {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: `Account has ${txnCount} transaction(s). Move or delete them first.`,
        })
      }
      const [deleted] = await ctx.db.delete(accounts).where(eq(accounts.id, input.id)).returning()
      if (!deleted) throw new TRPCError({ code: 'NOT_FOUND' })
      return deleted
    }),
})
