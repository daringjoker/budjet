import { and, eq, gte, sql } from 'drizzle-orm'
import { transactions, recurringTransactions } from '@budjet/shared/schema'
import type { Db } from '../db/index.js'
import type { Transaction } from '@budjet/shared/schema'

const LOOKBACK_DAYS = 90
const MIN_OCCURRENCES = 3
const AMOUNT_TOLERANCE = 0.1 // 10%

export async function detectRecurring(db: Db, txn: Transaction) {
  if (!txn.description) return

  const since = new Date(Date.now() - LOOKBACK_DAYS * 86_400_000)

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

  if (similar.length < MIN_OCCURRENCES) return

  const amounts = similar.map(t => t.amount)
  const avgAmount = amounts.reduce((a, b) => a + b, 0) / amounts.length
  const withinTolerance = amounts.every(a => Math.abs(a - avgAmount) / avgAmount <= AMOUNT_TOLERANCE)
  if (!withinTolerance) return

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

  if (!frequency) return

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
    toleranceAmount: avgAmount * AMOUNT_TOLERANCE,
    toleranceDays: 3,
    status: 'pending_confirmation',
    createdAt: new Date(),
  })
}
