import { and, eq, gte, lte, sum } from 'drizzle-orm'
import { transactions, predictedTransactions, budgets, budgetAlerts, recurringTransactions } from '@budjet/shared/schema'
import type { Db } from '../db/index.js'

export async function runNightlyForecast(db: Db, lookbackDays: number): Promise<{ missed: number; predictions: number; alertsFired: number }> {
  const now = new Date()
  let predictionsCreated = 0
  let alertsFired = 0

  // 1. Mark missed predicted transactions
  const pendingPast = await db.select().from(predictedTransactions)
    .where(and(eq(predictedTransactions.status, 'pending'), lte(predictedTransactions.predictedDate, now)))
  for (const p of pendingPast) {
    await db.update(predictedTransactions).set({ status: 'missed' }).where(eq(predictedTransactions.id, p.id))
  }

  // 2. Generate recurring predicted entries for next 30 days
  const activeRecurring = await db.select().from(recurringTransactions).where(eq(recurringTransactions.status, 'active'))
  const horizon = new Date(now.getTime() + lookbackDays * 86_400_000)

  for (const r of activeRecurring) {
    let next = r.nextDueDate
    while (next <= horizon) {
      const exists = await db.select({ id: predictedTransactions.id })
        .from(predictedTransactions)
        .where(and(
          eq(predictedTransactions.recurringId, r.id),
          eq(predictedTransactions.status, 'pending'),
          gte(predictedTransactions.predictedDate, new Date(next.getTime() - r.toleranceDays * 86_400_000)),
          lte(predictedTransactions.predictedDate, new Date(next.getTime() + r.toleranceDays * 86_400_000)),
        ))
      if (!exists.length) {
        await db.insert(predictedTransactions).values({
          type: 'recurring',
          recurringId: r.id,
          accountId: r.accountId,
          categoryId: r.categoryId,
          predictedAmount: r.amount,
          predictedDate: next,
          confidence: 0.9,
          basis: 'recurring_pattern',
          status: 'pending',
          createdAt: now,
        })
        predictionsCreated++
      }
      next = advanceByFrequency(next, r.frequency)
    }
  }

  // 3. Check budget alerts
  const allBudgets = await db.select().from(budgets)
  for (const budget of allBudgets) {
    const { windowStart, windowEnd } = getBudgetWindow(budget, now)

    const [{ spent }] = await db.select({ spent: sum(transactions.amount) })
      .from(transactions)
      .where(and(
        eq(transactions.type, 'debit'),
        gte(transactions.date, windowStart),
        lte(transactions.date, windowEnd),
        budget.accountId ? eq(transactions.accountId, budget.accountId) : undefined,
      ))
    const spentNum = Number(spent ?? 0)
    const pct = spentNum / budget.amount

    const alerts = await db.select().from(budgetAlerts).where(eq(budgetAlerts.budgetId, budget.id))
    for (const alert of alerts) {
      if (pct >= alert.threshold) {
        const alreadyFired = alert.notifiedAt && alert.notifiedAt > windowStart
        if (!alreadyFired) {
          console.warn(`[BUDGET ALERT] "${budget.name}" is at ${Math.round(pct * 100)}% (threshold: ${alert.threshold * 100}%)`)
          await db.update(budgetAlerts).set({ notifiedAt: now }).where(eq(budgetAlerts.id, alert.id))
          alertsFired++
        }
      }
    }
  }

  return { missed: pendingPast.length, predictions: predictionsCreated, alertsFired }
}

function advanceByFrequency(date: Date, frequency: string): Date {
  const d = new Date(date)
  switch (frequency) {
    case 'daily': d.setDate(d.getDate() + 1); break
    case 'weekly': d.setDate(d.getDate() + 7); break
    case 'biweekly': d.setDate(d.getDate() + 14); break
    case 'monthly': d.setMonth(d.getMonth() + 1); break
    case 'quarterly': d.setMonth(d.getMonth() + 3); break
    case 'yearly': d.setFullYear(d.getFullYear() + 1); break
    default: throw new Error(`Unknown frequency: ${frequency}`)
  }
  return d
}

function getBudgetWindow(budget: { period: string; startDate: Date; endDate: Date | null }, now: Date): { windowStart: Date; windowEnd: Date } {
  switch (budget.period) {
    case 'monthly':
      return {
        windowStart: new Date(now.getFullYear(), now.getMonth(), 1),
        windowEnd: new Date(now.getFullYear(), now.getMonth() + 1, 0),
      }
    case 'weekly': {
      const day = now.getDay()
      return {
        windowStart: new Date(now.getFullYear(), now.getMonth(), now.getDate() - day),
        windowEnd: new Date(now.getFullYear(), now.getMonth(), now.getDate() - day + 7),
      }
    }
    case 'yearly':
      return {
        windowStart: new Date(now.getFullYear(), 0, 1),
        windowEnd: new Date(now.getFullYear(), 11, 31),
      }
    default:
      return {
        windowStart: budget.startDate,
        windowEnd: budget.endDate ?? now,
      }
  }
}
