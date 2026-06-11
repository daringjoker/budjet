import { and, eq, gte, lte, sum } from 'drizzle-orm'
import { transactions, predictedTransactions, budgets, budgetAlerts, recurringTransactions } from '@budjet/shared/schema'
import type { Db } from '../db/index.js'

export async function runNightlyForecast(db: Db, lookbackDays: number) {
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0)

  // 1. Mark missed predicted transactions
  const pendingPast = await db.select().from(predictedTransactions)
    .where(and(eq(predictedTransactions.status, 'pending'), lte(predictedTransactions.predictedDate, now)))
  for (const p of pendingPast) {
    await db.update(predictedTransactions).set({ status: 'missed' }).where(eq(predictedTransactions.id, p.id))
  }

  // 2. Generate recurring predicted entries for next 30 days
  const activeRecurring = await db.select().from(recurringTransactions).where(eq(recurringTransactions.status, 'active'))
  const horizon = new Date(now.getTime() + 30 * 86_400_000)

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
      }
      next = advanceByFrequency(next, r.frequency)
    }
  }

  // 3. Check budget alerts
  const allBudgets = await db.select().from(budgets)
  for (const budget of allBudgets) {
    const [{ spent }] = await db.select({ spent: sum(transactions.amount) })
      .from(transactions)
      .where(and(
        eq(transactions.type, 'debit'),
        gte(transactions.date, monthStart),
        lte(transactions.date, monthEnd),
        budget.accountId ? eq(transactions.accountId, budget.accountId) : undefined,
      ))
    const spentNum = Number(spent ?? 0)
    const pct = spentNum / budget.amount

    const alerts = await db.select().from(budgetAlerts).where(eq(budgetAlerts.budgetId, budget.id))
    for (const alert of alerts) {
      if (pct >= alert.threshold) {
        const alreadyFired = alert.notifiedAt && alert.notifiedAt > monthStart
        if (!alreadyFired) {
          console.warn(`[BUDGET ALERT] "${budget.name}" is at ${Math.round(pct * 100)}% (threshold: ${alert.threshold * 100}%)`)
          await db.update(budgetAlerts).set({ notifiedAt: now }).where(eq(budgetAlerts.id, alert.id))
        }
      }
    }
  }
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
  }
  return d
}
