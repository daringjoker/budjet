import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { router, publicProcedure } from '../trpc.js'
import { merchantRules, transactions } from '@budjet/shared/schema'
import { eq, or, sql } from 'drizzle-orm'
import { applyRuleToExisting } from '../../pipeline/merchant-rules.js'

export const merchantsRouter = router({
  rules: publicProcedure.query(({ ctx }) =>
    ctx.db.select().from(merchantRules)
  ),

  // How many existing transactions a pattern would tag — for UI feedback
  previewMatches: publicProcedure
    .input(z.object({ pattern: z.string().min(2) }))
    .query(async ({ ctx, input }) => {
      const pat = `%${input.pattern.toLowerCase()}%`
      const [{ count }] = await ctx.db
        .select({ count: sql<number>`count(*)` })
        .from(transactions)
        .where(or(
          sql`lower(coalesce(${transactions.remarks}, '')) LIKE ${pat}`,
          sql`lower(${transactions.description}) LIKE ${pat}`,
        ))
      return { count: Number(count) }
    }),

  createRule: publicProcedure
    .input(z.object({
      pattern: z.string().min(2),
      merchant: z.string().min(1),
      categoryId: z.number().optional(),
      applyToExisting: z.boolean().default(true),
    }))
    .mutation(async ({ ctx, input }) => {
      const [rule] = await ctx.db.insert(merchantRules).values({
        pattern: input.pattern,
        merchant: input.merchant,
        categoryId: input.categoryId ?? null,
        createdAt: new Date(),
      }).returning()

      let applied = 0
      if (input.applyToExisting) {
        applied = await applyRuleToExisting(ctx.db, rule)
      }
      return { rule, applied }
    }),

  deleteRule: publicProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const [deleted] = await ctx.db.delete(merchantRules).where(eq(merchantRules.id, input.id)).returning()
      if (!deleted) throw new TRPCError({ code: 'NOT_FOUND' })
      return deleted
    }),
})
