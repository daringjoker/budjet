import { describe, it, expect, vi } from 'vitest'
import { ImapWatcher } from '../imap/watcher.js'

describe('ImapWatcher', () => {
  it('emits "email" event when IDLE notifies of new message', async () => {
    const existsHandlers: Function[] = []
    const mockClient = {
      connect: vi.fn().mockResolvedValue(undefined),
      mailboxOpen: vi.fn().mockResolvedValue({ exists: 0 }),
      idle: vi.fn().mockResolvedValue(undefined),
      fetch: vi.fn().mockImplementation(async function* () {
        yield {
          uid: 1,
          envelope: {
            messageId: 'test-msg-id',
            subject: 'Transaction Alert',
            from: [{ address: 'bank@test.com' }],
            date: new Date('2026-01-01'),
          },
          source: Buffer.from(
            'From: bank@test.com\r\nSubject: Transaction Alert\r\nContent-Type: text/plain\r\n\r\nYou spent NPR 500'
          ),
          flags: new Set<string>(),
        }
      }),
      on: vi.fn().mockImplementation((event: string, handler: Function) => {
        if (event === 'exists') existsHandlers.push(handler)
      }),
      logout: vi.fn().mockResolvedValue(undefined),
    }

    const watcher = new ImapWatcher(
      { host: 'imap.test.com', user: 'u', password: 'p', port: 993 },
      mockClient as any
    )

    const emails: unknown[] = []
    watcher.on('email', (e) => emails.push(e))

    await watcher.connect()

    // Simulate IDLE "exists" event (new message arrived)
    expect(existsHandlers.length).toBeGreaterThan(0)
    await existsHandlers[0]({ count: 1, prevCount: 0 })

    expect(emails).toHaveLength(1)
    expect((emails[0] as any).messageId).toBe('test-msg-id')
    expect((emails[0] as any).sender).toBe('bank@test.com')
    expect((emails[0] as any).bodyText).toBe('You spent NPR 500')
  })

  it('does not emit for existing messages (count === prevCount)', async () => {
    const existsHandlers: Function[] = []
    const mockClient = {
      connect: vi.fn().mockResolvedValue(undefined),
      mailboxOpen: vi.fn().mockResolvedValue({ exists: 5 }),
      idle: vi.fn().mockResolvedValue(undefined),
      fetch: vi.fn(),
      on: vi.fn().mockImplementation((event: string, handler: Function) => {
        if (event === 'exists') existsHandlers.push(handler)
      }),
      logout: vi.fn().mockResolvedValue(undefined),
    }

    const watcher = new ImapWatcher(
      { host: 'imap.test.com', user: 'u', password: 'p', port: 993 },
      mockClient as any
    )

    await watcher.connect()
    await existsHandlers[0]({ count: 5, prevCount: 5 })

    expect(mockClient.fetch).not.toHaveBeenCalled()
  })
})
