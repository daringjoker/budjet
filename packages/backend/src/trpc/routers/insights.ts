import { z } from 'zod'
import { router, publicProcedure } from '../trpc.js'
import { transactions, transactionCategories, categories } from '@budjet/shared/schema'
import { bsMonthWindow, currentBsMonth, addBsMonths, adToBs, bsToAd, daysInBsMonth } from '@budjet/shared'
import { eq, and, gte, lt, sum, sql } from 'drizzle-orm'
import type { Db } from '../../db/index.js'

interface Window { start: Date; end: Date }

function monthWindow(year: number, month: number): Window {
  return { start: new Date(year, month, 1), end: new Date(year, month + 1, 1) }
}

async function totalsFor(db: Db, w: Window) {
  const [row] = await db
    .select({
      totalIn: sql<number>`coalesce(sum(case when ${transactions.type} = 'credit' then ${transactions.amount} end), 0)`,
      totalOut: sql<number>`coalesce(sum(case when ${transactions.type} = 'debit' then ${transactions.amount} end), 0)`,
      count: sql<number>`count(*)`,
    })
    .from(transactions)
    .where(and(gte(transactions.date, w.start), lt(transactions.date, w.end)))
  const totalIn = Number(row.totalIn)
  const totalOut = Number(row.totalOut)
  return {
    totalIn,
    totalOut,
    net: totalIn - totalOut,
    count: Number(row.count),
    savingsRate: totalIn > 0 ? (totalIn - totalOut) / totalIn : null,
  }
}

async function categorySpend(db: Db, w: Window): Promise<Map<number, { name: string; color: string; total: number }>> {
  const rows = await db
    .select({
      categoryId: transactionCategories.categoryId,
      name: categories.name,
      color: categories.color,
      total: sum(transactions.amount),
    })
    .from(transactions)
    .innerJoin(transactionCategories, eq(transactionCategories.transactionId, transactions.id))
    .innerJoin(categories, eq(categories.id, transactionCategories.categoryId))
    .where(and(
      eq(transactions.type, 'debit'),
      gte(transactions.date, w.start),
      lt(transactions.date, w.end),
    ))
    .groupBy(transactionCategories.categoryId, categories.name, categories.color)
  return new Map(rows.map(r => [r.categoryId, { name: r.name, color: r.color, total: Number(r.total ?? 0) }]))
}

