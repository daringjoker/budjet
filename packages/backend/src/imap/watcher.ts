import { EventEmitter } from 'events'
import { ImapFlow, type ImapFlowOptions } from 'imapflow'
import { extractEmailText } from './extract.js'

export interface EmailEvent {
  messageId: string
  sender: string
  subject: string
  bodyText: string
  receivedAt: Date
}

const MAX_RECONNECT_ATTEMPTS = 10

export class ImapWatcher extends EventEmitter {
  private client: ImapFlow
  private reconnectDelay = 1000
  private stopped = false
  private consecutiveFailures = 0

  constructor(
    private readonly cfg: { host: string; user: string; password: string; port: number },
    clientOverride?: ImapFlow
  ) {
    super()
    this.client = clientOverride ?? new ImapFlow({
      host: cfg.host,
      port: cfg.port,
      secure: true,
      auth: { user: cfg.user, pass: cfg.password },
      logger: false,
    } as ImapFlowOptions)
  }

  async connect() {
    await this.client.connect()
    await this.client.mailboxOpen('INBOX')
    this.consecutiveFailures = 0

    this.client.on('exists', async (data: { count: number; prevCount: number }) => {
      if (data.count > data.prevCount) {
        await this.fetchUnseen()
      }
    })

    this.client.on('error', (err: Error) => {
      if (!this.stopped) this.scheduleReconnect()
    })

    await this.client.idle()
  }

  private async fetchUnseen() {
    try {
      let fetched = 0
      for await (const msg of this.client.fetch('1:*', {
        uid: true,
        envelope: true,
        source: true,
        flags: true,
      })) {
        if (msg.flags?.has('\\Seen')) continue
        // bodyParts TEXT is unreliable for multipart/HTML mail — parse the full source
        const bodyText = msg.source ? await extractEmailText(msg.source) : ''
        const event: EmailEvent = {
          messageId: msg.envelope?.messageId ?? `${msg.uid}`,
          sender: msg.envelope?.from?.[0]?.address ?? '',
          subject: msg.envelope?.subject ?? '',
          bodyText,
          receivedAt: msg.envelope?.date ?? new Date(),
        }
        this.emit('email', event)
        fetched++
      }
      if (fetched > 0) {
        console.log(`[IMAP] Fetched ${fetched} unseen email(s)`)
      }
    } catch (err) {
      this.emit('error', err)
    }
  }

  private scheduleReconnect() {
    if (this.consecutiveFailures >= MAX_RECONNECT_ATTEMPTS) {
      this.emit('error', new Error(`IMAP unreachable after ${MAX_RECONNECT_ATTEMPTS} attempts`))
      return
    }
    const attempt = this.consecutiveFailures + 1
    console.log(`[IMAP] Reconnect attempt ${attempt}/${MAX_RECONNECT_ATTEMPTS} in ${this.reconnectDelay}ms`)
    setTimeout(async () => {
      try {
        this.reconnectDelay = Math.min(this.reconnectDelay * 2 + Math.random() * 1000, 60_000)
        await this.connect()
        this.reconnectDelay = 1000
      } catch {
        this.consecutiveFailures++
        this.scheduleReconnect()
      }
    }, this.reconnectDelay)
  }

  async stop() {
    this.stopped = true
    await this.client.logout()
  }
}
