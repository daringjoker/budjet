import { EventEmitter } from 'events'
import type { EmailEvent } from '../imap/watcher.js'

export class EmailQueue extends EventEmitter {
  private queue: EmailEvent[] = []
  private consumer: ((e: EmailEvent) => Promise<void>) | null = null
  private processing = false
  private readonly maxSize: number

  constructor({ maxSize = 100 }: { maxSize?: number } = {}) {
    super()
    this.maxSize = maxSize
  }

  push(email: EmailEvent) {
    if (this.queue.length >= this.maxSize) {
      const dropped = this.queue.shift()!
      this.emit('dropped', dropped)
    }
    this.queue.push(email)
    this.drain()
  }

  consume(fn: (e: EmailEvent) => Promise<void>) {
    this.consumer = fn
    this.drain()
  }

  private async drain() {
    if (this.processing || !this.consumer || this.queue.length === 0) return
    this.processing = true
    while (this.queue.length > 0 && this.consumer) {
      const email = this.queue.shift()!
      try {
        await this.consumer(email)
      } catch (err) {
        this.emit('error', err)
      }
    }
    this.processing = false
  }
}