export const insightsRouter = router({
  monthly: publicProcedure
    .input(z.object({
      // "2026-06" (AD) or "2083-02" (BS); defaults to the current month
      month: z.string().regex(/^\d{4}-\d{2}$/).optional(),
      calendar: z.enum(['ad', 'bs']).default('ad'),
    }).optional())
    .query(async ({ ctx, input }) => {
      const now = new Date()
      const calendar = input?.calendar ?? 'ad'

      let y: number, m: number
      let cur: Window
      let prev: Window
      // Day-of-period bookkeeping for the pace section
      let dayOfPeriod: number
      let daysInPeriod: number
      let prevSamePointEnd: Date

      if (calendar === 'bs') {
        const fallback = currentBsMonth(now)
        ;[y, m] = input?.month ? input.month.split('-').map(Number) : [fallback.year, fallback.month]
        cur = bsMonthWindow(y, m)
        const prevYm = addBsMonths(y, m, -1)
        prev = bsMonthWindow(prevYm.year, prevYm.month)
        dayOfPeriod = adToBs(now).date
        daysInPeriod = daysInBsMonth(y, m)
        const clamped = Math.min(dayOfPeriod, daysInBsMonth(prevYm.year, prevYm.month))
        prevSamePointEnd = new Date(bsToAd(prevYm.year, prevYm.month, clamped).getTime() + 86_400_000)
      } else {
        ;[y, m] = input?.month ? input.month.split('-').map(Number) : [now.getFullYear(), now.getMonth() + 1]
        cur = monthWindow(y, m - 1)
        prev = monthWindow(y, m - 2)
        dayOfPeriod = now.getDate()
        daysInPeriod = new Date(y, m, 0).getDate()
        prevSamePointEnd = new Date(prev.start.getFullYear(), prev.start.getMonth(), dayOfPeriod + 1)
      }
      const isCurrentMonth = now >= cur.start && now < cur.end

      const [thisMonth, lastMonth, curCats, prevCats] = await Promise.all([
        totalsFor(ctx.db, cur),
        totalsFor(ctx.db, prev),
        categorySpend(ctx.db, cur),
        categorySpend(ctx.db, prev),
      ])

      // Category movers: biggest absolute spending changes vs last month
      const allCatIds = new Set([...curCats.keys(), ...prevCats.keys()])
      const movers = [...allCatIds]
        .map(id => {
          const c = curCats.get(id)
          const p = prevCats.get(id)
          return {
            categoryId: id,
            categoryName: (c ?? p)!.name,
            categoryColor: (c ?? p)!.color,
            current: c?.total ?? 0,
            previous: p?.total ?? 0,
            delta: (c?.total ?? 0) - (p?.total ?? 0),
          }
        })
        .filter(mv => Math.abs(mv.delta) >= 1)
        .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
        .slice(0, 6)

      // Largest debits of the month
      const largest = await ctx.db
        .select({
          id: transactions.id,
          date: transactions.date,
          description: transactions.description,
          merchant: transactions.merchant,
          amount: transactions.amount,
        })
        .from(transactions)
        .where(and(
          eq(transactions.type, 'debit'),
          gte(transactions.date, cur.start),
          lt(transactions.date, cur.end),
        ))
        .orderBy(sql`${transactions.amount} desc`)
        .limit(5)

      // Unusual: this month's debits >= 3x their category's 90-day median
      // (and above a noise floor)
      const lookback = new Date(cur.end.getTime() - 90 * 86_400_000)
      const history = await ctx.db
        .select({
          amount: transactions.amount,
          categoryId: transactionCategories.categoryId,
        })
        .from(transactions)
        .innerJoin(transactionCategories, eq(transactionCategories.transactionId, transactions.id))
        .where(and(
          eq(transactions.type, 'debit'),
          gte(transactions.date, lookback),
          lt(transactions.date, cur.end),
        ))
      const byCat = new Map<number, number[]>()
      for (const h of history) {
        if (!byCat.has(h.categoryId)) byCat.set(h.categoryId, [])
        byCat.get(h.categoryId)!.push(h.amount)
      }
      const medians = new Map<number, number>()
      for (const [id, amounts] of byCat) {
        const sorted = [...amounts].sort((a, b) => a - b)
        medians.set(id, sorted[Math.floor(sorted.length / 2)])
      }

      const monthTxns = await ctx.db
        .select({
          id: transactions.id,
          date: transactions.date,
          description: transactions.description,
          merchant: transactions.merchant,
          amount: transactions.amount,
          categoryId: transactionCategories.categoryId,
          categoryName: categories.name,
        })
        .from(transactions)
        .innerJoin(transactionCategories, eq(transactionCategories.transactionId, transactions.id))
        .innerJoin(categories, eq(categories.id, transactionCategories.categoryId))
        .where(and(
          eq(transactions.type, 'debit'),
          gte(transactions.date, cur.start),
          lt(transactions.date, cur.end),
        ))
      const unusual = monthTxns
        .filter(t => {
          const median = medians.get(t.categoryId)
          return median !== undefined && t.amount >= 500 && t.amount >= 3 * median
        })
        .map(t => ({ ...t, categoryMedian: medians.get(t.categoryId)! }))
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 5)

      // Spending pace: compare to the same day-of-period last month and
      // project the period-end total at the current daily rate
      let pace = null
      if (isCurrentMonth) {
        const [prevToDate] = await ctx.db
          .select({ out: sql<number>`coalesce(sum(case when ${transactions.type} = 'debit' then ${transactions.amount} end), 0)` })
          .from(transactions)
          .where(and(gte(transactions.date, prev.start), lt(transactions.date, prevSamePointEnd)))
        pace = {
          spentSoFar: thisMonth.totalOut,
          lastMonthSamePoint: Number(prevToDate.out),
          monthElapsedPct: Math.round((dayOfPeriod / daysInPeriod) * 100),
          projectedOut: dayOfPeriod > 0 ? Math.round((thisMonth.totalOut / dayOfPeriod) * daysInPeriod) : 0,
        }
      }

      return {
        month: `${y}-${String(m).padStart(2, '0')}`,
        calendar,
        isCurrentMonth,
        thisMonth,
        lastMonth,
        movers,
        largest,
        unusual,
        pace,
      }
    }),
})
