import { describe, it, expect, vi } from 'vitest'
import { EmailQueue } from '../queue/email-queue.js'

function makeEmail(id: string) {
  return { messageId: id, sender: 's', subject: 's', bodyText: 'b', receivedAt: new Date() }
}

describe('EmailQueue', () => {
  it('calls consumer with pushed items in order', async () => {
    const queue = new EmailQueue({ maxSize: 10 })
    const processed: string[] = []

    queue.consume(async (email) => { processed.push(email.messageId) })
    queue.push(makeEmail('a'))
    queue.push(makeEmail('b'))

    await new Promise(r => setTimeout(r, 50))
    expect(processed).toEqual(['a', 'b'])
  })

  it('drops oldest item when full (backpressure)', () => {
    const queue = new EmailQueue({ maxSize: 2 })
    const dropped: string[] = []
    queue.on('dropped', (e) => dropped.push(e.messageId))

    queue.push(makeEmail('1'))
    queue.push(makeEmail('2'))
    queue.push(makeEmail('3'))

    expect(dropped).toEqual(['1'])
  })

  it('emits error when consumer throws', async () => {
    const queue = new EmailQueue({ maxSize: 10 })
    const errors: unknown[] = []
    queue.on('error', (e) => errors.push(e))

    queue.consume(async () => { throw new Error('consumer failed') })
    queue.push(makeEmail('x'))

    await new Promise(r => setTimeout(r, 50))
    expect(errors).toHaveLength(1)
  })
})
