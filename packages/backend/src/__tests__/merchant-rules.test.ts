import { describe, it, expect } from 'vitest'
import { createDb } from '../db/index.js'
import { accounts, transactions, merchantRules, transactionCategories, categories } from '@budjet/shared/schema'
import { matchRule, applyRuleToExisting } from '../pipeline/merchant-rules.js'

const RULE = (over: Partial<typeof merchantRules.$inferSelect> = {}) => ({
  id: 1,
  pattern: 'esewa load 9701427255',
  merchant: 'My eSewa',
  categoryId: null,
  createdAt: new Date(),
  ...over,
})

describe('matchRule', () => {
  it('matches case-insensitively against remarks', () => {
    expect(matchRule([RULE()], 'eSewa Load 9701427255, 270959748', 'eSewa Load')).toMatchObject({ merchant: 'My eSewa' })
  })

  it('matches against description when remarks are empty', () => {
    expect(matchRule([RULE({ pattern: 'esewa load' })], null, 'eSewa Load')).toMatchObject({ merchant: 'My eSewa' })
  })

  it('returns null when nothing matches', () => {
    expect(matchRule([RULE()], 'IBFT transfer', 'Transfer')).toBeNull()
  })
})

describe('applyRuleToExisting', () => {
  it('tags matching transactions with merchant and category', async () => {
    const db = createDb(':memory:')
    const [acct] = await db.insert(accounts).values({
      name: 'Bank', type: 'bank', currency: 'NPR', initialBalance: 0, createdAt: new Date(),
    }).returning()
    const [cat] = await db.insert(categories).values({ name: 'Wallet', color: '#fff' }).returning()

    const mk = (description: string, remarks: string | null) =>
      db.insert(transactions).values({
        accountId: acct.id, date: new Date(), amount: 100, type: 'debit',
        description, remarks, source: 'manual', createdAt: new Date(),
      }).returning()

    const [hit1] = await mk('eSewa Load', 'eSewa Load 9701427255, 1')
    const [hit2] = await mk('esewa load 9701427255 again', null)
    const [miss] = await mk('Coffee', 'cafe remark')

    const [rule] = await db.insert(merchantRules).values({
      pattern: 'eSewa Load 9701427255', merchant: 'My eSewa', categoryId: cat.id, createdAt: new Date(),
    }).returning()

    const applied = await applyRuleToExisting(db, rule)
    expect(applied).toBe(2)

    const all = await db.select().from(transactions)
    expect(all.find(t => t.id === hit1.id)?.merchant).toBe('My eSewa')
    expect(all.find(t => t.id === hit2.id)?.merchant).toBe('My eSewa')
    expect(all.find(t => t.id === miss.id)?.merchant).toBeNull()

    const joins = await db.select().from(transactionCategories)
    expect(joins).toHaveLength(2)
    expect(joins.every(j => j.categoryId === cat.id)).toBe(true)
  })
})
