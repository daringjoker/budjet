import { describe, it, expect } from 'vitest'
import { createDb } from '../db/index.js'
import { createCaller } from '../trpc/router.js'
import { accounts, categories, transactions } from '@budjet/shared/schema'

describe('budgets router', () => {
  it('creates a budget and returns progress', async () => {
    const db = createDb(':memory:')
    const caller = createCaller({ db })
    const [acct] = await db.insert(accounts).values({ name: 'Cash', type: 'cash', currency: 'NPR', initialBalance: 0, createdAt: new Date() }).returning()
    const [cat] = await db.insert(categories).values({ name: 'Food', color: '#ef4444' }).returning()

    const [txn] = await db.insert(transactions).values({ accountId: acct.id, date: new Date(), amount: 3000, type: 'debit', description: 'Groceries', currency: 'NPR', source: 'manual', createdAt: new Date() }).returning()

    const budget = await caller.budgets.create({
      name: 'June Food Budget',
      categoryId: cat.id,
      accountId: acct.id,
      amount: 10000,
      period: 'monthly',
      startDate: new Date(2026, 5, 1).toISOString(),
    })

    expect(budget.id).toBeDefined()

    // Before assigning category: spent should be 0 (no categorized transactions)
    const progressBefore = await caller.budgets.progress({ id: budget.id })
    expect(progressBefore.spent).toBe(0)

    // After assigning category: spent should be 3000
    await caller.categories.assignToTransaction({ transactionId: txn.id, categoryId: cat.id })
    const progress = await caller.budgets.progress({ id: budget.id })
    expect(progress.budgetAmount).toBe(10000)
    expect(progress.spent).toBe(3000)
    expect(progress.remaining).toBe(7000)
  })
})
