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
    private readonly cfg: { host: string; user: string; password: string; port: number; senders?: string[] },
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

  /**
   * Connect and watch. When `catchUp` is given, first fetches every message
   * from the listed senders since the given date (deduped downstream by
   * message-id), so mail received while the app was down is never missed.
   */
  async connect(catchUp?: { since: Date; senders: string[] }) {
    await this.client.connect()
    await this.client.mailboxOpen('INBOX')
    this.consecutiveFailures = 0

    if (catchUp) {
      await this.fetchSince(catchUp.since, catchUp.senders)
    }

    this.client.on('exists', async (data: { count: number; prevCount: number }) => {
      if (data.count > data.prevCount) {
        await this.fetchUnseen()
      }
    })

    this.client.on('error', (err: Error) => {
      if (!this.stopped) this.scheduleReconnect()
    })

    // Start IDLE without blocking — idle() only resolves when the IDLE
    // session ends, and ImapFlow re-enters idle automatically after commands.
    void this.client.idle().catch((err: Error) => {
      if (!this.stopped) this.emit('error', err)
    })
  }

  private async fetchSince(since: Date, senders: string[]) {
    try {
      let fetched = 0
      for (const sender of senders) {
        const uids = await this.client.search({ from: sender, since }, { uid: true })
        const uidList = Array.isArray(uids) ? uids : []
        if (uidList.length === 0) continue
        for await (const msg of this.client.fetch(
          uidList.join(','),
          { uid: true, envelope: true, source: true },
          { uid: true }
        )) {
          const bodyText = msg.source ? await extractEmailText(msg.source) : ''
          this.emit('email', {
            messageId: msg.envelope?.messageId ?? `uid-${msg.uid}`,
            sender: msg.envelope?.from?.[0]?.address ?? sender,
            subject: msg.envelope?.subject ?? '',
            bodyText,
            receivedAt: msg.envelope?.date ?? new Date(),
          } satisfies EmailEvent)
          fetched++
        }
      }
      console.log(`[IMAP] Catch-up since ${since.toISOString().slice(0, 10)}: ${fetched} email(s) queued (duplicates are skipped downstream)`)
    } catch (err) {
      this.emit('error', err)
    }
  }

  private async fetchUnseen() {
    try {
      let fetched = 0
      // Restrict to known senders when configured — fetching the whole unseen
      // inbox is expensive and floods the pipeline with irrelevant mail.
      const senders = this.cfg.senders?.length ? this.cfg.senders : [undefined]
      for (const sender of senders) {
        const uids = await this.client.search(
          sender ? { seen: false, from: sender } : { seen: false },
          { uid: true }
        )
        const uidList = Array.isArray(uids) ? uids : []
        if (uidList.length === 0) continue
        for await (const msg of this.client.fetch(
          uidList.join(','),
          { uid: true, envelope: true, source: true },
          { uid: true }
        )) {
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
