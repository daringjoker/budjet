import 'dotenv/config'
import { loadConfig } from './config/index.js'
import { createDb } from './db/index.js'
import { ImapWatcher } from './imap/watcher.js'
import { EmailQueue } from './queue/email-queue.js'
import { LLMPool } from './llm/pool.js'
import { Processor } from './pipeline/processor.js'
import { startTRPCServer } from './trpc/server.js'
import { Scheduler } from './scheduler/index.js'
import { runNightlyForecast } from './scheduler/forecast.js'
import { ensureDefaultCategories } from './pipeline/categories.js'
import { accounts, rawEmails } from '@budjet/shared/schema'
import { sql } from 'drizzle-orm'

process.on('unhandledRejection', (reason) => {
  console.error('[FATAL] Unhandled rejection:', reason)
  process.exit(1)
})

process.on('uncaughtException', (err) => {
  console.error('[FATAL] Uncaught exception:', err)
  process.exit(1)
})

async function main() {
  const config = loadConfig()
  const db = createDb(config.db.url)

  // Build known-senders map from config + DB accounts
  const dbAccounts = await db.select().from(accounts)
  const knownSenders = new Map(
    config.banks.map(b => {
      // A bank may alert from several addresses; match by sender, then bank name
      const dbAcct = dbAccounts.find(a => a.emailSender === b.sender) ?? dbAccounts.find(a => a.name === b.name)
      return [b.sender.toLowerCase(), { name: b.name, currency: b.currency, accountId: dbAcct?.id }]
    })
  )

  await ensureDefaultCategories(db)

  // On-demand pool: the model loads on the first job and unloads after idle
  const pool = new LLMPool({ workerCount: config.llm.workerThreads, modelPath: config.llm.modelPath })

  const processor = new Processor(db, knownSenders, pool, config.llm.confidenceThreshold)
  const queue = new EmailQueue({ maxSize: 200 })
  const watcher = new ImapWatcher({ ...config.imap, senders: config.banks.map(b => b.sender) })

  queue.consume(email => processor.process(email))
  queue.on('dropped', e => console.warn('[QUEUE] Dropped email:', e.messageId))
  queue.on('error', err => console.error('[QUEUE] Consumer error:', err))

  watcher.on('email', email => queue.push(email))
  watcher.on('error', err => console.error('[IMAP]', err))

  // Catch up on anything received while the app was down (1-day overlap;
  // duplicates are dropped by message-id downstream)
  const [{ lastReceived }] = await db
    .select({ lastReceived: sql<number | null>`max(received_at)` })
    .from(rawEmails)
  const since = lastReceived
    ? new Date(lastReceived * 1000 - 86_400_000)
    : new Date(Date.now() - 7 * 86_400_000)

  await watcher.connect({ since, senders: config.banks.map(b => b.sender) })
  console.log('[IMAP] Watching inbox via IDLE...')

  const server = startTRPCServer(db, config.server.port, {
    forecastLookbackDays: config.budget.forecastLookbackDays,
  })

  const scheduler = new Scheduler()
  scheduler.daily(2, () => runNightlyForecast(db, config.budget.forecastLookbackDays))
  console.log('[SCHEDULER] Nightly forecast scheduled at 02:00')

  let shuttingDown = false
  const shutdown = async (signal: string) => {
    if (shuttingDown) return
    shuttingDown = true
    console.log(`[SHUTDOWN] Received ${signal}, shutting down...`)
    try {
      scheduler.stop()
      server.close()
      await watcher.stop()
      await pool.shutdown()
      process.exit(0)
    } catch (err) {
      console.error('[SHUTDOWN] Error during shutdown:', err)
      process.exit(1)
    }
  }

  process.on('SIGTERM', () => void shutdown('SIGTERM'))
  process.on('SIGINT', () => void shutdown('SIGINT'))
}

main().catch((err) => {
  console.error('[FATAL] Startup failed:', err)
  process.exit(1)
})
