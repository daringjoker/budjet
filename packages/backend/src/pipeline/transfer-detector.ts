import { eq, and, gte, lte, ne, isNull } from 'drizzle-orm'
import { transactions } from '@budjet/shared/schema'
import type { Db } from '../db/index.js'
import type { Transaction } from '@budjet/shared/schema'

const WINDOW_MS = 24 * 60 * 60 * 1000

/**
 * Scan for an unlinked counterpart transaction that would form the other leg
 * of a bank-to-bank transfer: opposite type, same amount, different account,
 * within ±24 hours. Returns the closest-in-time match, or null.
 */
export async function findTransferCounterpart(db: Db, txn: Transaction): Promise<Transaction | null> {
  const counterType: 'debit' | 'credit' = txn.type === 'debit' ? 'credit' : 'debit'
  const from = new Date(txn.date.getTime() - WINDOW_MS)
  const to = new Date(txn.date.getTime() + WINDOW_MS)

  const candidates = await db
    .select()
    .from(transactions)
    .where(and(
      eq(transactions.type, counterType),
      eq(transactions.amount, txn.amount),
      ne(transactions.accountId, txn.accountId),
      gte(transactions.date, from),
      lte(transactions.date, to),
      isNull(transactions.linkedTransactionId),
    ))

  if (candidates.length === 0) return null
  return candidates.sort((a, b) =>
    Math.abs(a.date.getTime() - txn.date.getTime()) - Math.abs(b.date.getTime() - txn.date.getTime())
  )[0]
}

/** Bidirectionally link two transactions as the two legs of a transfer. */
export async function linkTransactions(db: Db, idA: number, idB: number) {
  await db.update(transactions).set({ linkedTransactionId: idB }).where(eq(transactions.id, idA))
  await db.update(transactions).set({ linkedTransactionId: idA }).where(eq(transactions.id, idB))
}
