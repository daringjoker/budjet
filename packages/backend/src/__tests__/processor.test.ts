import { describe, it, expect, vi } from 'vitest'
import { createDb } from '../db/index.js'
import { accounts, rawEmails, transactions } from '@budjet/shared/schema'
import { Processor } from '../pipeline/processor.js'

describe('Processor', () => {
  it('saves raw_email with status=unknown for unknown sender', async () => {
    const db = createDb(':memory:')
    const knownSenders = new Map([['alerts@nmb.com.np', { name: 'NMB Bank', currency: 'NPR' }]])
    const mockPool = { run: vi.fn() }
    const processor = new Processor(db, knownSenders, mockPool as any, 0.85)

    await processor.process({
      messageId: 'msg-1',
      sender: 'unknown@random.com',
      subject: 'Hello',
      bodyText: 'spam',
      receivedAt: new Date(),
    })

    const emails = await db.select().from(rawEmails)
    expect(emails).toHaveLength(1)
    expect(emails[0].status).toBe('unknown')
    expect(mockPool.run).not.toHaveBeenCalled()
  })

  it('saves raw_email with status=processed and inserts transaction for known sender', async () => {
    const db = createDb(':memory:')
    const [acct] = await db.insert(accounts).values({
      name: 'NMB Savings', type: 'bank', emailSender: 'alerts@nmb.com.np',
      currency: 'NPR', initialBalance: 0, createdAt: new Date()
    }).returning()

    const knownSenders = new Map([['alerts@nmb.com.np', { name: 'NMB Bank', currency: 'NPR', accountId: acct.id }]])
    const mockPool = {
      run: vi.fn()
        .mockResolvedValueOnce({ type: 'transaction', confidence: 0.95 })
        .mockResolvedValueOnce({ amount: 1500, type: 'debit', description: 'ATM Withdrawal', currency: 'NPR', confidence: 0.92, balance_after: 48500 })
    }

    const processor = new Processor(db, knownSenders, mockPool as any, 0.85)
    await processor.process({
      messageId: 'msg-2',
      sender: 'alerts@nmb.com.np',
      subject: 'Debit Alert',
      bodyText: 'NPR 1500 debited. Balance: NPR 48500.',
      receivedAt: new Date(),
    })

    const emails = await db.select().from(rawEmails)
    expect(emails[0].status).toBe('processed')
    const txns = await db.select().from(transactions)
    expect(txns).toHaveLength(1)
    expect(txns[0].amount).toBe(1500)
    expect(txns[0].balanceAfter).toBe(48500)
    expect(txns[0].llmConfidence).toBe(0.92)
  })

  it('sets status=unknown when LLM classifies as "other"', async () => {
    const db = createDb(':memory:')
    const [acct] = await db.insert(accounts).values({
      name: 'NMB', type: 'bank', emailSender: 'alerts@nmb.com.np',
      currency: 'NPR', initialBalance: 0, createdAt: new Date()
    }).returning()

    const knownSenders = new Map([['alerts@nmb.com.np', { name: 'NMB Bank', currency: 'NPR', accountId: acct.id }]])
    const mockPool = {
      run: vi.fn().mockResolvedValueOnce({ type: 'other', confidence: 0.9 })
    }

    const processor = new Processor(db, knownSenders, mockPool as any, 0.85)
    await processor.process({
      messageId: 'msg-3',
      sender: 'alerts@nmb.com.np',
      subject: 'Your OTP is 123456',
      bodyText: 'Use OTP 123456 to login.',
      receivedAt: new Date(),
    })

    const txns = await db.select().from(transactions)
    expect(txns).toHaveLength(0)
    const emails = await db.select().from(rawEmails)
    expect(emails[0].status).toBe('unknown')
  })

  it('deduplicates: does not insert duplicate message_id', async () => {
    const db = createDb(':memory:')
    const [acct] = await db.insert(accounts).values({
      name: 'NMB', type: 'bank', emailSender: 'alerts@nmb.com.np',
      currency: 'NPR', initialBalance: 0, createdAt: new Date()
    }).returning()

    const knownSenders = new Map([['alerts@nmb.com.np', { name: 'NMB Bank', currency: 'NPR', accountId: acct.id }]])
    const mockPool = {
      run: vi.fn()
        .mockResolvedValue({ type: 'transaction', confidence: 0.95 })
        .mockResolvedValue({ amount: 500, type: 'debit', description: 'Coffee', currency: 'NPR', confidence: 0.9 })
    }

    const processor = new Processor(db, knownSenders, mockPool as any, 0.85)
    const email = { messageId: 'dup-1', sender: 'alerts@nmb.com.np', subject: 'Debit', bodyText: 'NPR 500', receivedAt: new Date() }
    await processor.process(email)
    await processor.process(email) // same messageId

    const emails = await db.select().from(rawEmails)
    expect(emails).toHaveLength(1) // only one inserted
  })
})
