import { describe, it, expect } from 'vitest'
import { createDb } from '../db/index.js'
import { accounts } from '@budjet/shared/schema'

describe('db', () => {
  it('creates tables and allows insert/select', async () => {
    const db = createDb(':memory:')
    const [inserted] = await db.insert(accounts).values({
      name: 'Test Account',
      type: 'cash',
      currency: 'NPR',
      initialBalance: 1000,
      createdAt: new Date(),
    }).returning()
    expect(inserted.id).toBeDefined()
    expect(inserted.name).toBe('Test Account')
  })
})
