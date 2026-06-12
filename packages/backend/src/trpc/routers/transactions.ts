import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { router, publicProcedure } from '../trpc.js'
import { transactions, transactionCategories, categories } from '@budjet/shared/schema'
import { DEFAULT_CONFIDENCE_THRESHOLD } from '@budjet/shared'
import { eq, and, gte, lte, lt, isNotNull, desc, inArray, or, sql } from 'drizzle-orm'
import type { Db } from '../../db/index.js'

async function txnIdsForCategory(db: Db, categoryId: number): Promise<number[]> {
  const rows = await db
    .select({ id: transactionCategories.transactionId })
    .from(transactionCategories)
    .where(eq(transactionCategories.categoryId, categoryId))
  return rows.map(r => r.id)
}

/** Replace a transaction's category assignment (single-category model). */
async function setCategory(db: Db, transactionId: number, categoryId: number | null) {
  await db.delete(transactionCategories).where(eq(transactionCategories.transactionId, transactionId))
  if (categoryId !== null) {
    await db.insert(transactionCategories).values({ transactionId, categoryId }).onConflictDoNothing()
  }
}

export const transactionsRouter = router({
  list: publicProcedure
    .input(z.object({
      accountId: z.number().optional(),
      type: z.enum(['debit', 'credit']).optional(),
      categoryId: z.number().optional(),
      merchant: z.string().optional(),
      q: z.string().optional(),
      from: z.string().datetime().optional(),
      to: z.string().datetime().optional(),
      lowConfidenceOnly: z.boolean().optional(),
      limit: z.number().default(100),
    }).optional())
    .query(async ({ ctx, input }) => {
      const filters = []
      if (input?.accountId) filters.push(eq(transactions.accountId, input.accountId))
      if (input?.type) filters.push(eq(transactions.type, input.type))
      if (input?.merchant) filters.push(eq(transactions.merchant, input.merchant))
      if (input?.q && input.q.trim().length > 0) {
        const pat = `%${input.q.trim().toLowerCase()}%`
        filters.push(or(
          sql`lower(${transactions.description}) LIKE ${pat}`,
          sql`lower(coalesce(${transactions.remarks}, '')) LIKE ${pat}`,
          sql`lower(coalesce(${transactions.merchant}, '')) LIKE ${pat}`,
        )!)
      }
      if (input?.from) filters.push(gte(transactions.date, new Date(input.from)))
      if (input?.to) filters.push(lte(transactions.date, new Date(input.to)))
      if (input?.lowConfidenceOnly) {
        filters.push(lt(transactions.llmConfidence, DEFAULT_CONFIDENCE_THRESHOLD))
        filters.push(isNotNull(transactions.llmConfidence))
      }
      if (input?.categoryId) {
        const ids = await txnIdsForCategory(ctx.db, input.categoryId)
        if (ids.length === 0) return []
        filters.push(inArray(transactions.id, ids))
      }

      const rows = await ctx.db
        .select({
          txn: transactions,
          categoryId: transactionCategories.categoryId,
          categoryName: categories.name,
          categoryColor: categories.color,
        })
        .from(transactions)
        .leftJoin(transactionCategories, eq(transactionCategories.transactionId, transactions.id))
        .leftJoin(categories, eq(categories.id, transactionCategories.categoryId))
        .where(filters.length ? and(...filters) : undefined)
        .orderBy(desc(transactions.date))
        .limit(input?.limit ?? 100)

      // A transaction holds at most one category in our model; the join is 1:0..1
      return rows.map(r => ({
        ...r.txn,
        categoryId: r.categoryId,
        categoryName: r.categoryName,
        categoryColor: r.categoryColor,
      }))
    }),

  create: publicProcedure
    .input(z.object({
      accountId: z.number(),
      date: z.string().datetime(),
      amount: z.number().positive(),
      type: z.enum(['debit', 'credit']),
      description: z.string().min(1),
      remarks: z.string().optional(),
      merchant: z.string().optional(),
      currency: z.string().default('NPR'),
      balanceAfter: z.number().optional(),
      source: z.enum(['email', 'manual']),
      llmConfidence: z.number().min(0).max(1).optional(),
      categoryId: z.number().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { categoryId, ...data } = input
      const [created] = await ctx.db.insert(transactions).values({
        ...data,
        date: new Date(input.date),
        createdAt: new Date(),
      }).returning()
      if (categoryId !== undefined) {
        await setCategory(ctx.db, created.id, categoryId)
      }
      return created
    }),

  update: publicProcedure
    .input(z.object({
      id: z.number(),
      accountId: z.number().optional(),
      date: z.string().datetime().optional(),
      description: z.string().min(1).optional(),
      remarks: z.string().nullable().optional(),
      merchant: z.string().nullable().optional(),
      type: z.enum(['debit', 'credit']).optional(),
      amount: z.number().positive().optional(),
      categoryId: z.number().nullable().optional(), // null clears the category
    }))
    .mutation(async ({ ctx, input }) => {
      const { id, categoryId, date, ...data } = input
      const patch: Record<string, unknown> = { ...data }
      if (date !== undefined) patch.date = new Date(date)
      if (Object.keys(patch).length === 0 && categoryId === undefined) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'No fields to update' })
      }

      let updated
      if (Object.keys(patch).length > 0) {
        ;[updated] = await ctx.db.update(transactions).set(patch).where(eq(transactions.id, id)).returning()
        if (!updated) throw new TRPCError({ code: 'NOT_FOUND' })
      } else {
        ;[updated] = await ctx.db.select().from(transactions).where(eq(transactions.id, id))
        if (!updated) throw new TRPCError({ code: 'NOT_FOUND' })
      }

      if (categoryId !== undefined) {
        await setCategory(ctx.db, id, categoryId)
      }
      return updated
    }),

  delete: publicProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.delete(transactionCategories).where(eq(transactionCategories.transactionId, input.id))
      const [deleted] = await ctx.db.delete(transactions).where(eq(transactions.id, input.id)).returning()
      if (!deleted) throw new TRPCError({ code: 'NOT_FOUND' })
      return deleted
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
