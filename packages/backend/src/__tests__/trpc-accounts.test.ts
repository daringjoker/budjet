import { describe, it, expect } from 'vitest'
import { createDb } from '../db/index.js'
import { createCaller } from '../trpc/router.js'

describe('accounts router', () => {
  it('creates and lists accounts', async () => {
    const db = createDb(':memory:')
    const caller = createCaller({ db })

    await caller.accounts.create({
      name: 'NMB Savings',
      type: 'bank',
      bankName: 'NMB Bank',
      emailSender: 'alerts@nmb.com.np',
      currency: 'NPR',
      initialBalance: 50000,
    })

    const list = await caller.accounts.list()
    expect(list).toHaveLength(1)
    expect(list[0].name).toBe('NMB Savings')
    expect(list[0].initialBalance).toBe(50000)
  })
})
