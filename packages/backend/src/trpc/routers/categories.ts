import { z } from 'zod'
import { router, publicProcedure } from '../trpc.js'
import { categories, transactionCategories } from '@budjet/shared/schema'
import { eq, and } from 'drizzle-orm'

export const categoriesRouter = router({
  list: publicProcedure.query(({ ctx }) =>
    ctx.db.select().from(categories)
  ),

  create: publicProcedure
    .input(z.object({
      name: z.string().min(1),
      color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#6366f1'),
      parentId: z.number().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const [created] = await ctx.db.insert(categories).values(input).returning()
      return created
    }),

  assignToTransaction: publicProcedure
    .input(z.object({ transactionId: z.number(), categoryId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.insert(transactionCategories).values(input).onConflictDoNothing()
    }),

  removeFromTransaction: publicProcedure
    .input(z.object({ transactionId: z.number(), categoryId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.delete(transactionCategories)
        .where(and(eq(transactionCategories.transactionId, input.transactionId), eq(transactionCategories.categoryId, input.categoryId)))
    }),
})
