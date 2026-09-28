import { and, eq, gte, sql } from 'drizzle-orm'
import { transactions, recurringTransactions } from '@budjet/shared/schema'
import type { Db } from '../db/index.js'
import type { Transaction } from '@budjet/shared/schema'

const DEFAULT_LOOKBACK_DAYS = 90
const MIN_OCCURRENCES = 3

export async function detectRecurring(db: Db, txn: Transaction, lookbackDays = DEFAULT_LOOKBACK_DAYS): Promise<boolean> {
  if (!txn.description) return false

  // Skip if this description/account is already tracked
  const existing = await db.select({ id: recurringTransactions.id })
    .from(recurringTransactions)
    .where(and(
      eq(recurringTransactions.accountId, txn.accountId),
      eq(recurringTransactions.type, txn.type),
      sql`lower(${recurringTransactions.name}) = lower(${txn.description})`,
    ))
  if (existing.length > 0) return false

  const since = new Date(Date.now() - lookbackDays * 86_400_000)

  const similar = await db
    .select()
    .from(transactions)
    .where(
      and(
        eq(transactions.accountId, txn.accountId),
        eq(transactions.type, txn.type),
        gte(transactions.date, since),
        sql`lower(${transactions.description}) = lower(${txn.description})`
      )
    )
    .orderBy(transactions.date)

  if (similar.length < MIN_OCCURRENCES) return false

  const amounts = similar.map(t => t.amount)
  const avgAmount = amounts.reduce((a, b) => a + b, 0) / amounts.length

  // Estimate average interval in days
  const intervals: number[] = []
  for (let i = 1; i < similar.length; i++) {
    const diff = (similar[i].date.getTime() - similar[i - 1].date.getTime()) / 86_400_000
    intervals.push(diff)
  }
  const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length

  let frequency: 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'yearly' | null = null
  if (avgInterval < 9) frequency = 'weekly'
  else if (avgInterval < 20) frequency = 'biweekly'
  else if (avgInterval < 45) frequency = 'monthly'
  else if (avgInterval < 120) frequency = 'quarterly'
  else if (avgInterval < 400) frequency = 'yearly'

  if (!frequency) return false

  const nextDue = new Date(txn.date.getTime() + avgInterval * 86_400_000)

  await db.insert(recurringTransactions).values({
    accountId: txn.accountId,
    name: txn.description,
    amount: avgAmount,
    currency: txn.currency,
    type: txn.type,
    frequency,
    startDate: similar[0].date,
    nextDueDate: nextDue,
    autoDetected: true,
    toleranceAmount: 0,
    toleranceDays: 3,
    status: 'pending_confirmation',
    createdAt: new Date(),
  })
  return true
}
