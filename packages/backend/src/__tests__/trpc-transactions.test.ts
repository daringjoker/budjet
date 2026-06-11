import { describe, it, expect } from 'vitest'
import { createDb } from '../db/index.js'
import { createCaller } from '../trpc/router.js'
import { accounts } from '@budjet/shared/schema'

async function seedAccount(db: ReturnType<typeof createDb>) {
  const [acct] = await db.insert(accounts).values({ name: 'NMB', type: 'bank', currency: 'NPR', initialBalance: 0, createdAt: new Date() }).returning()
  return acct
}

describe('transactions router', () => {
  it('creates a manual transaction and lists it', async () => {
    const db = createDb(':memory:')
    const acct = await seedAccount(db)
    const caller = createCaller({ db })

    await caller.transactions.create({
      accountId: acct.id,
      date: new Date().toISOString(),
      amount: 500,
      type: 'debit',
      description: 'Coffee',
      currency: 'NPR',
      source: 'manual',
    })

    const list = await caller.transactions.list({ accountId: acct.id })
    expect(list).toHaveLength(1)
    expect(list[0].description).toBe('Coffee')
  })

  it('review updates description and marks llm_confidence as null', async () => {
    const db = createDb(':memory:')
    const acct = await seedAccount(db)
    const caller = createCaller({ db })

    const txn = await caller.transactions.create({
      accountId: acct.id,
      date: new Date().toISOString(),
      amount: 1000,
      type: 'debit',
      description: 'Unknown merchant',
      currency: 'NPR',
      source: 'email',
      llmConfidence: 0.6,
    })

    await caller.transactions.review({ id: txn.id, description: 'Netflix', llmConfidence: null })
    const updated = await caller.transactions.list({ accountId: acct.id })
    expect(updated[0].description).toBe('Netflix')
    expect(updated[0].llmConfidence).toBeNull()
  })

  it('update changes amount and description', async () => {
    const db = createDb(':memory:')
    const acct = await seedAccount(db)
    const caller = createCaller({ db })

    const txn = await caller.transactions.create({
      accountId: acct.id,
      date: new Date().toISOString(),
      amount: 200,
      type: 'debit',
      description: 'Snacks',
      currency: 'NPR',
      source: 'manual',
    })

    const updated = await caller.transactions.update({ id: txn.id, amount: 250, description: 'Lunch' })
    expect(updated.amount).toBe(250)
    expect(updated.description).toBe('Lunch')
  })
})
